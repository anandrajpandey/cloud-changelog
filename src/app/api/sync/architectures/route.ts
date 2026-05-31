import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "@/lib/dynamodb";
import { generateContentWithFallback } from "@/lib/gemini";

function getGeminiApiKey() {
  return process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
}

function getAi() {
  const apiKey = getGeminiApiKey();
  return new GoogleGenAI({ apiKey });
}
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CloudChangelogArticles";

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
    sections.find((section) => /about|overview|architecture|how it works|impact|update/i.test(`${section.title || ""} ${section.id || ""}`)) ||
    sections[0];

  if (primarySection?.id) {
    imageMap[primarySection.id] = [uniqueUrls[0]];
  }

  return imageMap;
}

async function fetchSourceImages(sourceUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

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

async function resolveSourceUrl(title: string) {
  const queries = [
    `site:aws.amazon.com/blogs/architecture ${title}`,
    `site:aws.amazon.com ${title}`,
  ];

  for (const query of queries) {
    try {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: { "user-agent": "Mozilla/5.0" },
      });
      if (!res.ok) continue;

      const html = await res.text();
      const match = html.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/i);
      if (!match) continue;

      const href = match[1];
      if (href.includes("uddg=")) {
        const url = new URL(href.startsWith("http") ? href : `https:${href}`);
        const uddg = url.searchParams.get("uddg");
        if (uddg) return decodeURIComponent(uddg);
      }

      return href.startsWith("http") ? href : `https:${href}`;
    } catch {
      continue;
    }
  }

  return "";
}

function normalizeSections(value: unknown, fallback?: Record<string, unknown>) {
  if (Array.isArray(value)) {
    return value
      .map((section, index) => {
        if (!section || typeof section !== "object") return null;
        const typed = section as Record<string, unknown>;
        const title = typeof typed.title === "string" ? typed.title.trim() : "";
        const content = typed.content;
        const images = Array.isArray(typed.images) ? typed.images.map(String).filter((url) => Boolean(url) && isUsableImageUrl(url)) : [];

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

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (
      authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
      authHeader !== "Bearer Initialgamer@2005"
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ai = getAi();
    const prompt = `
      Select a popular, complex software system that relies entirely on AWS.
      Explain the architecture in a flexible, story-driven format. Act as a senior cloud architect.
      Write valid JSON only. Do not wrap the response in markdown.

      Use as many sections as the story needs, and rename or omit sections freely. Do not force fixed labels like "What&apos;s New" or "Before vs After" unless they truly fit.
      Make the aboutUpdate-style explanation the deepest section, ideally 2-4 short paragraphs, with extra detail on components, data flow, AWS services, and architecture decisions.
      If relevant images are available, attach them to the most appropriate section and briefly explain what each image shows.
      Also include a sourceUrl pointing to the official AWS or source page used for the story.

      {
        "title": "Title of the architecture deep dive",
        "slug": "url-friendly-slug-arch",
        "summary": "Short 2 sentence summary of the architecture",
        "aboutUpdate": "The most detailed explanation section",
        "sourceUrl": "Official source URL",
        "sections": [
          {
            "id": "optional-stable-id",
            "title": "Section title",
            "subtitle": "Optional subtitle",
            "content": "Detailed section content",
            "images": ["optional-image-url"]
          }
        ],
        "category": "System Architecture",
        "tags": ["System Design", "AWS", "Infrastructure"]
      }
    `;

    const response = await generateContentWithFallback(ai, prompt);

    const aiText = response.text;
    if (!aiText) return NextResponse.json({ error: "No output" }, { status: 500 });

    let generatedData;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : aiText;
      generatedData = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse Gemini output", aiText);
      return NextResponse.json({ error: "Failed to parse json" }, { status: 500 });
    }

    const sections = normalizeSections(generatedData.sections, generatedData);
    const sourceUrl = generatedData.sourceUrl || (await resolveSourceUrl(generatedData.title || ""));
    const sourceImageMap = sourceUrl ? buildImageMap(sections as Array<{ id?: string; title?: string }>, await fetchSourceImages(sourceUrl)) : {};

    const item = {
      id: crypto.randomUUID(),
      itemType: "article",
      title: generatedData.title,
      slug: generatedData.slug,
      summary: generatedData.summary || "",
      aboutUpdate: generatedData.aboutUpdate || "",
      sections,
      category: generatedData.category || "System Architecture",
      tags: generatedData.tags || [],
      images: {
        ...cleanImageMap((generatedData.images as Record<string, string[]>) || {}),
        ...sourceImageMap,
      },
      sourceUrl,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const { Item } = await db.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: item.id },
      })
    );

    if (!Item) {
      await db.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        })
      );
    }

    return NextResponse.json({ success: true, article: item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Sync Architectures Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
