import { NextResponse } from "next/server";
import { DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "@/lib/dynamodb";
import { ADMIN_SESSION_COOKIE, readCookieValue, verifyAdminSessionToken } from "@/lib/admin-auth";

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CloudChangelogArticles";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isAuthorized(req: Request) {
  const token = readCookieValue(req.headers.get("cookie"), ADMIN_SESSION_COOKIE);
  return verifyAdminSessionToken(token);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const slug = normalizeText(url.searchParams.get("slug"));
    const commentId = (await params).id;

    if (!commentId) {
      return NextResponse.json({ error: "Missing comment id" }, { status: 400 });
    }

    const { Items } = await db.send(new ScanCommand({
      TableName: TABLE_NAME,
    }));

    const comments = (Items || []).filter(
      (item) => item.itemType === "comment" && (!slug || item.articleSlug === slug),
    ) as Array<{ id: string; parentId?: string | null; itemType?: string; articleSlug?: string }>;

    const childrenByParent = new Map<string, string[]>();
    comments.forEach((comment) => {
      const parentId = normalizeText(comment.parentId);
      if (!parentId) return;
      const list = childrenByParent.get(parentId) || [];
      list.push(comment.id);
      childrenByParent.set(parentId, list);
    });

    const idsToDelete = new Set<string>([commentId]);
    const queue = [commentId];

    while (queue.length > 0) {
      const current = queue.shift() as string;
      const children = childrenByParent.get(current) || [];
      for (const childId of children) {
        if (!idsToDelete.has(childId)) {
          idsToDelete.add(childId);
          queue.push(childId);
        }
      }
    }

    for (const id of idsToDelete) {
      await db.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id },
      }));
    }

    return NextResponse.json({ success: true, deleted: [...idsToDelete] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
