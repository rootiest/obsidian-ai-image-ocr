import type { OCRProvider, PreparedImage } from "../types";

export async function processSingleImage(
  provider: OCRProvider,
  base64: string,
  mime: string = "image/jpeg",
  prompt: string = "What does this say?"
): Promise<string> {
  const image: PreparedImage = {
    name: "image.jpg",
    base64,
    mime,
    size: base64.length * 0.75,
    source: "inline",
  };

  if (provider.process) {
    return await provider.process([image], prompt);
  } else {
    const result = await provider.extractTextFromBase64(base64);
    return result ?? "";
  }
}

