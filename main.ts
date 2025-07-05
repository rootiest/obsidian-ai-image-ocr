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
  handleExtractedContent,
  findRelevantImageEmbed,
  resolveInternalImagePath,
  fetchExternalImageAsArrayBuffer,
  arrayBufferToBase64,
  selectImageFile,
  selectFolder,
  getProviderType,
  buildOCRContext,
  parseEmbedInfo,
  getImageMimeType,
} from "./utils/helpers";
import { GPTImageOCRSettingTab } from "./settings-tab";

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
      name: "Extract Text from Image",
      callback: async () => {
        const file = await selectImageFile();
        if (!file) {
          new Notice("No file selected.");
          return;
        }
        const arrayBuffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);

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
              },
            });

            await handleExtractedContent(this, content, editor ?? null, context);
          } else {
            new Notice("No content returned.");
          }
        } catch (e) {
          notice.hide();
          console.error("OCR failed:", e);
          new Notice("Failed to extract text.");
        }
      },
    });

    // --- Embedded Image OCR ---
    this.addCommand({
      id: "extract-text-from-embedded-image",
      name: "Extract Text from Embedded Image",
      editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        const sel = editor.getSelection();
        const embedMatch = sel.match(/!\[\[.*?\]\]/) || sel.match(/!\[.*?\]\(.*?\)/);

        const embed = findRelevantImageEmbed(editor);
        if (!embed) {
          new Notice("No image embed found.");
          return;
        }
        const { link, isExternal } = embed;

        let arrayBuffer: ArrayBuffer | null = null;

        if (isExternal) {
          try {
            arrayBuffer = await fetchExternalImageAsArrayBuffer(link);
          } catch (e) {
            new Notice("Failed to fetch external image.");
            return;
          }
        } else {
          const file = resolveInternalImagePath(this.app, link);
          if (file instanceof TFile) {
            arrayBuffer = await this.app.vault.readBinary(file);
          } else {
            new Notice("Image file not found in vault.");
            return;
          }
        }

        if (!arrayBuffer) {
          new Notice("Could not read image data.");
          return;
        }
        const base64 = arrayBufferToBase64(arrayBuffer);

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
            new Notice("No content returned.");
            return;
          }

          const embedInfo = parseEmbedInfo(sel, link);
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
                mime,
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
          console.error("OCR failed:", e);
          new Notice("Failed to extract text.");
        }
      },
    });

    // --- Batch Image Folder OCR ---
    this.addCommand({
      id: "extract-text-from-image-folder",
      name: "Extract Text from Image Folder",
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

    if (provider === "gemini") {
      return new GeminiProvider(
        geminiApiKey,
        "models/gemini-2.5-flash",
        this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT,
        name
      );
    } else if (provider === "gemini-lite") {
      return new GeminiProvider(
        geminiApiKey,
        "models/gemini-2.5-flash-lite-preview-06-17",
        this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT,
        name
      );
    } else if (provider === "gemini-pro") {
      return new GeminiProvider(
        geminiApiKey,
        "models/gemini-2.5-pro",
        this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT,
        name
      );
    } else if (provider === "openai-mini") {
      return new OpenAIProvider(
        openaiApiKey,
        "gpt-4o-mini",
        "https://api.openai.com/v1/chat/completions",
        "openai",
        this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT,
        name
      );
    } else if (provider === "openai") {
      return new OpenAIProvider(
        openaiApiKey,
        "gpt-4o",
        "https://api.openai.com/v1/chat/completions",
        "openai",
        this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT,
        name
      );
    } else if (provider === "openai-4.1") {
      return new OpenAIProvider(
        openaiApiKey,
        "gpt-4.1",
        "https://api.openai.com/v1/chat/completions",
        "openai",
        this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT,
        name
      );
    } else if (provider === "openai-4.1-mini") {
      return new OpenAIProvider(
        openaiApiKey,
        "gpt-4.1-mini",
        "https://api.openai.com/v1/chat/completions",
        "openai",
        this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT,
        name
      );
    } else if (provider === "openai-4.1-nano") {
      return new OpenAIProvider(
        openaiApiKey,
        "gpt-4.1-nano",
        "https://api.openai.com/v1/chat/completions",
        "openai",
        this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT,
        name
      );
    } else if (provider === "ollama") {
      return new OpenAIProvider(
        "", // no api key
        this.settings.ollamaModel || "llama3.2-vision",
        this.settings.ollamaUrl?.replace(/\/$/, "") || "http://localhost:11434",
        "ollama",
        this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT,
        name
      );
    } else if (provider === "lmstudio") {
      return new OpenAIProvider(
        "", // no api key
        this.settings.lmstudioModel || "gemma3",
        this.settings.lmstudioUrl?.replace(/\/$/, "") || "http://localhost:1234",
        "lmstudio",
        this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT,
        name
      );
    } else if (provider === "custom") {
      return new OpenAIProvider(
        this.settings.customApiKey || "",
        this.settings.customApiModel || "gpt-4",
        this.settings.customApiUrl || "https://example.com/v1/chat/completions",
        "openai", // use openai-style response
        this.settings.customPrompt?.trim() || DEFAULT_PROMPT_TEXT,
        name
      );
    } else {
      throw new Error("Unknown provider");
    }
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
        return {
          name: file.name,
          base64: arrayBufferToBase64(arrayBuffer),
          mime: file.type,
          size: file.size,
          source: file.name,
        };
      })
    );

    if (prepared.length === 0) {
      new Notice("No valid images could be prepared.");
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
          },
        });
      }

      // Use your formatting/output logic
      await handleExtractedContent(this, contentForFormatting, null, contextForFormatting);

    } catch (e) {
      notice.hide();
      new Notice("Failed to extract text from images.");
      console.error(e);
    }
  }

  async insertOutputToEditor(text: string) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice("No active editor.");
      return;
    }
    const editor = activeView.editor;
    editor.replaceSelection(text + "\n");
  }

}
