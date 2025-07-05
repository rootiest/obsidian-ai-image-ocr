// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { Editor, EditorPosition, RequestUrlResponse, TFile, Vault, App, Notice, normalizePath } from "obsidian";
import GPTImageOCRPlugin from "../main";
import type { GPTImageOCRSettings } from "../types";
import { FRIENDLY_PROVIDER_NAMES, CollectedImage, PreparedImage, OCRProvider } from "../types";
import { OpenAIProvider } from "../providers/openai-provider";
import { GeminiProvider } from "../providers/gemini-provider";

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
* Resolves a list of markdown-style image links to CollectedImage[] format
*/
export async function collectImageReferences(
  imageLinks: string[],
  vault: Vault
): Promise<CollectedImage[]> {
  const collected: CollectedImage[] = [];

  for (const link of imageLinks) {
    const trimmed = link.trim();

    // Check if it's an external image
    if (/^(https?|data):/.test(trimmed)) {
      collected.push({
        source: trimmed,
        isExternal: true,
      });
      continue;
    }

    // Try to resolve to a local vault file
    try {
      const normalized = normalizePath(trimmed);
      const file = vault.getAbstractFileByPath(normalized);

      if (file instanceof TFile && file.extension.match(/png|jpe?g|webp|gif|bmp|svg/i)) {
        collected.push({
          source: trimmed,
          file,
          isExternal: false,
        });
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

      // Extract name from URL or fallback
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
    return {
      name,
      base64,
      mime,
      size: arrayBuffer.byteLength,
      source: img.source,
    };
  } catch (e) {
    console.error("Failed to prepare image:", img.source, e);
    return null;
  }
}

/**
 * Assigns friendly names to OCR providers based on user settings.
 */
export function getFriendlyProviderNames(settings: GPTImageOCRSettings): Record<GPTImageOCRSettings["provider"], string> {
  return {
    ...FRIENDLY_PROVIDER_NAMES,
    ...(settings.customProviderFriendlyName?.trim()
      ? { "custom": settings.customProviderFriendlyName.trim() }
      : {})
  };
}

/**
 * Moves the editor cursor to the end of the document and scrolls into view.
 */
export function moveCursorToEnd(editor: Editor) {
  requestAnimationFrame(() => {
    const lastLine = editor.lastLine();
    const lastCh = editor.getLine(lastLine)?.length || 0;
    editor.setCursor({ line: lastLine, ch: lastCh });
    scrollEditorToCursor(editor);
  });
}

/**
 * Scrolls the editor view to the current cursor position.
 */
export function scrollEditorToCursor(editor: Editor) {
  try {
    // Check if editor has a `cm` property and that it looks like a CodeMirror editor
    const maybeCM = (editor as Editor & { cm?: unknown }).cm;

    if (
      maybeCM &&
      typeof maybeCM === "object" &&
      "scrollIntoView" in maybeCM &&
      typeof (maybeCM as { scrollIntoView?: unknown }).scrollIntoView === "function"
    ) {
      (maybeCM as { scrollIntoView: (pos: EditorPosition, margin?: number) => void })
        .scrollIntoView(editor.getCursor(), 100);
    }
  } catch (e) {
    console.warn("scrollIntoView failed or is unsupported in this version.", e);
  }
}

/**
 * Parses a JSON API response and validates its structure if a validator is provided.
 */
export function parseJsonResponse(
  response: RequestUrlResponse,
  validator?: (data: any) => boolean
): any {
  try {
    const data = JSON.parse(response.text);
    if (validator && !validator(data)) {
      throw new Error("Response format validation failed.");
    }
    return data;
  } catch (e) {
    console.error("Failed to parse API response:", response.text);
    throw new Error("Invalid JSON or unexpected structure in API response.");
  }
}

/**
 * Replaces {{placeholders}} in a template string with values from a context object.
 * Supports {{date:FORMAT}} for moment.js formatting and any key in the context object.
 * Example: "Extracted at {{date:YYYY-MM-DD}} by {{user}}" with { user: "Alice" }
 */
export function formatTemplate(template: string, context: Record<string, any> = {}): string {
  const getValue = (path: string): any => {
    const parts = path.split(".");
    let value: any = context;
    for (const part of parts) {
      if (value && part in value) {
        value = value[part];
      } else {
        value = undefined;
        break;
      }
    }
    if (value !== undefined) return value;

    // Derived / legacy mappings
    switch (path) {
      case "model.id":
        return context.model?.id ?? context.modelId ?? context.model ?? "";
      case "model.name":
        return context.model?.name ?? context.modelName ?? context.model ?? "";
      case "provider.name":
        return context.provider?.name ?? context.providerName ?? "";
      case "provider.id":
        return context.provider?.id ?? context.providerId ?? context.provider ?? "";
      case "provider.type":
        return context.provider?.type ?? context.providerType ?? "";
      case "image.filename":
        return context.image?.filename ?? context.image?.name ?? "";
      case "image.name": {
        const fname = context.image?.filename ?? context.image?.name ?? "";
        return fname.replace(/\.[^.]*$/, "");
      }
      case "image.extension": {
        const fname = context.image?.filename ?? context.image?.name ?? "";
        const m = fname.match(/\.([^.]+)$/);
        return m ? m[1] : "";
      }
      case "image.path":
        return context.image?.path ?? context.image?.source ?? "";
      case "image.size":
        return context.image?.size ?? "";
      case "image.dimensions":
        if (context.image?.width && context.image?.height) {
          return `${context.image.width}x${context.image.height}`;
        }
        return "";
      case "image.width":
        return context.image?.width ?? "";
      case "image.height":
        return context.image?.height ?? "";
      case "image.created":
        return context.image?.created ?? "";
      case "image.modified":
        return context.image?.modified ?? "";
      case "image.camera.make":
        return context.image?.camera?.make ?? "";
      case "image.camera.model":
        return context.image?.camera?.model ?? "";
      case "image.lens.model":
        return context.image?.lens?.model ?? "";
      case "image.iso":
        return context.image?.iso ?? "";
      case "image.exposure":
        return context.image?.exposure ?? "";
      case "image.aperture":
        return context.image?.aperture ?? "";
      case "image.focalLength":
        return context.image?.focalLength ?? "";
      case "image.orientation":
        return context.image?.orientation ?? "";
      case "image.gps.latitude":
        return context.image?.gps?.latitude ?? "";
      case "image.gps.longitude":
        return context.image?.gps?.longitude ?? "";
      case "image.gps.altitude":
        return context.image?.gps?.altitude ?? "";
      default:
        return "";
    }
  };

  return template.replace(/{{(.*?)}}/g, (_, expr) => {
    expr = expr.trim();
    if (expr.startsWith("date:")) {
      const fmt = expr.slice(5).trim();
      return window.moment ? window.moment().format(fmt) : "";
    }
    if (window.moment && /^[YMDHms\-:/ ]+$/.test(expr)) {
      return window.moment().format(expr);
    }
    const val = getValue(expr);
    return val != null ? String(val) : "";
  });
}

/**
 * Applies all relevant templates (header, footer, per-image, batch) to the OCR result.
 * @param plugin The plugin instance (for settings)
 * @param content The OCR result: string for single, string[] for batch
 * @param context The formatting context object
 * @returns The final formatted string
 */
export function applyFormatting(
  plugin: GPTImageOCRPlugin,
  content: string | string[],
  context: Record<string, any>
): string {
  // Batch mode: context.images is array, content is string[]
  if (Array.isArray(context.images) && Array.isArray(content)) {
    const batchHeader = formatTemplate(plugin.settings.batchHeaderTemplate || "", context);
    const batchFooter = formatTemplate(plugin.settings.batchFooterTemplate || "", context);

    // For each image, apply image header/footer
    const formattedImages = content.map((imgText, i) => {
      const imgContext = {
        ...context,
        image: context.images[i],
        imageIndex: i + 1,
        imageTotal: context.images.length,
      };
      const imgHeader = formatTemplate(plugin.settings.batchImageHeaderTemplate || "", imgContext);
      const imgFooter = formatTemplate(plugin.settings.batchImageFooterTemplate || "", imgContext);
      return [imgHeader, imgText, imgFooter].filter(Boolean).join("");
    });

    return [batchHeader, ...formattedImages, batchFooter].filter(Boolean).join("");
  }

  // Single image mode
  const header = formatTemplate(plugin.settings.headerTemplate || "", context);
  const footer = formatTemplate(plugin.settings.footerTemplate || "", context);
  return [header, content as string, footer].filter(Boolean).join("");
}

/**
 * Handles inserting or saving extracted OCR content based on user settings.
 */
export async function handleExtractedContent(
  plugin: GPTImageOCRPlugin,
  content: string | string[],
  editor: Editor | null,
  context: Record<string, any> = {}
) {
  // Use the new formatting function
  const finalContent = applyFormatting(plugin, content, context);

  const isBatch = Array.isArray(context.images);

  const outputToNewNote = isBatch
    ? plugin.settings.batchOutputToNewNote
    : plugin.settings.outputToNewNote;

  if (!outputToNewNote) {
    if (editor) {
      const cursor = editor.getCursor();
      editor.replaceSelection(finalContent);

      const newPos = editor.offsetToPos(
        editor.posToOffset(cursor) + finalContent.length
      );
      editor.setCursor(newPos);

      scrollEditorToCursor(editor);
    } else {
      new Notice("No active editor to paste into.");
    }
    return;
  }

  const name = formatTemplate(
    isBatch ? plugin.settings.batchNoteNameTemplate : plugin.settings.noteNameTemplate,
    context
  );
  const folder = formatTemplate(
    isBatch ? plugin.settings.batchNoteFolderPath : plugin.settings.noteFolderPath,
    context
  ).trim();
  const path = folder ? `${folder}/${name}.md` : `${name}.md`;

  // Ensure folder exists
  if (folder) {
    const folderExists = plugin.app.vault.getAbstractFileByPath(folder);
    if (!folderExists) {
      try {
        await plugin.app.vault.createFolder(folder);
      } catch (err) {
        new Notice(`Failed to create folder "${folder}".`);
        console.error(err);
        return;
      }
    }
  }

  let file = plugin.app.vault.getAbstractFileByPath(path);

  const appendIfExists = isBatch
    ? plugin.settings.batchAppendIfExists
    : plugin.settings.appendIfExists;

  if (file instanceof TFile) {
    if (appendIfExists) {
      const existing = await plugin.app.vault.read(file);
      const updatedContent = existing + "\n\n" + finalContent;

      await plugin.app.vault.modify(file, updatedContent);
      const leaf = plugin.app.workspace.getLeaf(true);
      await leaf.openFile(file);

      const activeEditor = plugin.app.workspace.activeEditor?.editor;
      if (activeEditor) {
        const pos = activeEditor.offsetToPos(updatedContent.length);
        activeEditor.setCursor(pos);
        scrollEditorToCursor(activeEditor);
      }

      return;
    } else {
      // Create a unique file if not appending
      let base = name;
      let ext = ".md";
      let counter = 1;
      let uniqueName = `${base}${ext}`;
      let uniquePath = folder ? `${folder}/${uniqueName}` : uniqueName;

      while (plugin.app.vault.getAbstractFileByPath(uniquePath)) {
        uniqueName = `${base} ${counter}${ext}`;
        uniquePath = folder ? `${folder}/${uniqueName}` : uniqueName;
        counter++;
      }

      file = await plugin.app.vault.create(uniquePath, finalContent);
    }
  } else {
    try {
      file = await plugin.app.vault.create(path, finalContent);
    } catch (err) {
      new Notice(`Failed to create note at "${path}".`);
      console.error(err);
      return;
    }
  }

  if (!(file instanceof TFile)) return;
  await plugin.app.workspace.getLeaf(true).openFile(file);

  // Move cursor to end after opening the newly created note
  setTimeout(() => {
    const activeEditor = plugin.app.workspace.activeEditor?.editor;
    if (activeEditor) {
      moveCursorToEnd(activeEditor);
    }
  }, 10);
}

/**
 * Finds the most relevant image embed in the selected text, or nearest above cursor.
 */
export function findRelevantImageEmbed(editor: Editor): {
  link: string;
  isExternal: boolean;
  embedType: "internal" | "external";
} | null {
  // 1. Check selection
  const sel = editor.getSelection();
  let match = sel.match(/!\[\[(.+?)\]\]/);
  if (match) {
    const link = match[1].split("|")[0].trim();
    return { link, isExternal: false, embedType: "internal" };
  }
  match = sel.match(/!\[.*?\]\((.+?)\)/);
  if (match) {
    const link = match[1].split(" ")[0].replace(/["']/g, "");
    return {
      link,
      isExternal: /^https?:\/\//i.test(link),
      embedType: "external",
    };
  }

  // 2. Search upward from cursor for embeds
  for (let i = editor.getCursor().line; i >= 0; i--) {
    const line = editor.getLine(i);
    let embedMatch = line.match(/!\[\[(.+?)\]\]/);
    if (embedMatch) {
      const link = embedMatch[1].split("|")[0].trim();
      return { link, isExternal: false, embedType: "internal" };
    }
    embedMatch = line.match(/!\[.*?\]\((.+?)\)/);
    if (embedMatch) {
      const link = embedMatch[1].split(" ")[0].replace(/["']/g, "");
      return {
        link,
        isExternal: /^https?:\/\//i.test(link),
        embedType: "external",
      };
    }
  }
  return null;
}

/**
 * Resolves an internal image path from a short link to a TFile, or null if not found.
 */
export function resolveInternalImagePath(app: App, link: string): TFile | null {
  let file = app.vault.getAbstractFileByPath(link);
  if (file instanceof TFile) return file;
  return app.vault.getFiles().find(f => f.name === link) || null;
}

/**
 * Fetches an external image as an ArrayBuffer, using a CORS proxy if needed.
 */
export async function fetchExternalImageAsArrayBuffer(
  url: string,
): Promise<ArrayBuffer | null> {
  // 1. Try direct fetch
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.arrayBuffer();
  } catch (e) {
    // console.warn("Direct image fetch blocked by CORS, trying proxy…");
    // 2. Try CORS proxy fallback
    try {
      const proxyUrl = `https://corsproxy.rootiest.com/proxy?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} from proxy`);
      return await resp.arrayBuffer();
    } catch (e2) {
      // 3. Notify user to save image to vault
      console.error("Failed to fetch image.");
      new Notice(
        "Failed to fetch image.\n" +
        "If you can see the image in preview, right-click and 'Save image to vault',\n" +
        "then run OCR on the saved copy.",
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
    "",
  );
  return btoa(binary);
}

/**
 * Prompts the user to select an image file and returns it as a File object.
 */
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

/**
 * Prompts the user to select a folder containing image files and returns a file list.
 */
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


/**
  * Get the mime type of an image based on its file extension.
  */
export function getImageMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "bmp": return "image/bmp";
    case "svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}
