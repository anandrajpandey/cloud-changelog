type GeminiGenerateClient = {
  models: {
    generateContent: (options: { model: string; contents: string }) => Promise<{ text?: string | null }>;
  };
};

export const DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

export async function generateContentWithFallback(
  client: GeminiGenerateClient,
  contents: string,
  models: string[] = DEFAULT_GEMINI_MODELS,
) {
  let lastError: unknown;

  for (const model of models) {
    try {
      const response = await client.models.generateContent({ model, contents });
      if (response.text) {
        return response;
      }
      lastError = new Error(`Gemini model ${model} returned no text`);
    } catch (error) {
      lastError = error;
      console.warn(`Gemini model fallback triggered for ${model}`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All Gemini models failed");
}