// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import {
  TFile,
} from "obsidian";
import type { OCRProvider, PreparedImage, GPTImageOCRSettings } from "../types";
import { OpenAIProvider } from "../providers/openai-provider";
import { GeminiProvider } from "../providers/gemini-provider";
import { FRIENDLY_PROVIDER_NAMES } from "../types";

/**
 * Constructs an API request for OCR jobs
 */
export async function submitOCRRequest(
  images: PreparedImage[],
  prompt: string,
  providerId: string,
  modelId: string
): Promise<string> {
  let provider: OCRProvider;
  switch (providerId) {
    case "openai":
      provider = new OpenAIProvider("your-api-key", modelId);
      break;
    case "gemini":
      provider = new GeminiProvider("your-api-key", modelId);
      break;
    default:
      throw new Error(`Unsupported provider: ${providerId}`);
  }
  if (provider.process) {
    return await provider.process(images, prompt);
  } else {
    const result = await provider.extractTextFromBase64(images[0].base64);
    return result ?? "";
  }
}

/**
 * Helper used by providers to process a single base64 encoded image
 */
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

/** Assigns friendly names to OCR providers based on user settings */
export function getFriendlyProviderNames(
  settings: GPTImageOCRSettings
): Record<GPTImageOCRSettings["provider"], string> {
  return {
    ...FRIENDLY_PROVIDER_NAMES,
    ...(settings.customProviderFriendlyName?.trim()
      ? { custom: settings.customProviderFriendlyName.trim() }
      : {}),
  };
}

/** Returns the provider type based on the provider ID */
export function getProviderType(providerId: string): "gemini" | "openai" {
  return providerId.startsWith("gemini") ? "gemini" : "openai";
}

/** Builds the OCR context for API requests */
export function buildOCRContext({
  providerId,
  providerName,
  providerType,
  modelId,
  modelName,
  prompt,
  images,
  singleImage,
}: {
  providerId: string;
  providerName: string;
  providerType: string;
  modelId: string;
  modelName: string;
  prompt: string;
  images?: Array<{
    name: string;
    path: string;
    size: number;
    mime: string;
    extension: string;
    width?: number;
    height?: number;
    created?: string;
    modified?: string;
    altText?: string;
    base64?: string;
    file?: TFile; // Add this field
    gps?: { latitude?: number; longitude?: number; altitude?: number };
  }>;
  singleImage?: {
    name: string;
    path: string;
    size: number;
    mime: string;
    extension: string;
    width?: number;
    height?: number;
    created?: string;
    modified?: string;
    altText?: string;
    base64?: string;
    file?: TFile; // Add this field
    gps?: { latitude?: number; longitude?: number; altitude?: number };
  };
}) {
  const base = {
    provider: { id: providerId, name: providerName, type: providerType },
    model: { id: modelId, name: modelName },
    prompt,
  };
  
  if (images && images.length > 1) {
    return {
      ...base,
      images: images.map((img, i) => ({
        name: img.name.replace(/\.[^.]*$/, ""),
        extension: img.extension || img.name.split(".").pop() || "",
        path: img.path,
        size: img.size,
        mime: img.mime,
        width: img.width,
        height: img.height,
        file: img.file, // Include file reference if it exists
        base64: img.base64, // Include base64 if it exists
        index: i + 1,
        total: images.length,
      })),
    };
  } else if (singleImage || (images && images.length === 1)) {
    const image = singleImage || (images && images[0]);
    return {
      ...base,
      image: {
        ...image,
        // No need to explicitly handle the file field as it's now part of the type
      },
    };
  } else {
    return base;
  }
}
