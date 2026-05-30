import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "@/lib/dynamodb";
import { ADMIN_SESSION_COOKIE, readCookieValue, verifyAdminSessionToken } from "@/lib/admin-auth";

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CloudChangelogArticles";

function isAuthorized(req: Request) {
  const token = readCookieValue(req.headers.get("cookie"), ADMIN_SESSION_COOKIE);
  return verifyAdminSessionToken(token);
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { Items } = await db.send(new ScanCommand({
      TableName: TABLE_NAME,
    }));

    const items = Items || [];
    const comments = items.filter((item) => item.itemType === "comment");
    const metrics = items.filter((item) => item.itemType === "metric" && typeof item.metricType === "string");

    const landingSessions = new Set(
      metrics
        .filter((item) => item.metricType === "session_start")
        .map((item) => (typeof item.sessionId === "string" ? item.sessionId : ""))
        .filter((sessionId) => sessionId.length > 0)
    );

    const sessionDurations = metrics
      .filter((item) => item.metricType === "session_end" && Number.isFinite(item.durationSeconds))
      .map((item) => Number(item.durationSeconds));

    const averageTimeSpentSeconds =
      sessionDurations.length > 0
        ? Math.round(sessionDurations.reduce((sum, value) => sum + value, 0) / sessionDurations.length)
        : 0;

    return NextResponse.json({
      totalLandings: landingSessions.size,
      averageTimeSpentSeconds,
      totalComments: comments.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
