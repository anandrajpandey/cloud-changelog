import { NextResponse } from "next/server";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "@/lib/dynamodb";

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CloudChangelogArticles";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const eventType = normalizeText(data.eventType);
    const visitorId = normalizeText(data.visitorId);
    const path = normalizeText(data.path);
    const sessionId = normalizeText(data.sessionId);

    if (!eventType || !visitorId || !sessionId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const metric = {
      id: crypto.randomUUID(),
      itemType: "metric" as const,
      metricType: eventType,
      visitorId,
      sessionId,
      path,
      durationSeconds: normalizeNumber(data.durationSeconds),
      createdAt: new Date().toISOString(),
    };

    await db.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: metric,
    }));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { Items } = await db.send(new ScanCommand({
      TableName: TABLE_NAME,
    }));

    const metrics = (Items || []).filter((item) => item.itemType === "metric");
    return NextResponse.json({ metrics });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
