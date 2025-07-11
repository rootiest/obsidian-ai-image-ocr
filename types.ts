// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { TFile } from "obsidian";

export interface GPTImageOCRSettings {
  providerType: "openai" | "gemini";
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

  // Single image settings
  customPrompt: string;
  outputToNewNote: boolean;
  noteFolderPath: string;
  noteNameTemplate: string;
  appendIfExists: boolean;
  headerTemplate: string;
  footerTemplate: string;

  // Batch image settings (add these)
  batchCustomPrompt: string;
  batchOutputToNewNote: boolean;
  batchNoteFolderPath: string;
  batchNoteNameTemplate: string;
  batchAppendIfExists: boolean;
  batchHeaderTemplate: string;
  batchImageHeaderTemplate: string; // Optional header for each image in batch
  batchImageFooterTemplate: string; // Optional footer for each image in batch
  batchFooterTemplate: string;

  ollamaModelFriendlyName?: string;
  lmstudioModelFriendlyName?: string;
  customModelFriendlyName?: string;
  debugMode: boolean;
}

export const DEFAULT_PROMPT_TEXT =
  "Extract only the raw text from this image. Do not add commentary or explanations. Do not prepend anything. Return only the transcribed text in markdown format. Do not put a markdown codeblock around the returned text.";

export const DEFAULT_BATCH_PROMPT_TEXT =
  "Extract only the raw text from each image. Do not add commentary or explanations. Do not prepend anything. Return only the transcribed text in markdown format for each image. Do not put a markdown codeblock around the returned text.";

export const FRIENDLY_PROVIDER_NAMES: Record<GPTImageOCRSettings["provider"], string> = {
  "openai": "OpenAI",
  "openai-mini": "OpenAI",
  "openai-4.1": "OpenAI",
  "openai-4.1-mini": "OpenAI",
  "openai-4.1-nano": "OpenAI",
  "gemini": "Google",
  "gemini-lite": "Google",
  "gemini-pro": "Google",
  "ollama": "Ollama",
  "lmstudio": "LMStudio",
  "custom": "Custom Provider"
};

export const FRIENDLY_MODEL_NAMES: Record<string, string> = {
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-4.1-mini": "GPT-4.1 Mini",
  "gpt-4.1-nano": "GPT-4.1 Nano",
  "llama3.2-vision": "Llama 3.2 Vision",
  "gemma3": "Gemma 3",
  "gemini-2.5-flash": "Gemini Flash 2.5",
  "models/gemini-2.5-flash": "Gemini Flash 2.5",
  "models/gemini-2.5-flash-lite-preview-06-17": "Gemini Flash-Lite Preview 06-17",
  "models/gemini-2.5-pro": "Gemini Pro 2.5",
  // Add more as needed
};

export const DEFAULT_SETTINGS: GPTImageOCRSettings = {
  providerType: "openai",
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
  noteFolderPath: "OCR Notes",
  noteNameTemplate: "Extracted OCR {{YYYY-MM-DD HH-mm-ss}}",
  appendIfExists: false,
  headerTemplate: "",
  footerTemplate: "",

  // Batch image settings
  batchCustomPrompt: "",
  batchOutputToNewNote: false,
  batchNoteFolderPath: "OCR Notes",
  batchNoteNameTemplate: "Batch OCR {{YYYY-MM-DD HH-mm-ss}}",
  batchAppendIfExists: false,
  batchHeaderTemplate: "",
  batchImageHeaderTemplate: "",
  batchImageFooterTemplate: "",
  batchFooterTemplate: "",

  ollamaModelFriendlyName: "",
  lmstudioModelFriendlyName: "",
  customModelFriendlyName: "",
  debugMode: false,
};


export interface OCRProvider {
  id: string;
  name: string;
  // Legacy single-image handler (still used by some commands)
  extractTextFromBase64(image: string): Promise<string | null>;
  // Multi-image + prompt handler (used by batch and prompt-aware workflows)
  process?(images: PreparedImage[], prompt: string): Promise<string>;
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

export interface CollectedImage {
  source: string; // The original markdown/image link
  file?: TFile;   // If it's a local vault file
  isExternal: boolean;
}

export interface PreparedImage {
  name: string;
  base64: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  source: string; // original source path or URL
}

export interface OCRFormatContext {
  provider?: string;
  providerName?: string;
  model?: string;
  prompt?: string;
  image?: {
    name?: string;
    path?: string;
    size?: number;
    mime?: string;
    [key: string]: any;
  };
  note?: {
    name?: string;
    path?: string;
    folder?: string;
    [key: string]: any;
  };
  [key: string]: any; // for extensibility
}

