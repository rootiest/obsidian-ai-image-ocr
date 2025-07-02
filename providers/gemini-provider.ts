// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { OCRProvider, GeminiPayload, DEFAULT_PROMPT_TEXT } from "../types";
import { requestUrl } from "obsidian";
import { parseJsonResponse } from "../utils/helpers";

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

  async extractTextFromBase64(image: string): Promise<string | null> {
    const payload: GeminiPayload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: image,
              },
            },
            {
              text: this.prompt,
            },
          ],
        },
      ],
    };

    try {
      const response = await requestUrl({
        url: `https://generativelanguage.googleapis.com/v1beta/${this.model}:generateContent?key=${this.apiKey}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = parseJsonResponse(response, d => Array.isArray(d.candidates));

      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text.trim();
      }

      console.warn("Gemini response did not contain expected text:", data);
      return null;
    } catch (err) {
      console.error("Gemini fetch error:", err);
      return null;
    }
  }
}