import { NextResponse } from "next/server";
import { PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "@/lib/dynamodb";
import { ADMIN_SESSION_COOKIE, readCookieValue, verifyAdminSessionToken } from "@/lib/admin-auth";

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CloudChangelogArticles";

function isAuthorized(req: Request) {
  const token = readCookieValue(req.headers.get("cookie"), ADMIN_SESSION_COOKIE);
  return verifyAdminSessionToken(token);
}

function slugify(text: string) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')            // Replace spaces with -
    .replace(/[^\w\-]+/g, '')        // Remove all non-word chars
    .replace(/\-\-+/g, '-')          // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

function normalizeToArray(v: unknown) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return [];
}

function normalizeSections(value: unknown, fallback?: Record<string, unknown>) {
  const fallbackImages =
    fallback && typeof fallback.images === "object" && fallback.images !== null
      ? (fallback.images as Record<string, string[]>)
      : {};

  if (Array.isArray(value)) {
    return value
      .map((section, index) => {
        if (!section || typeof section !== "object") return null;
        const typed = section as Record<string, unknown>;
        const title = typeof typed.title === "string" ? typed.title.trim() : "";
        const content = typed.content;
        const images = Array.isArray(typed.images) ? normalizeToArray(typed.images) : [];

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
      return {
        id,
        title,
        subtitle: "",
        content: Array.isArray(content) ? content.join("\n") : String(content),
        images: Array.isArray(fallbackImages[id as string]) ? fallbackImages[id as string] : [],
      };
    })
    .filter(Boolean);
}

function sectionsToImagesMap(sections: ReturnType<typeof normalizeSections>) {
  return sections.reduce<Record<string, string[]>>((acc, section) => {
    if (section?.images?.length) {
      acc[section.id] = section.images;
    }
    return acc;
  }, {});
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();
    
    // In production, verify the admin session or token here.
    
    const id = crypto.randomUUID();
    const slug = slugify(data.title) + "-" + id.substring(0, 6);
    
    const sections = normalizeSections(data.sections, data);

    const item = {
      id,
      itemType: "article",
      title: data.title,
      slug: slug,
      summary: data.summary || "",
      sections,
      whatsNew: data.whatsNew || "",
      aboutUpdate: data.aboutUpdate || "",
      whyItMatters: data.whyItMatters || "",
      impact: data.impact || "",
      beforeAfter: data.beforeAfter || "",
      useCases: normalizeToArray(data.useCases),
      keyTakeaways: normalizeToArray(data.keyTakeaways),
      category: data.category || "News",
      sourceUrl: data.sourceUrl || "",
      images: data.images || sectionsToImagesMap(sections),
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      tags: ["Manual"],
    };

    await db.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }));

    return NextResponse.json({ success: true, article: item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();
    
    // Admin editing a post
    const { Item } = await db.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: data.id },
    }));

    if (!Item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const sections = normalizeSections(data.sections, Item as Record<string, unknown>);

    const updatedItem = {
      ...Item,
      title: data.title,
      summary: data.summary || Item.summary,
      sections,
      whatsNew: data.whatsNew || Item.whatsNew,
      aboutUpdate: data.aboutUpdate || Item.aboutUpdate,
      whyItMatters: data.whyItMatters || Item.whyItMatters,
      impact: data.impact || Item.impact,
      beforeAfter: data.beforeAfter || Item.beforeAfter,
      useCases: data.useCases ? normalizeToArray(data.useCases) : Item.useCases,
      keyTakeaways: data.keyTakeaways ? normalizeToArray(data.keyTakeaways) : Item.keyTakeaways,
      category: data.category || Item.category,
      sourceUrl: data.sourceUrl || Item.sourceUrl,
      images: data.images || sectionsToImagesMap(sections) || Item.images || {},
    };

    await db.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: updatedItem,
    }));

    return NextResponse.json({ success: true, article: updatedItem });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();

    if (!data?.id) {
      return NextResponse.json({ error: "Missing article id" }, { status: 400 });
    }

    const { Item } = await db.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: data.id },
    }));

    if (!Item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id: data.id },
    }));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
