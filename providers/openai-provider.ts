// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { OCRProvider, OpenAIPayload, OllamaPayload, LmstudioPayload, DEFAULT_PROMPT_TEXT } from "../types";
import { requestUrl } from "obsidian";
import { parseJsonResponse } from "../utils/format";
import type { PreparedImage } from "../types";

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

  async process(images: PreparedImage[], prompt: string): Promise<string> {
    let payload: OpenAIPayload | OllamaPayload | LmstudioPayload;
    let endpoint = this.endpoint;

    const base64Images = images.map(img =>
      img.base64.replace(/^data:image\/\w+;base64,/, "")
    );

    if (this.provider === "ollama") {
      payload = {
        model: this.model,
        messages: [
          {
            role: "user",
            content: prompt,
            images: base64Images,
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
            content: [
              { type: "text", text: "You are an AI assistant that analyzes images." }
            ]
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...images.map((img) => ({
                type: "image_url",
                image_url: {
                  url: `data:${img.mime};base64,${img.base64}`,
                },
              })),
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
              ...images.map((img) => ({
                type: "image_url",
                image_url: {
                  url: `data:${img.mime};base64,${img.base64}`,
                },
              })),
              {
                type: "text",
                text: prompt,
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

      const data = parseJsonResponse(response, (d) =>
        this.provider === "ollama"
          ? !!d.message?.content
          : Array.isArray(d.choices)
      );

      const content =
        this.provider === "ollama"
          ? data.message?.content?.trim()
          : data.choices?.[0]?.message?.content?.trim();

      if (content) return content;

      console.warn(`${this.provider} response did not contain expected text:`, data);
      return "";
    } catch (err) {
      console.error(`${this.provider} fetch error:`, err);
      return "";
    }
  }

  async extractTextFromBase64(image: string): Promise<string | null> {
    const prepared: PreparedImage = {
      name: "image.jpg",
      base64: image,
      mime: "image/jpeg",
      size: image.length * 0.75,
      source: "inline",
    };
    return await this.process([prepared], this.prompt);
  }

}
