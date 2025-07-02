// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { RequestUrlResponse } from "obsidian";

export interface GPTImageOCRSettings {
  provider:
  | "openai"
  | "openai-mini"
  | "openai-4.1"
  | "openai-4.1-mini"
  | "openai-4.1-nano"
  | "gemini"
  | "gemini-lite"
  | "gemini-pro"
  | "ollama"
  | "lmstudio"
  | "custom";
  openaiApiKey: string;
  geminiApiKey: string;
  ollamaUrl: string;
  ollamaModel: string;
  lmstudioUrl: string;
  lmstudioModel: string;
  customProviderFriendlyName?: string;
  customApiUrl: string;
  customApiModel: string;
  customApiKey: string;
  customPrompt: string;
  outputToNewNote: boolean;
  noteFolderPath: string;
  noteNameTemplate: string;
  appendIfExists: boolean;
  headerTemplate: string;
}

export const DEFAULT_PROMPT_TEXT =
  "Extract only the raw text from this image. Do not add commentary or explanations. Do not prepend anything. Return only the transcribed text in markdown format. Do not put a markdown codeblock around the returned text.";

export const FRIENDLY_PROVIDER_NAMES: Record<GPTImageOCRSettings["provider"], string> = {
  "openai": "OpenAI GPT-4o",
  "openai-mini": "OpenAI GPT-4o Mini",
  "openai-4.1": "OpenAI GPT-4.1",
  "openai-4.1-mini": "OpenAI GPT-4.1 Mini",
  "openai-4.1-nano": "OpenAI GPT-4.1 Nano",
  "gemini": "Google Gemini 2.5 Flash",
  "gemini-lite": "Google Gemini 2.5 Flash-Lite Preview 06-17",
  "gemini-pro": "Google Gemini 2.5 Pro",
  "ollama": "Ollama",
  "lmstudio": "LMStudio",
  "custom": "Custom Provider"
};

export const DEFAULT_SETTINGS: GPTImageOCRSettings = {
  provider: "openai",
  openaiApiKey: "",
  geminiApiKey: "",
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: "llama3.2-vision",
  lmstudioUrl: 'http://localhost:1234',
  lmstudioModel: "google/gemma-3-4b",
  customProviderFriendlyName: "Custom Provider",
  customApiUrl: "",
  customApiModel: "",
  customApiKey: "",
  customPrompt: "",
  outputToNewNote: false,
  noteFolderPath: "",
  noteNameTemplate: "Extracted OCR {{YYYY-MM-DD HH-mm-ss}}",
  appendIfExists: false,
  headerTemplate: "",
};

export interface OCRProvider {
  id: string;
  name: string;
  extractTextFromBase64(image: string): Promise<string | null>;
}

export type GeminiPayload = {
  contents: Array<{
    role: "user" | "model";
    parts: Array<
      | {
        inline_data: {
          mime_type: string;
          data: string;
        };
      }
      | {
        text: string;
      }
    >;
  }>;
};

export type OpenAIPayload = {
  model: string;
  messages: Array<{
    role: string;
    content: Array<any>;
  }>;
  max_tokens: number;
};

export type OllamaPayload = {
  model: string;
  messages: Array<{
    role: string;
    content: string;
    images: string[];
  }>;
  max_tokens: number;
  stream: boolean;
};

export type LmstudioPayload = {
  model: string;
  messages: Array<{
    role: string;
    content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;
  } | {
    role: string;
    content: string;
  }>;
  max_tokens: number;
};
