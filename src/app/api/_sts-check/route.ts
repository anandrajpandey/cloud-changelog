import { NextResponse } from "next/server";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

function getAwsConfig() {
  const accessKeyId = process.env.CLOUDCHANGELOG_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDCHANGELOG_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.CLOUDCHANGELOG_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;
  const region = process.env.CLOUDCHANGELOG_AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || "us-east-1";

  return {
    region,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey, sessionToken } : undefined,
  } as any;
}

export async function GET() {
  const cfg = getAwsConfig();
  const client = new STSClient(cfg);

  try {
    const res = await client.send(new GetCallerIdentityCommand({}));
    const account = res.Account || "";
    const maskedAccount = account ? `****${account.slice(-4)}` : null;
    return NextResponse.json({ ok: true, account: maskedAccount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
