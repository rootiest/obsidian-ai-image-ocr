// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { normalizePath, TFile, Vault } from "obsidian";
import type { CollectedImage, PreparedImage } from "../types";
import { pluginLog, pluginLogger } from "./log";

/**
 * Resolves a list of markdown-style image links to CollectedImage[] format
 */
export async function collectImageReferences(
  imageLinks: string[],
  vault: Vault
): Promise<CollectedImage[]> {
  pluginLogger(`Collecting references for ${imageLinks.length} links`);
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
      pluginLog(`Failed to resolve image link: ${trimmed} - ${e}`, "warn", true);
    }
  }
  pluginLogger(`Collected ${collected.length} image references`);
  return collected;
}

/**
 * Convert CollectedImage to PreparedImage
 */
export async function prepareImagePayload(
  img: CollectedImage,
  vault: Vault
): Promise<PreparedImage | null> {
  pluginLogger(`Preparing image ${img.source}`);
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
    const result = {
      name,
      base64,
      mime,
      size: arrayBuffer.byteLength,
      width: dims?.width,
      height: dims?.height,
      source: img.source,
    };
    pluginLogger(`Prepared image ${img.source}`);
    return result;
  } catch (e) {
    pluginLog(`Failed to prepare image: ${img.source} - ${e}`, "error", true);
    return null;
  }
}

/**
 * Fetches an external image as an ArrayBuffer, using a CORS proxy if needed.
 */
export async function fetchExternalImageAsArrayBuffer(
  url: string
): Promise<ArrayBuffer | null> {
  pluginLogger(`Fetching external image ${url}`);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    pluginLogger(`Fetched image from source ${url}`);
    return buf;
  } catch (e) {
    try {
      const proxyUrl = `https://corsproxy.rootiest.com/proxy?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} from proxy`);
      const buf = await resp.arrayBuffer();
      pluginLogger(`Fetched image via proxy for ${url}`);
      return buf;
    } catch (e2) {
      pluginLog(`Failed to fetch image: ${e2}`, "error", true);
      pluginLog(
        `Failed to fetch image.`,
        "notice",
        true
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
      pluginLogger(file ? `Selected file ${file.name}` : "No file selected");
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
      const files = input.files || null;
      pluginLogger(files ? `Selected folder with ${files.length} files` : "No folder selected");
      resolve(files);
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

/**
 * Saves a base64 image to the vault
 */
export async function saveBase64ImageToVault(
  vault: Vault,
  base64: string,
  folderPath: string,
  fileName: string,
  mimeType: string = "image/jpeg"
): Promise<TFile | null> {
  pluginLogger(`Saving image ${fileName} to ${folderPath}`);
  try {
    // Remove data URL prefix if present
    let cleanBase64 = base64;
    if (base64.includes(';base64,')) {
      cleanBase64 = base64.split(';base64,')[1];
    }
    
    // Convert base64 to binary array
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    // Ensure folder exists
    if (folderPath) {
      const folderExists = vault.getAbstractFileByPath(folderPath);
      if (!folderExists) {
        await vault.createFolder(folderPath);
      }
    }
    
    // Full path for the file
    const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
    
    // Check if file exists
    let existingFile = vault.getAbstractFileByPath(fullPath);
    if (existingFile instanceof TFile) {
      // File already exists
      return existingFile;
    }
    
    // Create file
    const created = await vault.createBinary(fullPath, bytes.buffer);
    pluginLogger(`Saved image to ${fullPath}`);
    return created;
  } catch (e) {
    pluginLog(`Failed to save image to vault: ${e}`, "error", true);
    return null;
  }
}
