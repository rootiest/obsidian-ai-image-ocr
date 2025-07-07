// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { OCRProvider, DEFAULT_PROMPT_TEXT } from "../types";
import { requestUrl } from "obsidian";
import { parseJsonResponse } from "../utils/format";
import type { PreparedImage } from "../types";
import { processSingleImage } from "../utils/ocr";

/**
 * Handles OCR requests to Google Gemini API endpoints.
 */
export class GeminiProvider implements OCRProvider {
  id = "gemini";
  name: string;

  constructor(
    private apiKey: string,
    private model: string = "models/gemini-2.5-flash",
    private prompt: string = DEFAULT_PROMPT_TEXT,
    nameOverride?: string
  ) {
    this.name = nameOverride ?? model.replace(/^models\//, "");
  }

  async process(images: PreparedImage[], prompt: string): Promise<string> {
    try {
      const contents = [
        {
          role: "user",
          parts: [
            ...images.map((img) => ({
              inline_data: {
                mime_type: img.mime,
                data: img.base64,
              },
            })),
            {
              text: prompt,
            },
          ],
        },
      ];

      const response = await requestUrl({
        url: `https://generativelanguage.googleapis.com/v1beta/${this.model}:generateContent?key=${this.apiKey}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contents }),
      });

      const data = parseJsonResponse(response, (d) =>
        Array.isArray(d.candidates) && !!d.candidates[0]?.content?.parts
      );

      const part = data.candidates[0]?.content?.parts?.[0]?.text?.trim();
      if (part) return part;

      console.warn("Gemini response did not contain expected text:", data);
      return "";
    } catch (err) {
      console.error("Gemini fetch error:", err);
      return "";
    }
  }

  async extractTextFromBase64(image: string): Promise<string | null> {
    return await processSingleImage(this, image, "image/jpeg", this.prompt);
  }
}
