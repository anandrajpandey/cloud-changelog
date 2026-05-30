import { NextResponse } from "next/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "@/lib/dynamodb";

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CloudChangelogArticles";

function isArticleRecord(item: Record<string, unknown>) {
  if (item.itemType === "metric" || item.itemType === "comment") {
    return false;
  }

  return typeof item.slug === "string" && item.slug.length > 0 && typeof item.title === "string" && item.title.length > 0;
}

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
      Array.isArray(value) ? value.filter((url) => typeof url === "string" && isUsableImageUrl(url)) : [],
    ])
  ) as Record<string, string[]>;
}

function cleanSections(sections: Array<Record<string, unknown>>, imageMap: Record<string, string[]>) {
  return sections.map((section) => {
    const sectionId = typeof section.id === "string" ? section.id : "";
    const usableSectionImages = Array.isArray(section.images)
      ? section.images.filter((url) => typeof url === "string" && isUsableImageUrl(url))
      : [];

    return {
      ...section,
      images: usableSectionImages.length > 0 ? usableSectionImages : imageMap[sectionId] || [],
    };
  });
}

function imageCount(article: Record<string, unknown>) {
  const map = article.images && typeof article.images === "object" ? cleanImageMap(article.images as Record<string, string[]>) : {};
  return Object.values(map).reduce((count, images) => count + (Array.isArray(images) ? images.length : 0), 0);
}

function articleScore(article: Record<string, unknown>) {
  const publishedAt = typeof article.publishedAt === "string" ? new Date(article.publishedAt).getTime() : 0;
  return publishedAt + imageCount(article) * 10_000_000;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const slug = (await params).slug;
    const { Items } = await db.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "SlugIndex",
      KeyConditionExpression: "slug = :slug",
      ExpressionAttributeValues: {
        ":slug": slug,
      },
    }));

    if (!Items || Items.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const article = [...Items]
      .map((item) => item as Record<string, unknown>)
      .filter(isArticleRecord)
      .sort((a, b) => articleScore(b) - articleScore(a))[0];

    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const imageMap = article.images && typeof article.images === "object" ? cleanImageMap(article.images as Record<string, string[]>) : {};

    const enrichedArticle = {
      ...article,
      images: imageMap,
      sections: Array.isArray(article.sections) ? cleanSections(article.sections as Array<Record<string, unknown>>, imageMap) : article.sections,
    };

    return NextResponse.json({ article: enrichedArticle });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
