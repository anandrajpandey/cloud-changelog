import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const region =
  process.env.CLOUDCHANGELOG_AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  process.env.AWS_REGION ||
  "us-east-1";

const secretName = process.env.GEMINI_SECRET_NAME || "cloud-changelog/gemini-api-key";

const client = new SecretsManagerClient({ region });

let cachedApiKey: string | null | undefined;
let pendingLookup: Promise<string | null> | null = null;

export async function getGeminiApiKey() {
  if (cachedApiKey !== undefined) {
    return cachedApiKey;
  }

  if (!pendingLookup) {
    pendingLookup = (async () => {
      try {
        const response = await client.send(
          new GetSecretValueCommand({
            SecretId: secretName,
          })
        );

        const secretString = response.SecretString?.trim();
        cachedApiKey = secretString || null;
        return cachedApiKey;
      } catch {
        cachedApiKey = null;
        return null;
      } finally {
        pendingLookup = null;
      }
    })();
  }

  return pendingLookup;
}