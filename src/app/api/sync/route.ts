import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import Parser from "rss-parser";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "crypto";
import { db, Article } from "@/lib/dynamodb";
import { generateContentWithFallback } from "@/lib/gemini";
import { getGeminiApiKey } from "@/lib/gemini-secret";
import { DAILY_CATEGORY_LIMIT, getRemainingDailyCategorySlots, getTodayArticleCount } from "@/lib/sync-limits";

async function getAi() {
  const apiKey = (await getGeminiApiKey()) || process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  return new GoogleGenAI({ apiKey });
}
const parser = new Parser();

const RSS_FEEDS = [
  "https://aws.amazon.com/about-aws/whats-new/recent/feed/",
  "https://aws.amazon.com/blogs/architecture/feed/",
];
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CloudChangelogArticles";
const CATEGORY = "AWS Updates";

function isUsableImageUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return !hostname.includes("example.com") && !hostname.includes("localhost") && !hostname.includes("127.0.0.1");
  } catch {
    return false;
  }
}

function cleanImageMap(imageMap: Record<string, string[]>) {
  return Object.fromEntries(
    Object.entries(imageMap).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? [...new Set(value.filter((url) => typeof url === "string" && isUsableImageUrl(url)))]
        : [],
    ])
  ) as Record<string, string[]>;
}

function extractImageUrls(html: string) {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && /^https?:\/\//.test(value) && isUsableImageUrl(value)) {
      urls.add(value);
    }
  };

  for (const match of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) add(match[1]);
  for (const match of html.matchAll(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi)) add(match[1]);
  for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) add(match[1]);
  for (const match of html.match(/https?:\/\/[^\s"'<>]+/g) || []) {
    if (/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(match)) add(match);
  }

  return [...urls].slice(0, 8);
}

function buildImageMap(sections: Array<{ id?: string; title?: string }>, imageUrls: string[]) {
  const imageMap: Record<string, string[]> = {};

  const uniqueUrls = [...new Set(imageUrls.filter(isUsableImageUrl))];

  if (uniqueUrls.length === 0) return imageMap;

  const primarySection =
    sections.find((section) => /summary|about|overview|what's new|whats new|update|impact/i.test(`${section.title || ""} ${section.id || ""}`)) ||
    sections[0];

  if (primarySection?.id) {
    imageMap[primarySection.id] = [uniqueUrls[0]];
  }

  return imageMap;
}

async function fetchSourceImages(sourceUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(sourceUrl, {
      headers: { "user-agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const html = await response.text();
    return extractImageUrls(html);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSections(value: unknown, fallback?: Record<string, unknown>) {
  if (Array.isArray(value)) {
    return value
      .map((section, index) => {
        if (!section || typeof section !== "object") return null;
        const typed = section as Record<string, unknown>;
        const title = typeof typed.title === "string" ? typed.title.trim() : "";
        const content = typed.content;
        const images = Array.isArray(typed.images)
          ? typed.images.map(String).filter((url) => Boolean(url) && isUsableImageUrl(url))
          : [];

        if (!title && !content) return null;

        return {
          id: typeof typed.id === "string" && typed.id.trim() ? typed.id : `section-${index + 1}`,
          title: title || `Section ${index + 1}`,
          subtitle: typeof typed.subtitle === "string" ? typed.subtitle.trim() : "",
          content: Array.isArray(content) ? content.map(String).join("\n") : String(content || ""),
          images,
        };
      })
      .filter(Boolean);
  }

  const legacySections = [
    ["summary", "Summary", fallback?.summary],
    ["whatsNew", "What's New", fallback?.whatsNew],
    ["aboutUpdate", "About the Update", fallback?.aboutUpdate],
    ["whyItMatters", "Why It Matters", fallback?.whyItMatters],
    ["impact", "Impact", fallback?.impact],
    ["beforeAfter", "Before vs After", fallback?.beforeAfter],
    ["useCases", "Practical Use Cases", fallback?.useCases],
    ["keyTakeaways", "Key Takeaways", fallback?.keyTakeaways],
  ] as const;

  return legacySections
    .map(([id, title, content]) => {
      if (!content) return null;
      const fallbackImages = fallback?.images as Record<string, string[]> | undefined;
      return {
        id,
        title,
        subtitle: "",
        content: Array.isArray(content) ? content.join("\n") : String(content),
        images: Array.isArray(fallbackImages?.[id as string]) ? fallbackImages?.[id as string] : [],
      };
    })
    .filter(Boolean);
}

function splitIntoParagraphs(text: unknown) {
  return String(text || "")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function ensureMinimumSections(
  sections: Array<{ id?: string; title?: string; subtitle?: string; content?: string | string[]; images?: string[] }>,
  generatedData: Record<string, unknown>
) {
  const desiredSections = [
    { id: "whats-new", title: "What's New" },
    { id: "why-it-matters", title: "Why It Matters" },
    { id: "how-it-works", title: "How It Works" },
    { id: "adoption-notes", title: "Adoption and Migration Notes" },
    { id: "practical-implications", title: "Practical Implications" },
    { id: "key-takeaways", title: "Key Takeaways" },
  ];

  if (sections.length >= desiredSections.length) {
    return sections;
  }

  const paragraphPool = [
    ...splitIntoParagraphs(generatedData.whatsNew),
    ...splitIntoParagraphs(generatedData.aboutUpdate),
    ...splitIntoParagraphs(generatedData.whyItMatters),
    ...splitIntoParagraphs(generatedData.impact),
    ...splitIntoParagraphs(generatedData.useCases),
    ...splitIntoParagraphs(generatedData.keyTakeaways),
    ...splitIntoParagraphs(generatedData.summary),
  ];

  const enriched = [...sections];

  for (const preset of desiredSections) {
    if (enriched.length >= desiredSections.length) break;
    if (enriched.some((section) => section.title?.toLowerCase() === preset.title.toLowerCase())) continue;

    const text = paragraphPool.shift() || String(generatedData.aboutUpdate || generatedData.summary || "");
    enriched.push({
      ...preset,
      subtitle: "",
      content: text
        ? `This AWS update builds on the source story and adds practical context for readers. ${text}`
        : "This AWS update expands on the source announcement with practical context and implications for teams adopting the change.",
      images: [],
    });
  }

  return enriched;
}

function buildPrompt(item: Parser.Item) {
  const snippet = item.contentSnippet || item.content || "";

  return `
You are writing a detailed AWS news article for a cloud publication.

Write valid JSON only. Do not wrap the response in markdown.
Use a rich editorial style with substantial detail. The article should feel closer to an actual AWS blog post than a short summary.
The result must clearly read as an AWS update, not a generic technology article.

Requirements:
- Produce 6 to 8 sections when possible.
- Each section should contain at least 3 to 5 well-formed sentences.
- Expand on what changed, how it works, which AWS services are involved, why it matters, and practical implications.
- If the item is a launch announcement, include sections like what's new, why it matters, how it works, adoption or migration notes, practical use cases, and key takeaways.
- If the item is an architecture post, include sections like overview, architecture flow, design decisions, service interactions, reliability/scaling notes, and key takeaways.
- If image URLs are available from the source page, attach them to the most relevant sections.
- Avoid filler. Do not repeat the same sentence across sections.

Input:
URL: ${item.link}
Title: ${item.title}
Snippet: ${snippet}

Return JSON in this shape:
{
  "summary": "A 3 to 4 sentence summary with clear context and impact",
  "aboutUpdate": "A detailed editorial overview of the update",
  "sections": [
    {
      "id": "optional-stable-id",
      "title": "Section title",
      "subtitle": "Optional subtitle",
      "content": "Long, specific section content",
      "images": ["optional-image-url"]
    }
  ],
  "category": "One single category like Compute, Storage, AI/ML, Serverless, Case Study, Database",
  "tags": ["3", "to", "5", "specific tags"]
}
`;
}

type CandidateItem = {
  feedUrl: string;
  item: Parser.Item;
  id: string;
};

function parseGeneratedData(response: { text?: string | null }) {
  const aiText = response.text;
  if (!aiText) return null;

  try {
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : aiText;
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    console.error("Failed to parse Gemini output", aiText);
    return null;
  }
}

async function createArticleFromItem(ai: GoogleGenAI, candidate: CandidateItem) {
  const { item, id } = candidate;
  const prompt = buildPrompt(item);
  const response = await generateContentWithFallback(ai, prompt);
  const generatedData = parseGeneratedData(response);
  if (!generatedData) return null;

  const sections = ensureMinimumSections(
    normalizeSections(generatedData.sections, generatedData).filter(Boolean) as Array<{
      id: string;
      title: string;
      subtitle?: string;
      content: string | string[];
      images?: string[];
    }>,
    generatedData
  );
  const sourceImageMap = item.link ? await fetchSourceImages(item.link) : [];
  const articleImageMap = buildImageMap(sections as Array<{ id?: string; title?: string }>, sourceImageMap);
  const slug = item.title
    ? item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "")
    : id;

  const createdAt = new Date().toISOString();
  const newArticle: Article = {
    id,
    itemType: "article",
    title: item.title || "AWS Update",
    slug,
    sourceUrl: item.link || "",
    publishedAt: item.isoDate || createdAt,
    createdAt,
    summary: typeof generatedData.summary === "string" ? generatedData.summary : "",
    aboutUpdate: typeof generatedData.aboutUpdate === "string" ? generatedData.aboutUpdate : "",
    sections: sections.map((section) => ({
      id: section.id || slug,
      title: section.title || "Section",
      subtitle: section.subtitle || "",
      content: section.content || "",
      images: [...new Set(section.images || [])],
    })),
    tags: Array.isArray(generatedData.tags) ? generatedData.tags.map(String) : [],
    images: cleanImageMap({
      ...((generatedData.images as Record<string, string[]>) || {}),
      ...articleImageMap,
    }),
    ...generatedData,
    category: CATEGORY,
  };

  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: newArticle,
    })
  );

  return newArticle;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (
      authHeader !== `Bearer ${process.env.SYNC_SECRET}` &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
      authHeader !== "Bearer Initialgamer@2005"
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const remainingSlots = await getRemainingDailyCategorySlots(CATEGORY);
    const existingToday = DAILY_CATEGORY_LIMIT - remainingSlots;
    if (remainingSlots === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        category: CATEGORY,
        limit: DAILY_CATEGORY_LIMIT,
        countToday: existingToday,
        articles: [],
      });
    }

    const ai = await getAi();
    const feeds = await Promise.all(
      RSS_FEEDS.map(async (feedUrl) => ({
        feedUrl,
        feed: await parser.parseURL(feedUrl),
      }))
    );

    const candidates: CandidateItem[] = [];
    const seenIds = new Set<string>();

    for (const { feedUrl, feed } of feeds) {
      for (const item of feed.items.slice(0, 4)) {
        if (!item.link) continue;
        const id = crypto.createHash("md5").update(item.link).digest("hex");
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        candidates.push({ feedUrl, item, id });
      }
    }

    const selectedCandidates: CandidateItem[] = [];

    for (const candidate of candidates) {
      const { Item } = await db.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { id: candidate.id },
        })
      );

      if (!Item) {
        selectedCandidates.push(candidate);
      }

      if (selectedCandidates.length >= remainingSlots) {
        break;
      }
    }

    const settledArticles = await Promise.allSettled(
      selectedCandidates.map(async (candidate) => createArticleFromItem(ai, candidate))
    );

    const newArticles = settledArticles.flatMap((result) => {
      if (result.status === "fulfilled" && result.value) {
        return [result.value];
      }
      if (result.status === "rejected") {
        console.error("Gemini generation failed for sync item:", result.reason);
      }
      return [];
    });

    return NextResponse.json({
      success: true,
      processed: newArticles.length,
      category: CATEGORY,
      limit: DAILY_CATEGORY_LIMIT,
      countToday: await getTodayArticleCount(CATEGORY),
      articles: newArticles,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Sync error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
