// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { normalizePath, TFile, Vault, Notice } from "obsidian";
import type { CollectedImage, PreparedImage } from "../types";

/**
 * Resolves a list of markdown-style image links to CollectedImage[] format
 */
export async function collectImageReferences(
  imageLinks: string[],
  vault: Vault
): Promise<CollectedImage[]> {
  const collected: CollectedImage[] = [];
  for (const link of imageLinks) {
    const trimmed = link.trim();
    if (/^(https?|data):/.test(trimmed)) {
      collected.push({ source: trimmed, isExternal: true });
      continue;
    }
    try {
      const normalized = normalizePath(trimmed);
      const file = vault.getAbstractFileByPath(normalized);
      if (file instanceof TFile && file.extension.match(/png|jpe?g|webp|gif|bmp|svg/i)) {
        collected.push({ source: trimmed, file, isExternal: false });
      }
    } catch (e) {
      console.warn("Failed to resolve image link:", trimmed, e);
    }
  }
  return collected;
}

/**
 * Convert CollectedImage to PreparedImage
 */
export async function prepareImagePayload(
  img: CollectedImage,
  vault: Vault
): Promise<PreparedImage | null> {
  try {
    let arrayBuffer: ArrayBuffer | null;
    let name: string;
    let mime: string;
    if (img.isExternal) {
      arrayBuffer = await fetchExternalImageAsArrayBuffer(img.source);
      if (!arrayBuffer) return null;
      const urlParts = img.source.split("/");
      name = decodeURIComponent(urlParts[urlParts.length - 1]) || "image";
      mime = getImageMimeType(name);
    } else {
      if (!img.file) return null;
      arrayBuffer = await vault.readBinary(img.file);
      name = img.file.name;
      mime = getImageMimeType(name);
    }
    const base64 = arrayBufferToBase64(arrayBuffer);
    const dims = await getImageDimensionsFromArrayBuffer(arrayBuffer);
    return {
      name,
      base64,
      mime,
      size: arrayBuffer.byteLength,
      width: dims?.width,
      height: dims?.height,
      source: img.source,
    };
  } catch (e) {
    console.error("Failed to prepare image:", img.source, e);
    return null;
  }
}

/**
 * Fetches an external image as an ArrayBuffer, using a CORS proxy if needed.
 */
export async function fetchExternalImageAsArrayBuffer(
  url: string
): Promise<ArrayBuffer | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.arrayBuffer();
  } catch (e) {
    try {
      const proxyUrl = `https://corsproxy.rootiest.com/proxy?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} from proxy`);
      return await resp.arrayBuffer();
    } catch (e2) {
      console.error("Failed to fetch image.");
      new Notice(
        "Failed to fetch image.\n" +
          "If you can see the image in preview, right-click and 'Save image to vault',\n" +
          "then run OCR on the saved copy."
      );
      return null;
    }
  }
}

/**
 * Converts an ArrayBuffer to a base64-encoded string.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const binary = new Uint8Array(buffer).reduce(
    (acc, byte) => acc + String.fromCharCode(byte),
    ""
  );
  return btoa(binary);
}

export async function getImageDimensionsFromArrayBuffer(
  buffer: ArrayBuffer
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.width, height: img.height };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Prompt user to select an image file */
export async function selectImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0] || null;
      resolve(file);
    };
    input.click();
  });
}

/** Prompt user to select a folder of images */
export async function selectFolder(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    (input as any).webkitdirectory = true;
    input.onchange = () => {
      resolve(input.files || null);
    };
    input.click();
  });
}

/** Get the mime type of an image based on its file extension */
export function getImageMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
