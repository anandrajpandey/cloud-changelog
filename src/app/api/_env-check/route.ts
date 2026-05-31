import { NextResponse } from "next/server";

export async function GET() {
  const hasSyncSecret = Boolean(process.env.SYNC_SECRET);
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const hasDynamoCreds = Boolean(
    (process.env.CLOUDCHANGELOG_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) &&
      (process.env.CLOUDCHANGELOG_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY)
  );
  const region =
    process.env.CLOUDCHANGELOG_AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || null;

  return NextResponse.json({ hasSyncSecret, hasGeminiKey, hasDynamoCreds, region });
}
