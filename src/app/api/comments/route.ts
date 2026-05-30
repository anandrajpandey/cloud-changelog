import { NextResponse } from "next/server";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "@/lib/dynamodb";

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CloudChangelogArticles";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = normalizeText(url.searchParams.get("slug"));

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const { Items } = await db.send(new ScanCommand({
      TableName: TABLE_NAME,
    }));

    const comments = (Items || [])
      .filter((item) => item.itemType === "comment" && item.articleSlug === slug)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return NextResponse.json({ comments });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const articleSlug = normalizeText(data.articleSlug);
    const content = normalizeText(data.content);
    const name = normalizeText(data.name);
    const parentId = normalizeText(data.parentId);
    const anonymous = Boolean(data.anonymous);

    if (!articleSlug || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const comment = {
      id: crypto.randomUUID(),
      itemType: "comment" as const,
      articleSlug,
      parentId: parentId || null,
      name: anonymous ? "" : (name || "Guest"),
      anonymous,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: comment,
    }));

    return NextResponse.json({ success: true, comment });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
