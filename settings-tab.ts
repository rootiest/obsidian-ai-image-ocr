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
        .setName("OpenAI API Key")
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
        .setName("Gemini API Key")
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
    }

    if (this.plugin.settings.provider === "custom") {

      new Setting(containerEl)
        .setName("Custom Provider Friendly Name")
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
        .setName("API Endpoint")
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
        .setName("Model Name")
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
        .setName("API Key")
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
    }

    new Setting(containerEl)
      .setName("Custom Prompt")
      .setDesc("Optional prompt to send to the model. Leave blank to use the default.")
      .addTextArea((text) =>
        text
          .setPlaceholder("e.g., Extract any handwritten notes or text from the image.")
          .setValue(this.plugin.settings.customPrompt)
          .onChange(async (value) => {
            this.plugin.settings.customPrompt = value;
            await this.plugin.saveSettings();
          })
      );

    const headerSetting = new Setting(containerEl)
      .setName("Header template")
      .setDesc("");
    headerSetting.descEl.appendText("Optional markdown placed above the extracted text.");
    headerSetting.descEl.createEl("br");
    headerSetting.descEl.appendText("Supports {{moment.js}} formatting.");

    headerSetting.addTextArea((text) => {
      text
        .setPlaceholder("### Extracted at {{YYYY-MM-DD HH:mm:ss}}\\n---")
        .setValue(this.plugin.settings.headerTemplate)
        .onChange(async (value) => {
          this.plugin.settings.headerTemplate = value;
          await this.plugin.saveSettings();
        });
      text.inputEl.classList.add("ai-image-ocr__header-textarea");
    });


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
      folderSetting.descEl.appendText("Relative to vault root (e.g., 'OCR Notes')");
      folderSetting.descEl.createEl("br");
      folderSetting.descEl.appendText("Supports {{moment.js}} formatting.");
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
        .setDesc("Supports {{moment.js}} date formatting.")
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

    // Build content safely
    descEl.createEl("strong", { text: "Tip:" });
    descEl.appendText(" When you select the text of an image embed in the editor for extraction ");
    descEl.createEl("code", { text: "![[image.png]]" });
    descEl.appendText(", the extracted text will ");
    descEl.createEl("em", { text: "replace the embed directly" });
    descEl.appendText(" — ignoring the output-to-note and header template settings above.");
  }
}
