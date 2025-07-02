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
  FRIENDLY_PROVIDER_NAMES,
  DEFAULT_PROMPT_TEXT,
  OCRProvider,
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
        const notice = new Notice(`Using ${provider.name}…`, 0);
        try {
          const content = await provider.extractTextFromBase64(base64);
          notice.hide();

          if (content) {
            const editor = this.app.workspace.activeEditor?.editor;
            await handleExtractedContent(this, content, editor ?? null);
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
        const notice = new Notice(
          `Extracting from embed with ${provider.name}…`,
          0,
        );
        try {
          const content = await provider.extractTextFromBase64(base64);
          notice.hide();

          if (!content) {
            new Notice("No content returned.");
            return;
          }

          // If embed is actually selected, replace it directly
          if (embedMatch && sel === embedMatch[0]) {
            editor.replaceSelection(content);
            return;
          }

          // Otherwise respect user settings
          await handleExtractedContent(this, content, editor ?? null);
        } catch (e) {
          notice.hide();
          console.error("OCR failed:", e);
          new Notice("Failed to extract text.");
        }
      },
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
}
