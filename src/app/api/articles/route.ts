import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "@/lib/dynamodb";

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CloudChangelogArticles";

function isArticleRecord(item: Record<string, unknown>) {
  if (item.itemType === "metric" || item.itemType === "comment") {
    return false;
  }

  return typeof item.slug === "string" && item.slug.length > 0 && typeof item.title === "string" && item.title.length > 0;
}

export async function GET() {
  try {
    const { Items } = await db.send(new ScanCommand({
      TableName: TABLE_NAME,
    }));

    const articles = (Items || [])
      .map((item) => item as Record<string, unknown>)
      .filter(isArticleRecord)
      .sort((a, b) => {
        const right = typeof b.publishedAt === "string" ? new Date(b.publishedAt).getTime() : 0;
        const left = typeof a.publishedAt === "string" ? new Date(a.publishedAt).getTime() : 0;
        return right - left;
      });

    return NextResponse.json({ articles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
