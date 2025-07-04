// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { Editor, EditorPosition, RequestUrlResponse, TFile, App, Notice } from "obsidian";
import GPTImageOCRPlugin from "../main";
import type { GPTImageOCRSettings } from "../types";
import { FRIENDLY_PROVIDER_NAMES } from "../types";

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
 * Handles inserting or saving extracted OCR content based on user settings.
 */
export async function handleExtractedContent(
  plugin: GPTImageOCRPlugin,
  content: string,
  editor: Editor | null,
) {
  const moment = window.moment;

  // Format header (if provided)
  let header = plugin.settings.headerTemplate || "";
  if (header.trim()) {
    header = header.replace(/{{(.*?)}}/g, (_, fmt) =>
      moment().format(fmt.trim()),
    );
    content = header + "\n\n" + content;
  }

  if (!plugin.settings.outputToNewNote) {
    if (editor) {
      const cursor = editor.getCursor();
      editor.replaceSelection(content);

      const newPos = editor.offsetToPos(
        editor.posToOffset(cursor) + content.length
      );
      editor.setCursor(newPos);

      scrollEditorToCursor(editor);
    } else {
      new Notice("No active editor to paste into.");
    }
    return;
  }

  const name = plugin.settings.noteNameTemplate.replace(
    /{{(.*?)}}/g,
    (_, fmt) => moment().format(fmt.trim()),
  );

  const folder = plugin.settings.noteFolderPath
    .replace(/{{(.*?)}}/g, (_, fmt) => moment().format(fmt.trim()))
    .trim();

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

  if (file instanceof TFile) {
    if (plugin.settings.appendIfExists) {
      const existing = await plugin.app.vault.read(file);
      const updatedContent = existing + "\n\n" + content;

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

      file = await plugin.app.vault.create(uniquePath, content);
    }
  } else {
    try {
      file = await plugin.app.vault.create(path, content);
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
