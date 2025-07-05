// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { PluginSettingTab, App, Setting } from "obsidian";
import GPTImageOCRPlugin from "./main";
import type { GPTImageOCRSettings } from "./types";

/**
 * Settings tab UI for the plugin, allowing users to configure providers and options.
 */
export class GPTImageOCRSettingTab extends PluginSettingTab {
  plugin: GPTImageOCRPlugin;

  constructor(app: App, plugin: GPTImageOCRPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Renders the settings UI in the Obsidian settings panel.
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "OCR Plugin Settings" });

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("Choose which OCR provider to use.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("openai", "OpenAI GPT-4o")
          .addOption("openai-mini", "OpenAI GPT-4o Mini")
          .addOption("openai-4.1", "OpenAI GPT-4.1")
          .addOption("openai-4.1-mini", "OpenAI GPT-4.1 Mini")
          .addOption("openai-4.1-nano", "OpenAI GPT-4.1 Nano")
          .addOption("gemini", "Google Gemini 2.5 Flash")
          .addOption("gemini-lite", "Google Gemini 2.5 Flash-Lite Preview 06-17")
          .addOption("gemini-pro", "Google Gemini 2.5 Pro")
          .addOption('ollama', 'Ollama (local)')
          .addOption('lmstudio', 'LMStudio (local)')
          .addOption("custom", "Custom OpenAI-compatible")
          .setValue(this.plugin.settings.provider)
          .onChange(async (value) => {
            this.plugin.settings.provider = value as GPTImageOCRSettings["provider"];
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (this.plugin.settings.provider === "openai") {
      new Setting(containerEl)
        .setDesc("A fast and highly accurate model. API requires payment.");
    } else if (this.plugin.settings.provider === "gemini") {
      new Setting(containerEl)
        .setDesc("A model with good speed and accuracy. Free tier available.");
    } else if (this.plugin.settings.provider === "gemini-lite") {
      new Setting(containerEl)
        .setDesc("A lightweight, experimental model. Free tier available. Generous rate-limits.");
    } else if (this.plugin.settings.provider === "gemini-pro") {
      new Setting(containerEl)
        .setDesc("A slower but extremely powerful model. Requires paid tier API.");
    } else if (this.plugin.settings.provider === "openai-mini") {
      new Setting(containerEl)
        .setDesc("A lower cost and lower latency model, slightly lower quality. API requires payment.");
    } else if (this.plugin.settings.provider === "openai-4.1") {
      new Setting(containerEl)
        .setDesc("A powerful GPT-4-tier model. API requires payment.");
    } else if (this.plugin.settings.provider === "openai-4.1-mini") {
      new Setting(containerEl)
        .setDesc("Smaller GPT-4.1 variant for faster responses, lower cost. API requires payment.");
    } else if (this.plugin.settings.provider === "openai-4.1-nano") {
      new Setting(containerEl)
        .setDesc("Minimal GPT-4.1 variant for lowest cost and latency. API requires payment.");
    } else if (this.plugin.settings.provider === "ollama") {
      new Setting(containerEl)
        .setDesc("A locally-hosted Ollama server. Ollama models must be installed separately.");
    } else if (this.plugin.settings.provider === "lmstudio") {
      new Setting(containerEl)
        .setDesc("A locally-hosted LMStudio server. LMStudio models must be installed separately.");
    } else if (this.plugin.settings.provider === "custom") {
      new Setting(containerEl)
        .setDesc("Any OpenAI-compatible API provider. Must use OpenAI API structure.");
    }
    if (this.plugin.settings.provider.startsWith("openai")) {
      new Setting(containerEl)
        .setName("OpenAI API key")
        .setDesc("Your OpenAI API key")
        .addText((text) =>
          text
            .setPlaceholder("sk-...")
            .setValue(this.plugin.settings.openaiApiKey)
            .onChange(async (value) => {
              this.plugin.settings.openaiApiKey = value.trim();
              await this.plugin.saveSettings();
            }),
        );
    }

    if (this.plugin.settings.provider.startsWith("gemini")) {
      new Setting(containerEl)
        .setName("Gemini API key")
        .setDesc("Your Google Gemini API key")
        .addText((text) =>
          text
            .setPlaceholder("AIza...")
            .setValue(this.plugin.settings.geminiApiKey)
            .onChange(async (value) => {
              this.plugin.settings.geminiApiKey = value.trim();
              await this.plugin.saveSettings();
            }),
        );
    }

    if (this.plugin.settings.provider === "ollama") {
      // Ollama Server URL
      new Setting(containerEl)
        .setName("Server URL")
        .setDesc("Enter the Ollama server address.")
        .addText(text =>
          text
            .setValue(this.plugin.settings.ollamaUrl || "http://localhost:11434")
            .onChange(async (value) => {
              this.plugin.settings.ollamaUrl = value;
              await this.plugin.saveSettings();
            })
        );
      const customUrlDesc = containerEl.createEl("div", { cls: "ai-image-ocr__setting-desc" });
      customUrlDesc.appendText("e.g. ");
      customUrlDesc.createEl("code", { text: "http://localhost:11434" });

      // Ollama Model Name
      new Setting(containerEl)
        .setName("Model Name")
        .setDesc("Enter the ID of the vision model to use.")
        .addText(text =>
          text
            .setPlaceholder("llama3.2-vision")
            .setValue(this.plugin.settings.ollamaModel || "")
            .onChange(async (value) => {
              this.plugin.settings.ollamaModel = value;
              await this.plugin.saveSettings();
            })
        );

      const customDesc = containerEl.createEl("div", { cls: "ai-image-ocr__setting-desc" });
      customDesc.appendText("e.g. ");
      customDesc.createEl("code", { text: "llama3.2-vision" });
      customDesc.appendText(" or ");
      customDesc.createEl("code", { text: "llava" });

      if (!this.plugin.settings.ollamaModel) {
        containerEl.createEl("div", {
          text: "⚠️ Please specify a vision model ID for Ollama (e.g. llama3.2-vision).",
          cls: "setting-item-warning"
        });
      }

      new Setting(containerEl)
        .setName("Model friendly name")
        .setDesc("Optional. Friendly display name for this model (e.g. 'Llama 3.2 Vision').")
        .addText(text =>
          text
            .setPlaceholder("Llama 3.2 Vision")
            .setValue(this.plugin.settings.ollamaModelFriendlyName || "")
            .onChange(async (value) => {
              this.plugin.settings.ollamaModelFriendlyName = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    if (this.plugin.settings.provider === "lmstudio") {
      // LMStudio Server URL
      new Setting(containerEl)
        .setName("Server URL")
        .setDesc("Enter the LMStudio server address.")
        .addText(text =>
          text
            .setValue(this.plugin.settings.lmstudioUrl || "http://localhost:1234")
            .onChange(async (value) => {
              this.plugin.settings.lmstudioUrl = value;
              await this.plugin.saveSettings();
            })
        );
      const customUrlDesc = containerEl.createEl("div", { cls: "ai-image-ocr__setting-desc" });
      customUrlDesc.appendText("e.g. ");
      customUrlDesc.createEl("code", { text: "http://localhost:11434" });

      // LMStudio Model Name
      new Setting(containerEl)
        .setName("Model Name")
        .setDesc("Enter the ID of the vision model to use.")
        .addText(text =>
          text
            .setPlaceholder("google/gemma-3-4b")
            .setValue(this.plugin.settings.lmstudioModel || "")
            .onChange(async (value) => {
              this.plugin.settings.lmstudioModel = value;
              await this.plugin.saveSettings();
            })
        );

      const customDesc = containerEl.createEl("div", { cls: "ai-image-ocr__setting-desc" });
      customDesc.appendText("e.g. ");
      customDesc.createEl("code", { text: "google/gemma-3-4b" });
      customDesc.appendText(" or ");
      customDesc.createEl("code", { text: "qwen/qwen2.5-vl-7b" });

      if (!this.plugin.settings.lmstudioModel) {
        containerEl.createEl("div", {
          text: "⚠️ Please specify a vision model ID for LMStudio\n(e.g. google/gemma-3-4b, qwen/qwen2.5-vl-7b).",
          cls: "setting-item-warning"
        });
      }

      new Setting(containerEl)
        .setName("Model friendly name")
        .setDesc("Optional. Friendly display name for this model (e.g. 'Gemma 3').")
        .addText(text =>
          text
            .setPlaceholder("Gemma 3")
            .setValue(this.plugin.settings.lmstudioModelFriendlyName || "")
            .onChange(async (value) => {
              this.plugin.settings.lmstudioModelFriendlyName = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    if (this.plugin.settings.provider === "custom") {

      new Setting(containerEl)
        .setName("Custom provider friendly name")
        .setDesc("Optional friendly name for your custom OpenAI-compatible provider.")
        .addText(text =>
          text
            .setPlaceholder("Custom Provider")
            .setValue(this.plugin.settings.customProviderFriendlyName || "")
            .onChange(async (value) => {
              this.plugin.settings.customProviderFriendlyName = value.trim() || undefined;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("API endpoint")
        .setDesc("The full URL to the OpenAI-compatible /chat/completions endpoint.")
        .addText((text) =>
          text
            .setPlaceholder("https://example.com/v1/chat/completions")
            .setValue(this.plugin.settings.customApiUrl)
            .onChange(async (value) => {
              this.plugin.settings.customApiUrl = value.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Model name")
        .setDesc("Enter the model ID to use.")
        .addText((text) =>
          text
            .setPlaceholder("my-model-id")
            .setValue(this.plugin.settings.customApiModel)
            .onChange(async (value) => {
              this.plugin.settings.customApiModel = value.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("API key")
        .setDesc("Optional. Leave empty for no key.")
        .addText((text) =>
          text
            .setPlaceholder("sk-...")
            .setValue(this.plugin.settings.customApiKey)
            .onChange(async (value) => {
              this.plugin.settings.customApiKey = value.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Model friendly name")
        .setDesc("Optional. Friendly display name for this model (e.g. 'My Custom Model').")
        .addText(text =>
          text
            .setPlaceholder("My Custom Model")
            .setValue(this.plugin.settings.customModelFriendlyName || "")
            .onChange(async (value) => {
              this.plugin.settings.customModelFriendlyName = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    // Add a horizontal rule to separate sections
    containerEl.createEl("hr");
    // Start of single image extraction settings
    containerEl.createEl("h3", { text: "Single image extraction settings" });

    // SINGLE IMAGE CUSTOM PROMPT (full-width textarea below desc)
    const customPromptSetting = new Setting(containerEl)
      .setName("Custom prompt")
      .setDesc("Optional prompt to send to the model. Leave blank to use the default.");
    const customPromptTextArea = document.createElement("textarea");
    customPromptTextArea.placeholder = `e.g., Extract any handwritten notes or text from the image.`;
    customPromptTextArea.value = this.plugin.settings.customPrompt;
    customPromptTextArea.classList.add("ai-image-ocr__template-input", "ai-image-ocr__setting-input-below");
    customPromptTextArea.rows = 2;
    customPromptTextArea.addEventListener("change", async (e) => {
      this.plugin.settings.customPrompt = (e.target as HTMLTextAreaElement).value;
      await this.plugin.saveSettings();
    });
    customPromptSetting.infoEl.appendChild(customPromptTextArea);

    // SINGLE IMAGE HEADER TEMPLATE (full-width textarea below desc)
    const headerSetting = new Setting(containerEl)
      .setName("Header template")
      .setDesc("Optional markdown placed above the extracted text.\nSupports {{placeholders}}.");
    const headerTextArea = document.createElement("textarea");
    headerTextArea.placeholder = `### Extracted on {{YYYY-MM-DD HH:mm:ss}}
---`;
    headerTextArea.value = this.plugin.settings.headerTemplate;
    headerTextArea.classList.add("ai-image-ocr__template-input", "ai-image-ocr__setting-input-below");
    headerTextArea.rows = 3;
    headerTextArea.addEventListener("change", async (e) => {
      this.plugin.settings.headerTemplate = (e.target as HTMLTextAreaElement).value;
      await this.plugin.saveSettings();
    });
    headerSetting.infoEl.appendChild(headerTextArea);

    // SINGLE IMAGE FOOTER TEMPLATE (full-width textarea below desc)
    const footerSetting = new Setting(containerEl)
      .setName("Footer template")
      .setDesc("Optional markdown placed below the extracted text.\nSupports {{placeholders}}.");

    const footerTextArea = document.createElement("textarea");
    footerTextArea.placeholder = `---\n### Extracted on {{YYYY-MM-DD HH:mm:ss}}\n`;
    footerTextArea.value = this.plugin.settings.footerTemplate;
    footerTextArea.classList.add("ai-image-ocr__template-input", "ai-image-ocr__setting-input-below");
    footerTextArea.rows = 3;
    footerTextArea.addEventListener("change", async (e) => {
      this.plugin.settings.footerTemplate = (e.target as HTMLTextAreaElement).value;
      await this.plugin.saveSettings();
    });
    footerSetting.infoEl.appendChild(footerTextArea);

    new Setting(containerEl)
      .setName("Output to new note")
      .setDesc("If enabled, extracted text will be saved to a new note.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.outputToNewNote)
          .onChange(async (value) => {
            this.plugin.settings.outputToNewNote = value;
            await this.plugin.saveSettings();
            this.display(); // refresh visible options
          }),
      );

    if (this.plugin.settings.outputToNewNote) {
      const folderSetting = new Setting(containerEl)
        .setName("Note folder path")
        .setDesc("");
      folderSetting.descEl.appendText("Relative to vault root. (e.g., 'OCR Notes')");
      folderSetting.descEl.createEl("br");
      folderSetting.descEl.appendText("Supports {{placeholders}}.");
      folderSetting.addText((text) =>
        text
          .setPlaceholder("OCR Notes")
          .setValue(this.plugin.settings.noteFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.noteFolderPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

      new Setting(containerEl)
        .setName("Note name template")
        .setDesc("Supports {{placeholders}}.")
        .addText((text) =>
          text
            .setPlaceholder("Extracted OCR {{YYYY-MM-DD}}")
            .setValue(this.plugin.settings.noteNameTemplate)
            .onChange(async (value) => {
              this.plugin.settings.noteNameTemplate = value;
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Append if file exists")
        .setDesc(
          "If enabled, appends to an existing note instead of creating a new one.",
        )
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.appendIfExists)
            .onChange(async (value) => {
              this.plugin.settings.appendIfExists = value;
              await this.plugin.saveSettings();
            }),
        );
    }

    containerEl.createEl("hr");

    const descEl = containerEl.createEl("div", {
      cls: 'ai-image-ocr__tip',
    });

    // Add a horizontal rule to separate sections
    containerEl.createEl("hr");
    // Start of batch image extraction settings
    containerEl.createEl("h3", { text: "Batch image extraction settings" });

    // BATCH CUSTOM PROMPT (full-width textarea below desc)
    const batchCustomPromptSetting = new Setting(containerEl)
      .setName("Custom batched images prompt")
      .setDesc("Optional prompt to send to the model for batch extraction. Leave blank to use the default.");
    const batchCustomPromptTextArea = document.createElement("textarea");
    batchCustomPromptTextArea.placeholder = `e.g., Extract all visible text from each image.`;
    batchCustomPromptTextArea.value = this.plugin.settings.batchCustomPrompt;
    batchCustomPromptTextArea.classList.add("ai-image-ocr__template-input", "ai-image-ocr__setting-input-below");
    batchCustomPromptTextArea.rows = 2;
    batchCustomPromptTextArea.addEventListener("change", async (e) => {
      this.plugin.settings.batchCustomPrompt = (e.target as HTMLTextAreaElement).value;
      await this.plugin.saveSettings();
    });
    batchCustomPromptSetting.infoEl.appendChild(batchCustomPromptTextArea);

    // BATCH HEADER TEMPLATE (full-width textarea below desc)
    const batchHeaderSetting = new Setting(containerEl)
      .setName("Batch header template")
      .setDesc("Optional markdown placed above the extraction batch.\nSupports {{placeholders}}.");
    const batchHeaderTextArea = document.createElement("textarea");
    batchHeaderTextArea.placeholder = `## Extracted on {{YYYY-MM-DD HH:mm:ss}}
---`;
    batchHeaderTextArea.value = this.plugin.settings.batchHeaderTemplate;
    batchHeaderTextArea.classList.add("ai-image-ocr__template-input", "ai-image-ocr__setting-input-below");
    batchHeaderTextArea.rows = 3;
    batchHeaderTextArea.addEventListener("change", async (e) => {
      this.plugin.settings.batchHeaderTemplate = (e.target as HTMLTextAreaElement).value;
      await this.plugin.saveSettings();
    });
    batchHeaderSetting.infoEl.appendChild(batchHeaderTextArea);

    // BATCH IMAGE HEADER TEMPLATE (full-width textarea below desc)
    const batchImageHeaderSetting = new Setting(containerEl)
      .setName("Image header template")
      .setDesc("Optional markdown placed above the extracted text for each image.\nSupports {{placeholders}}.");
    const batchImageHeaderTextArea = document.createElement("textarea");
    batchImageHeaderTextArea.placeholder = `### Extracted from {{image.name}}
![{{image.name}}]({{image.path}})
`;
    batchImageHeaderTextArea.value = this.plugin.settings.batchImageHeaderTemplate;
    batchImageHeaderTextArea.classList.add("ai-image-ocr__template-input", "ai-image-ocr__setting-input-below");
    batchImageHeaderTextArea.rows = 3;
    batchImageHeaderTextArea.addEventListener("change", async (e) => {
      this.plugin.settings.batchImageHeaderTemplate = (e.target as HTMLTextAreaElement).value;
      await this.plugin.saveSettings();
    });
    batchImageHeaderSetting.infoEl.appendChild(batchImageHeaderTextArea);

    // BATCH IMAGE FOOTER TEMPLATE (full-width textarea below desc)
    const batchImageFooterSetting = new Setting(containerEl)
      .setName("Image footer template")
      .setDesc("Optional markdown placed below the extracted text for each image.\nSupports {{placeholders}}.");
    const batchImageFooterTextArea = document.createElement("textarea");
    batchImageFooterTextArea.placeholder = `---
`;
    batchImageFooterTextArea.value = this.plugin.settings.batchImageFooterTemplate;
    batchImageFooterTextArea.classList.add("ai-image-ocr__template-input", "ai-image-ocr__setting-input-below");
    batchImageFooterTextArea.rows = 2;
    batchImageFooterTextArea.addEventListener("change", async (e) => {
      this.plugin.settings.batchImageFooterTemplate = (e.target as HTMLTextAreaElement).value;
      await this.plugin.saveSettings();
    });
    batchImageFooterSetting.infoEl.appendChild(batchImageFooterTextArea);

    // BATCH FOOTER TEMPLATE (full-width textarea below desc)
    const batchFooterSetting = new Setting(containerEl)
      .setName("Batch footer template")
      .setDesc("Optional markdown placed below the extraction batch.\nSupports {{placeholders}}.");
    const batchFooterTextArea = document.createElement("textarea");
    batchFooterTextArea.placeholder = `End of Batch Extraction
`;
    batchFooterTextArea.value = this.plugin.settings.batchFooterTemplate;
    batchFooterTextArea.classList.add("ai-image-ocr__template-input", "ai-image-ocr__setting-input-below");
    batchFooterTextArea.rows = 2;
    batchFooterTextArea.addEventListener("change", async (e) => {
      this.plugin.settings.batchFooterTemplate = (e.target as HTMLTextAreaElement).value;
      await this.plugin.saveSettings();
    });
    batchFooterSetting.infoEl.appendChild(batchFooterTextArea);

    // BATCH OUTPUT TO NEW NOTE TOGGLE
    new Setting(containerEl)
      .setName("Output to new note")
      .setDesc("If enabled, batch extracted text will be saved to a new note.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.batchOutputToNewNote)
          .onChange(async (value) => {
            this.plugin.settings.batchOutputToNewNote = value;
            await this.plugin.saveSettings();
            this.display(); // Refresh to show/hide dependent fields
          }),
      );

    if (this.plugin.settings.batchOutputToNewNote) {
      const batchFolderSetting = new Setting(containerEl)
        .setName("Batch note folder path")
        .setDesc("");
      batchFolderSetting.descEl.appendText("Applied per image.");
      batchFolderSetting.descEl.createEl("br");
      batchFolderSetting.descEl.appendText("Relative to vault root. (e.g., 'OCR Notes')");
      batchFolderSetting.descEl.createEl("br");
      batchFolderSetting.descEl.appendText("Supports {{placeholders}}.");
      batchFolderSetting.addText((text) =>
        text
          .setPlaceholder("OCR Notes")
          .setValue(this.plugin.settings.batchNoteFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.batchNoteFolderPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

      new Setting(containerEl)
        .setName("Batch note name template")
        .setDesc("Applied per image. Supports {{placeholders}}.")
        .addText((text) =>
          text
            .setPlaceholder("Batch OCR {{YYYY-MM-DD}}")
            .setValue(this.plugin.settings.batchNoteNameTemplate)
            .onChange(async (value) => {
              this.plugin.settings.batchNoteNameTemplate = value;
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Batch append if file exists")
        .setDesc(
          "If enabled, appends to an existing note instead of creating a new one for batch output.",
        )
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.batchAppendIfExists)
            .onChange(async (value) => {
              this.plugin.settings.batchAppendIfExists = value;
              await this.plugin.saveSettings();
            }),
        );
    }
  }
}
