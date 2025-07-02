// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { OCRProvider, OpenAIPayload, OllamaPayload, LmstudioPayload, DEFAULT_PROMPT_TEXT } from "../types";
import { requestUrl } from "obsidian";
import { parseJsonResponse } from "../utils/helpers";

/**
 * Handles OCR requests to OpenAI-compatible, Ollama, or LMStudio endpoints.
 */
export class OpenAIProvider implements OCRProvider {
  id: string;
  name: string;

  constructor(
    private apiKey: string,
    private model: string = "gpt-4o",
    private endpoint: string = "https://api.openai.com/v1/chat/completions",
    private provider: "openai" | "ollama" | "lmstudio" = "openai",
    private prompt: string = DEFAULT_PROMPT_TEXT,
    nameOverride?: string
  ) {
    this.id = provider;
    this.name = nameOverride ?? model;
  }

  async extractTextFromBase64(image: string): Promise<string | null> {
    let payload: OpenAIPayload | OllamaPayload | LmstudioPayload;
    let endpoint = this.endpoint;

    if (this.provider === "ollama") {
      // Remove any data: prefix for base64 image
      const cleanImage = image.replace(/^data:image\/\w+;base64,/, "");
      payload = {
        model: this.model,
        messages: [
          {
            role: "user",
            content: this.prompt,
            images: [cleanImage],
          },
        ],
        max_tokens: 1024,
        stream: false,
      };
      endpoint = (this.endpoint ?? "http://localhost:11434") + "/api/chat";
    } else if (this.provider === "lmstudio") {
      payload = {
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an AI assistant that analyzes images."
          },
          {
            role: "user",
            content: [
              { type: "text", text: this.prompt, },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
            ]
          }
        ],
        max_tokens: 1024,
      };
      endpoint = (this.endpoint ?? "http://localhost:1234") + "/api/v0/chat/completions";
    } else {
      payload = {
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${image}` },
              },
              {
                type: "text",
                text: this.prompt,
              },
            ],
          },
        ],
        max_tokens: 1024,
      };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.provider === "openai") {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await requestUrl({
        url: endpoint,
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (this.provider === "ollama") {
        // The response is { message: { role, content } }
        const data = parseJsonResponse(response, d => !!d.message?.content);
        const content = data.message?.content?.trim();
        if (content) return content;
        console.warn("Ollama response did not contain expected text:", data);
        return null;
      } else {
        // OpenAI style response
        const data = parseJsonResponse(response, d => Array.isArray(d.choices));
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) return content;
        console.warn(`${this.provider} response did not contain expected text:`, data);
        return null;
      }
    } catch (err) {
      console.error(`${this.provider} fetch error:`, err);
      return null;
    }
  }
}