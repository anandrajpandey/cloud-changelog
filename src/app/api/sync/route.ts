import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import Parser from "rss-parser";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { db, Article } from "@/lib/dynamodb";
import crypto from "crypto";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const parser = new Parser();

const RSS_FEEDS = [
  "https://aws.amazon.com/about-aws/whats-new/recent/feed/",
  "https://aws.amazon.com/blogs/architecture/feed/"
];
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CloudChangelogArticles";

function normalizeSections(value: unknown, fallback?: Record<string, unknown>) {
  if (Array.isArray(value)) {
    return value
      .map((section, index) => {
        if (!section || typeof section !== "object") return null;
        const typed = section as Record<string, unknown>;
        const title = typeof typed.title === "string" ? typed.title.trim() : "";
        const content = typed.content;

        if (!title && !content) return null;

        return {
          id: typeof typed.id === "string" && typed.id.trim() ? typed.id : `section-${index + 1}`,
          title: title || `Section ${index + 1}`,
          subtitle: typeof typed.subtitle === "string" ? typed.subtitle.trim() : "",
          content: Array.isArray(content) ? content.map(String).join("\n") : String(content || ""),
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
      return {
        id,
        title,
        subtitle: "",
        content: Array.isArray(content) ? content.join("\n") : String(content),
      };
    })
    .filter(Boolean);
}

export async function POST(req: Request) {
  try {
    // Verify secret for Lambda auth
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.SYNC_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const newArticles: Article[] = [];

    // Parse each feed
    for (const feedUrl of RSS_FEEDS) {
      const feed = await parser.parseURL(feedUrl);
      
      // Process top 2 from each feed to respect free limits
      for (const item of feed.items.slice(0, 2)) {
        if (!item.link) continue;
        
        const id = crypto.createHash("md5").update(item.link).digest("hex");
        
        // Check if exists
        try {
          const { Item } = await db.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { id },
          }));
          if (Item) continue;
        } catch (error) {
          console.error("DynamoDB Get error:", error);
          throw error instanceof Error ? error : new Error("DynamoDB Get error");
        }

        // Generate content with Gemini
        const prompt = `
        Analyze this AWS announcement or architecture case study and output a JSON object with flexible sections exactly as valid JSON only. Do not wrap it in markdown. Do not invent pricing, performance numbers, or features. Only use the provided details.
        Use as many sections as the story needs, and rename or omit sections freely. Do not force a fixed template like "What's New" or "Why It Matters" unless it genuinely fits the story.
        
        URL: ${item.link}
        Title: ${item.title}
        Content: ${item.contentSnippet || item.content}
        
        Required JSON structure:
        {
          "summary": "3-4 sentence quick summary",
          "sections": [
            {
              "id": "optional-stable-id",
              "title": "Container title",
              "subtitle": "Optional subtitle",
              "content": "The section content"
            }
          ],
          "category": "One single category like Compute, Storage, AI/ML, Serverless, Case Study, Database",
          "tags": ["3", "to", "5", "tags"]
        }
        `;

      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
      });

      const aiText = response.text;
      
      if (!aiText) continue;

      let generatedData;
      try {
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : aiText;
        generatedData = JSON.parse(jsonStr);
      } catch {
          console.error("Failed to parse Gemini output", aiText);
          continue;
      }

      const slug = item.title ? item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : id;

      const newArticle: Article = {
        id,
        itemType: "article",
        title: item.title || "AWS Update",
        slug,
        sourceUrl: item.link,
        publishedAt: item.isoDate || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        summary: generatedData.summary || "",
        sections: normalizeSections(generatedData.sections, generatedData),
        ...generatedData,
      };

      await db.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: newArticle,
      }));

      newArticles.push(newArticle);
    }
   } // end of feed loop

    return NextResponse.json({ success: true, processed: newArticles.length, articles: newArticles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Sync error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

