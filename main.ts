// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import {
  Plugin,
  Notice,
  TFile,
  MarkdownView,
  MarkdownFileInfo,
  Editor,
} from "obsidian";
import {
  GPTImageOCRSettings,
  DEFAULT_SETTINGS,
  DEFAULT_PROMPT_TEXT,
  DEFAULT_BATCH_PROMPT_TEXT,
  OCRProvider,
  PreparedImage,
  FRIENDLY_MODEL_NAMES,
} from "./types";
import { OpenAIProvider } from "./providers/openai-provider";
import { GeminiProvider } from "./providers/gemini-provider";
import {
  getFriendlyProviderNames,
  getProviderType,
  buildOCRContext,
} from "./utils/ocr";
import {
  handleExtractedContent,
} from "./utils/format";
import {
  findRelevantImageEmbed,
  resolveInternalImagePath,
  parseEmbedInfo,
  templateHasImagePlaceholder,
} from "./utils/embed";
import {
  fetchExternalImageAsArrayBuffer,
  arrayBufferToBase64,
  getImageDimensionsFromArrayBuffer,
  selectImageFile,
  selectFolder,
  getImageMimeType,
} from "./utils/image";
import { GPTImageOCRSettingTab } from "./settings-tab";
import { pluginLog } from "./utils/log";

/**
 * Main plugin class for Obsidian AI Image OCR.
 * Handles plugin lifecycle, settings, and OCR commands.
 */
export default class GPTImageOCRPlugin extends Plugin {
  settings: GPTImageOCRSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    // --- Loaded Image OCR ---
    this.addCommand({
      id: "extract-text-from-image",
      name: "Extract text from image",
      callback: async () => {
        const file = await selectImageFile();
        if (!file) {
          pluginLog("No file selected for OCR.", "notice", true);
          return;
        }
        const arrayBuffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        const dims = await getImageDimensionsFromArrayBuffer(arrayBuffer);
        const provider = this.getProvider();
        const providerId = this.settings.provider;
        const modelId = (provider as any).model;
        const providerName = getFriendlyProviderNames(this.settings)[providerId];
        let modelName = FRIENDLY_MODEL_NAMES[modelId] || modelId;
        if (providerId === "ollama" && this.settings.ollamaModelFriendlyName?.trim()) {
          modelName = this.settings.ollamaModelFriendlyName.trim();
        } else if (providerId === "lmstudio" && this.settings.lmstudioModelFriendlyName?.trim()) {
          modelName = this.settings.lmstudioModelFriendlyName.trim();
        } else if (providerId === "custom" && this.settings.customModelFriendlyName?.trim()) {
          modelName = this.settings.customModelFriendlyName.trim();
        }
        const providerType = getProviderType(providerId);

        const notice = new Notice(`Using ${providerName} ${modelName}…`, 0);
        try {
          const content = await provider.extractTextFromBase64(base64);
          notice.hide();

          if (content) {
            const editor = this.app.workspace.activeEditor?.editor;

            // Build the context object
            const extension = file.name.includes(".") ? file.name.split(".").pop() : "";
            const mime = file.type || getImageMimeType(file.name);

            const context = buildOCRContext({
              providerId,
              providerName,
              providerType,
              modelId,
              modelName,
              prompt: this.settings.customPrompt,
              singleImage: {
                name: file.name.replace(/\.[^.]*$/, ""),
                extension: extension || "",
                path: file.name,
                size: file.size,
                mime,
                width: dims?.width,
                height: dims?.height,
                base64: base64,
              },
            });

            await handleExtractedContent(this, content, editor ?? null, context);
          } else {
            pluginLog("No content returned from OCR.", "notice", true);
          }
        } catch (e) {
          notice.hide();
          if (e instanceof Error) {
            pluginLog(e, "error", true);
          } else {
            pluginLog(`OCR failed: ${e}`, "error", true);
          }
          pluginLog("Failed to extract text.", "notice", true);
        }
      },
    });

    // --- Embedded Image OCR ---
    this.addCommand({
      id: "extract-text-from-embedded-image",
      name: "Extract text from embedded image",
      editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        const sel = editor.getSelection();
        const embedMatch = sel.match(/!\[\[.*?\]\]/) || sel.match(/!\[.*?\]\(.*?\)/);

        const embed = findRelevantImageEmbed(editor);
        if (!embed) {
          pluginLog("No image embed found.", "notice", true);
          return;
        }
        const { link, isExternal, embedText } = embed;
        let arrayBuffer: ArrayBuffer | null = null;

        if (isExternal) {
          try {
            arrayBuffer = await fetchExternalImageAsArrayBuffer(link);
          } catch (e) {
            pluginLog(`Failed to fetch external image.`, "notice", true);
            pluginLog(`Failed to fetch external image: ${e}`, "error", true);
            return;
          }
        } else {
          const file = resolveInternalImagePath(this.app, link);
          if (file instanceof TFile) {
            arrayBuffer = await this.app.vault.readBinary(file);
          } else {
            pluginLog("Image file not found in vault.", "notice", true);
            return;
          }
        }

        if (!arrayBuffer) {
          pluginLog("Could not read image data.", "notice", true);
          return;
        }
        const base64 = arrayBufferToBase64(arrayBuffer);
        const dims = await getImageDimensionsFromArrayBuffer(arrayBuffer);

        const provider = this.getProvider();
        const providerId = this.settings.provider;
        const modelId = (provider as any).model;
        const providerName = getFriendlyProviderNames(this.settings)[providerId];
        let modelName = FRIENDLY_MODEL_NAMES[modelId] || modelId;
        if (providerId === "ollama" && this.settings.ollamaModelFriendlyName?.trim()) {
          modelName = this.settings.ollamaModelFriendlyName.trim();
        } else if (providerId === "lmstudio" && this.settings.lmstudioModelFriendlyName?.trim()) {
          modelName = this.settings.lmstudioModelFriendlyName.trim();
        } else if (providerId === "custom" && this.settings.customModelFriendlyName?.trim()) {
          modelName = this.settings.customModelFriendlyName.trim();
        }
        const providerType = getProviderType(providerId);

        const notice = new Notice(
          `Extracting from embed with ${providerName} ${modelName}…`,
          0,
        );
        try {
          const content = await provider.extractTextFromBase64(base64);
          notice.hide();

          if (!content) {
            pluginLog("No content returned.", "notice", true);
            return;
          }

          const embedInfo = parseEmbedInfo(embedText, link);
          const mime = getImageMimeType(embedInfo.path);

          const context = buildOCRContext({
            providerId,
            providerName,
            providerType,
            modelId,
            modelName,
            prompt: this.settings.customPrompt,
            singleImage: {
              name: embedInfo.name,
              extension: embedInfo.extension,
              path: embedInfo.path,
              size: arrayBuffer?.byteLength ?? 0,
              file: isExternal ? undefined : resolveInternalImagePath(this.app, link), // Use undefined instead of null
              mime,
              width: dims?.width,
              height: dims?.height,
              base64: base64,
            },
          }) as any;
          // Add embed info to context for downstream consumers if needed
          context.embed = embedInfo;
          // If embed is actually selected, replace it directly
          if (embedMatch && sel === embedMatch[0]) {
            editor.replaceSelection(content);
            return;
          }

          // Otherwise respect user settings
          // Build the context object
          await handleExtractedContent(this, content, editor ?? null, context);
        } catch (e) {
          notice.hide();
          if (e instanceof Error) {
            pluginLog(e, "error", true);
          } else {
            pluginLog(`OCR failed: ${e}`, "error", true);
          }
          pluginLog("Failed to extract text.", "notice", true);
        }
      },
    });

    // --- Batch Image Folder OCR ---
    this.addCommand({
      id: "extract-text-from-image-folder",
      name: "Extract text from image folder",
      callback: () => this.extractTextFromImageFolder(),
    });


    this.addSettingTab(new GPTImageOCRSettingTab(this.app, this));
  }

  /**
   * Returns the currently selected OCR provider instance based on settings.
   */
  getProvider(): OCRProvider {
    const { provider, openaiApiKey, geminiApiKey } = this.settings;
    const name = getFriendlyProviderNames(this.settings)[provider];
    const prompt = this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT;

    type ProviderFactory = () => OCRProvider;

    const openAiFactory = (model: string): OCRProvider =>
      new OpenAIProvider(
        openaiApiKey,
        model,
        "https://api.openai.com/v1/chat/completions",
        "openai",
        prompt,
        name
      );

    const factories: Record<GPTImageOCRSettings["provider"], ProviderFactory> = {
      gemini: () =>
        new GeminiProvider(geminiApiKey, "models/gemini-2.5-flash", prompt, name),
      "gemini-lite": () =>
        new GeminiProvider(
          geminiApiKey,
          "models/gemini-2.5-flash-lite-preview-06-17",
          prompt,
          name
        ),
      "gemini-pro": () =>
        new GeminiProvider(geminiApiKey, "models/gemini-2.5-pro", prompt, name),
      "openai-mini": () => openAiFactory("gpt-4o-mini"),
      openai: () => openAiFactory("gpt-4o"),
      "openai-4.1": () => openAiFactory("gpt-4.1"),
      "openai-4.1-mini": () => openAiFactory("gpt-4.1-mini"),
      "openai-4.1-nano": () => openAiFactory("gpt-4.1-nano"),
      ollama: () =>
        new OpenAIProvider(
          "",
          this.settings.ollamaModel || "llama3.2-vision",
          this.settings.ollamaUrl?.replace(/\/$/, "") || "http://localhost:11434",
          "ollama",
          prompt,
          name
        ),
      lmstudio: () =>
        new OpenAIProvider(
          "",
          this.settings.lmstudioModel || "gemma3",
          this.settings.lmstudioUrl?.replace(/\/$/, "") || "http://localhost:1234",
          "lmstudio",
          prompt,
          name
        ),
      custom: () =>
        new OpenAIProvider(
          this.settings.customApiKey || "",
          this.settings.customApiModel || "gpt-4",
          this.settings.customApiUrl || "https://example.com/v1/chat/completions",
          "openai",
          prompt,
          name
        ),
    };

    const factory = factories[provider];
    if (!factory) throw new Error("Unknown provider");
    return factory();
  }

  /**
   * Loads plugin settings from disk, merging with defaults.
   */
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  /**
   * Saves current plugin settings to disk.
   */
  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Collects images from a folder for text extraction
  */
  async extractTextFromImageFolder() {
    const files = await selectFolder();
    if (!files) return;

    const imageFiles = Array.from(files).filter(file =>
      /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name)
    );

    const prepared = await Promise.all(
      imageFiles.map(async (file): Promise<PreparedImage> => {
        const arrayBuffer = await file.arrayBuffer();
        const dims = await getImageDimensionsFromArrayBuffer(arrayBuffer);
        return {
          name: file.name,
          base64: arrayBufferToBase64(arrayBuffer),
          mime: file.type,
          size: file.size,
          width: dims?.width,
          height: dims?.height,
          source: file.name,
        };
      })
    );

    if (prepared.length === 0) {
      pluginLog("No valid images could be prepared.", "notice", true);
      return;
    }

    const provider = this.getProvider();
    const providerId = this.settings.provider;
    const modelId = (provider as any).model;
    const providerName = getFriendlyProviderNames(this.settings)[providerId];
    let modelName = FRIENDLY_MODEL_NAMES[modelId] || modelId;
    if (providerId === "ollama" && this.settings.ollamaModelFriendlyName?.trim()) {
      modelName = this.settings.ollamaModelFriendlyName.trim();
    } else if (providerId === "lmstudio" && this.settings.lmstudioModelFriendlyName?.trim()) {
      modelName = this.settings.lmstudioModelFriendlyName.trim();
    } else if (providerId === "custom" && this.settings.customModelFriendlyName?.trim()) {
      modelName = this.settings.customModelFriendlyName.trim();
    }
    const providerType = getProviderType(providerId);

    const notice = new Notice(`Extracting text from ${prepared.length} images using ${providerName} ${modelName}…`, 0);

    // Compose the batch prompt with the required instruction appended
    const batchFormatInstruction = `
For each image, wrap the response using the following format:

--- BEGIN IMAGE: ---
<insert OCR text>
--- END IMAGE ---

Repeat this for each image.
`;
    const userPrompt = this.settings.batchCustomPrompt?.trim() || DEFAULT_BATCH_PROMPT_TEXT;
    const batchPrompt = `${userPrompt}\n${batchFormatInstruction}`;

    try {
      // Send all images in a single API call with the batch prompt
      let response: string;
      if (provider.process) {
        response = await provider.process(prepared, batchPrompt);
      } else {
        // Fallback: just process the first image (should not happen for batch-capable providers)
        response = await provider.extractTextFromBase64(prepared[0].base64) ?? "";
      }

      notice.hide();

      // Parse the response into an array using the delimiter
      const matches = Array.from(
        response.matchAll(/--- BEGIN IMAGE: ---\s*([\s\S]*?)\s*--- END IMAGE ---/g),
        m => m[1].trim()
      );

      let contentForFormatting: string | string[];
      let contextForFormatting: any;

      if (matches.length > 1) {
        contentForFormatting = matches;
        contextForFormatting = buildOCRContext({
          providerId,
          providerName,
          providerType,
          modelId,
          modelName,
          prompt: batchPrompt,
          images: prepared.map(img => ({
            name: img.name.replace(/\.[^.]*$/, ""),
            extension: img.name.includes(".") ? (img.name.split(".").pop() || "") : "",
            path: img.source,
            size: img.size,
            mime: img.mime || getImageMimeType(img.name),
            width: img.width,
            height: img.height,
          })),
        });
      } else {
        contentForFormatting = matches.length === 1 ? matches[0] : response.trim();
        contextForFormatting = buildOCRContext({
          providerId,
          providerName,
          providerType,
          modelId,
          modelName,
          prompt: batchPrompt,
          singleImage: {
            name: prepared[0]?.name.replace(/\.[^.]*$/, ""),
            extension: prepared[0]?.name.includes(".") ? (prepared[0]?.name.split(".").pop() || "") : "",
            path: prepared[0]?.source,
            size: prepared[0]?.size,
            mime: prepared[0]?.mime || getImageMimeType(prepared[0]?.name ?? ""),
            width: prepared[0]?.width,
            height: prepared[0]?.height,
          },
        });
      }

      // Use your formatting/output logic
      const noteNameTemplate = this.settings.batchNoteNameTemplate || this.settings.noteNameTemplate;
      const noteFolderTemplate = this.settings.batchNoteFolderPath || this.settings.noteFolderPath;

      if (
        Array.isArray(contextForFormatting.images) &&
        (templateHasImagePlaceholder(noteNameTemplate) || templateHasImagePlaceholder(noteFolderTemplate))
      ) {
        // Per-image notes
        for (let i = 0; i < contextForFormatting.images.length; i++) {
          const imgContext = {
            ...contextForFormatting,
            image: contextForFormatting.images[i],
            imageIndex: i + 1,
            imageTotal: contextForFormatting.images.length,
          };
          const imgContent = Array.isArray(contentForFormatting) ? contentForFormatting[i] : contentForFormatting;
          await handleExtractedContent(this, imgContent, null, imgContext);
        }
      } else {
        // Single batch note
        await handleExtractedContent(this, contentForFormatting, null, contextForFormatting);
      }

    } catch (e) {
      notice.hide();
      pluginLog("Failed to extract text from images.", "notice", true);
      pluginLog(e instanceof Error ? e : `OCR failed: ${e}`, "error", true);
    }
  }

  async insertOutputToEditor(text: string) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      pluginLog("No active editor to insert text into.", "notice", true);
      return;
    }
    const editor = activeView.editor;
    editor.replaceSelection(text + "\n");
  }

}
