import { Editor, Notice, RequestUrlResponse, TFile } from "obsidian";
import GPTImageOCRPlugin from "../main";
import { moveCursorToEnd, scrollEditorToCursor } from "./editor";

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
      case "embed.altText":
        return context.embed?.altText ?? "";
      case "embed.url":
        return context.embed?.path ?? context.embed?.url ?? "";
      default:
        return "";
    }
  };
  return template.replace(/{{(.*?)}}/g, (_, expr) => {
    expr = expr.trim();
    if (expr.startsWith("date:")) {
      const fmt = expr.slice(5).trim();
      return (window as any).moment ? (window as any).moment().format(fmt) : "";
    }
    if ((window as any).moment && /^[YMDHms\-:/ ]+$/.test(expr)) {
      return (window as any).moment().format(expr);
    }
    const val = getValue(expr);
    return val != null ? String(val) : "";
  });
}

/** Apply templates to OCR result */
export function applyFormatting(
  plugin: GPTImageOCRPlugin,
  content: string | string[],
  context: Record<string, any>
): string {
  if (Array.isArray(context.images) && Array.isArray(content)) {
    const batchHeader = formatTemplate(plugin.settings.batchHeaderTemplate || "", context);
    const batchFooter = formatTemplate(plugin.settings.batchFooterTemplate || "", context);
    const formattedImages = content.map((imgText, i) => {
      const imgContext = {
        ...context,
        image: context.images[i],
        imageIndex: i + 1,
        imageTotal: context.images.length,
      };
      const imgHeader = formatTemplate(plugin.settings.batchImageHeaderTemplate || "", imgContext);
      const imgFooter = formatTemplate(plugin.settings.batchImageFooterTemplate || "", imgContext);
      return [imgHeader, imgText, imgFooter ? "\n" + imgFooter : ""].filter(Boolean).join("");
    });
    return [batchHeader, ...formattedImages, batchFooter].filter(Boolean).join("");
  }
  const header = formatTemplate(plugin.settings.headerTemplate || "", context);
  const footer = formatTemplate(plugin.settings.footerTemplate || "", context);
  return [header, content as string, footer ? "\n" + footer : ""].filter(Boolean).join("");
}

/** Handles inserting or saving extracted OCR content based on user settings */
export async function handleExtractedContent(
  plugin: GPTImageOCRPlugin,
  content: string | string[],
  editor: Editor | null,
  context: Record<string, any> = {}
) {
  if (!editor) {
    editor = plugin.app.workspace.activeEditor?.editor ?? null;
  }
  const finalContent = applyFormatting(plugin, content, context);
  const isBatch = Array.isArray(context.images);
  const outputToNewNote = isBatch ? plugin.settings.batchOutputToNewNote : plugin.settings.outputToNewNote;
  if (!outputToNewNote) {
    if (editor) {
      const cursor = editor.getCursor();
      editor.replaceSelection(finalContent);
      const newPos = editor.offsetToPos(editor.posToOffset(cursor) + finalContent.length);
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
  const appendIfExists = isBatch ? plugin.settings.batchAppendIfExists : plugin.settings.appendIfExists;
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
  setTimeout(() => {
    const activeEditor = plugin.app.workspace.activeEditor?.editor;
    if (activeEditor) {
      moveCursorToEnd(activeEditor);
    }
  }, 10);
}
