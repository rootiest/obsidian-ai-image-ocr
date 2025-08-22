// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { App, Editor, TFile } from "obsidian";

/**
 * Finds the most relevant image embed in the selected text, or nearest above cursor.
 * Only returns image embeds (png, jpg, jpeg, gif, webp, bmp, svg).
 */
export function findRelevantImageEmbed(editor: Editor): {
  link: string;
  isExternal: boolean;
  embedType: "internal" | "external";
  embedText: string;
} | null {
  const imageExt = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

  const isImage = (link: string) => imageExt.test(link);

  const sel = editor.getSelection();
  let match = sel.match(/!\[\[(.+?)\]\]/);
  if (match) {
    const link = match[1].split("|")[0].trim();
    if (isImage(link)) {
      return { link, isExternal: false, embedType: "internal", embedText: match[0] };
    }
  }
  match = sel.match(/!\[.*?\]\((.+?)\)/);
  if (match) {
    const link = match[1].split(" ")[0].replace(/["']/g, "");
    if (isImage(link)) {
      return { link, isExternal: /^https?:\/\//i.test(link), embedType: "external", embedText: match[0] };
    }
  }
  for (let i = editor.getCursor().line; i >= 0; i--) {
    const line = editor.getLine(i);
    let embedMatch = line.match(/!\[\[(.+?)\]\]/);
    if (embedMatch) {
      const link = embedMatch[1].split("|")[0].trim();
      if (isImage(link)) {
        return { link, isExternal: false, embedType: "internal", embedText: embedMatch[0] };
      }
    }
    embedMatch = line.match(/!\[.*?\]\((.+?)\)/);
    if (embedMatch) {
      const link = embedMatch[1].split(" ")[0].replace(/["']/g, "");
      if (isImage(link)) {
        return { link, isExternal: /^https?:\/\//i.test(link), embedType: "external", embedText: embedMatch[0] };
      }
    }
  }
  return null;
}

/** Resolve an internal image path from a short link to a TFile using MetadataCache */
export function resolveInternalImagePath(app: App, link: string, sourcePath: string): TFile | undefined {
  // Use MetadataCache.getFirstLinkpathDest for best match resolution
  return app.metadataCache.getFirstLinkpathDest(link, sourcePath) || undefined;
}

export function parseEmbedInfo(embedMarkdown: string, link: string) {
  let altText = "";
  let url = link;
  const mdMatch = embedMarkdown.match(/!\[([^\]]*)\]\(([^)]+)\)/);
  if (mdMatch) {
    altText = mdMatch[1];
    url = mdMatch[2];
  } else {
    const obsMatch = embedMarkdown.match(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (obsMatch) {
      url = obsMatch[1];
      altText = obsMatch[2] || "";
    }
  }
  let extension = "";
  let name = url;
  const lastSlash = url.lastIndexOf("/");
  const lastDot = url.lastIndexOf(".");
  if (lastDot > -1 && lastDot > lastSlash) {
    extension = url.slice(lastDot + 1);
    name = url.slice(lastSlash + 1, lastDot);
  } else if (lastSlash > -1) {
    name = url.slice(lastSlash + 1);
  } else if (lastDot > -1) {
    name = url.slice(0, lastDot);
    extension = url.slice(lastDot + 1);
  }
  return { name, extension, path: url, altText };
}

export function templateHasImagePlaceholder(template: string): boolean {
  return /\{\{\s*image\.[^}]+\s*\}\}/.test(template);
}

/**
 * Determines the attachment folder path for a given file, respecting Obsidian's settings.
 * Handles "Same folder as current file" and template variables like {{filename}} and {{date}}.
 */
export function getAttachmentFolderPathForFile(app: App, file: TFile): string {
  const attachmentPath = (app.vault as any).getConfig("attachmentFolderPath");

  if (!attachmentPath || attachmentPath === "" || attachmentPath === "./") {
    // "Same folder as current file"
    return file.parent?.path ?? "";
  }

  // Replace template variables
  let folder = attachmentPath
    .replace(/\{\{filename\}\}/g, file.basename)
    .replace(/\{\{date\}\}/g, (window as any).moment?.().format("YYYY-MM-DD") ?? "");

  // Remove leading/trailing slashes
  folder = folder.replace(/^\/+|\/+$/g, "");

  return folder;
}