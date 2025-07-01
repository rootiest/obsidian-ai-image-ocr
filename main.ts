import {
  Plugin,
  PluginSettingTab,
  App,
  Setting,
  Notice,
  TFile,
  MarkdownView,
  MarkdownFileInfo,
  RequestUrlResponse,
  Editor,
  EditorPosition,
  requestUrl,
} from "obsidian";

interface GPTImageOCRSettings {

  provider:
  | "openai"
  | "openai-mini"
  | "openai-4.1"
  | "openai-4.1-mini"
  | "openai-4.1-nano"
  | "gemini"
  | "gemini-lite"
  | "gemini-pro"
  | "ollama"
  | "lmstudio"
  | "custom";

  openaiApiKey: string;
  geminiApiKey: string;
  ollamaUrl: string;
  ollamaModel: string;
  lmstudioUrl: string;
  lmstudioModel: string;
  customApiUrl: string;
  customApiModel: string;
  customApiKey: string;

  outputToNewNote: boolean;
  noteFolderPath: string;
  noteNameTemplate: string;
  appendIfExists: boolean;
  headerTemplate: string;
}

const FRIENDLY_PROVIDER_NAMES: Record<GPTImageOCRSettings["provider"], string> = {
  openai: "OpenAI GPT-4o",
  "openai-mini": "OpenAI GPT-4o Mini",
  "openai-4.1": "OpenAI GPT-4.1",
  "openai-4.1-mini": "OpenAI GPT-4.1 Mini",
  "openai-4.1-nano": "OpenAI GPT-4.1 Nano",
  gemini: "Google Gemini 2.5 Flash",
  "gemini-lite": "Google Gemini 2.5 Flash-Lite Preview 06-17",
  "gemini-pro": "Google Gemini 2.5 Pro",
  ollama: "Ollama",
  lmstudio: "LMStudio",
  custom: "Custom Provider"
};

const DEFAULT_SETTINGS: GPTImageOCRSettings = {
  provider: "openai",
  openaiApiKey: "",
  geminiApiKey: "",
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: "llama3.2-vision",
  lmstudioUrl: 'http://localhost:1234',
  lmstudioModel: "google/gemma-3-4b",
  customApiUrl: "",
  customApiModel: "",
  customApiKey: "",
  outputToNewNote: false,
  noteFolderPath: "",
  noteNameTemplate: "Extracted OCR {{YYYY-MM-DD HH-mm-ss}}",
  appendIfExists: false,
  headerTemplate: "",
};

interface OCRProvider {
  id: string;
  name: string;
  extractTextFromBase64(image: string): Promise<string | null>;
}

type OpenAIPayload = {
  model: string;
  messages: Array<{
    role: string;
    content: Array<any>;
  }>;
  max_tokens: number;
};

type OllamaPayload = {
  model: string;
  messages: Array<{
    role: string;
    content: string;
    images: string[];
  }>;
  max_tokens: number;
  stream: boolean;
};

type LmstudioPayload = {
  model: string;
  messages: Array<{
    role: string;
    content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;
  } | {
    role: string;
    content: string;
  }>;
  max_tokens: number;
};

class OpenAIProvider implements OCRProvider {
  id: string;
  name: string;

  constructor(
    private apiKey: string,
    private model: string = "gpt-4o",
    private endpoint: string = "https://api.openai.com/v1/chat/completions",
    private provider: "openai" | "ollama" | "lmstudio" = "openai",
    nameOverride?: string
  ) {
    this.id = provider;
    this.name = nameOverride ?? model;
  }

  async extractTextFromBase64(image: string): Promise<string | null> {
    let payload: OpenAIPayload | OllamaPayload | LmstudioPayload;
    let endpoint = this.endpoint;

    if (this.provider === "ollama") {
      // Remove any data: prefix for base64 image
      const cleanImage = image.replace(/^data:image\/\w+;base64,/, "");
      payload = {
        model: this.model,
        messages: [
          {
            role: "user",
            content: "Extract only the raw text from this image. Do not add commentary or explanations. Do not prepend anything. Return only the transcribed text in markdown format. Do not put a markdown codeblock around the returned text.",
            images: [cleanImage],
          },
        ],
        max_tokens: 1024,
        stream: false,
      };
      endpoint = (this.endpoint ?? "http://localhost:11434") + "/api/chat";
    } else if (this.provider === "lmstudio") {
      const cleanImage = image.replace(/^data:image\/\w+;base64,/, "");
      payload = {
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an AI assistant that analyzes images."
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract only the raw text from this image. Do not add commentary or explanations. Do not prepend anything. Return only the transcribed text in markdown format. Do not put a markdown codeblock around the returned text.", },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
            ]
          }
        ],
        max_tokens: 1024,
      };
      endpoint = (this.endpoint ?? "http://localhost:1234") + "/api/v0/chat/completions";
    } else {
      payload = {
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${image}` },
              },
              {
                type: "text",
                text: "Extract only the raw text from this image. Do not add commentary or explanations. Do not prepend anything. Return only the transcribed text in markdown format. Do not put a markdown codeblock around the returned text.",
              },
            ],
          },
        ],
        max_tokens: 1024,
      };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.provider === "openai") {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await requestUrl({
        url: endpoint,
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (this.provider === "ollama") {
        // The response is { message: { role, content } }
        const data = parseJsonResponse(response, d => !!d.message?.content);
        const content = data.message?.content?.trim();
        if (content) return content;
        console.warn("Ollama response did not contain expected text:", data);
        return null;
      } else {
        // OpenAI style response
        const data = parseJsonResponse(response, d => Array.isArray(d.choices));
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) return content;
        console.warn(`${this.provider} response did not contain expected text:`, data);
        return null;
      }
    } catch (err) {
      console.error(`${this.provider} fetch error:`, err);
      return null;
    }
  }
}

class GeminiProvider implements OCRProvider {
  id = "gemini";
  name: string;

  constructor(
    private apiKey: string,
    private model: string = "models/gemini-2.5-flash",
    nameOverride?: string
  ) {
    this.name = nameOverride ?? model.replace(/^models\//, "");
  }

  async extractTextFromBase64(image: string): Promise<string | null> {
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: image,
              },
            },
            {
              text: "Extract only the raw text from this image. Do not add commentary or explanations. Do not prepend anything. Return only the transcribed text in markdown format. Do not put a markdown codeblock around the returned text.",
            },
          ],
        },
      ],
    };

    try {
      const response = await requestUrl({
        url: `https://generativelanguage.googleapis.com/v1beta/${this.model}:generateContent?key=${this.apiKey}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = parseJsonResponse(response, d => Array.isArray(d.candidates));

      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text.trim();
      }

      console.warn("Gemini response did not contain expected text:", data);
      return null;
    } catch (err) {
      console.error("Gemini fetch error:", err);
      return null;
    }
  }
}

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


  getProvider(): OCRProvider {
    const { provider, openaiApiKey, geminiApiKey } = this.settings;
    const name = FRIENDLY_PROVIDER_NAMES[provider];

    if (provider === "gemini") {
      return new GeminiProvider(geminiApiKey, "models/gemini-2.5-flash", name);
    } else if (provider === "gemini-lite") {
      return new GeminiProvider(geminiApiKey, "models/gemini-2.5-flash-lite-preview-06-17", name);
    } else if (provider === "gemini-pro") {
      return new GeminiProvider(geminiApiKey, "models/gemini-2.5-pro", name);
    } else if (provider === "openai-mini") {
      return new OpenAIProvider(openaiApiKey, "gpt-4o-mini", name);
    } else if (provider === "openai") {
      return new OpenAIProvider(openaiApiKey, "gpt-4o", name);
    } else if (provider === "openai-4.1") {
      return new OpenAIProvider(openaiApiKey, "gpt-4.1", name);
    } else if (provider === "openai-4.1-mini") {
      return new OpenAIProvider(openaiApiKey, "gpt-4.1-mini", name);
    } else if (provider === "openai-4.1-nano") {
      return new OpenAIProvider(openaiApiKey, "gpt-4.1-nano", name);
    } else if (provider === "ollama") {
      return new OpenAIProvider(
        "", // no api key
        this.settings.ollamaModel || "llama3.2-vision",
        (this.settings.ollamaUrl?.replace(/\/$/, "") || "http://localhost:11434"),
        "ollama",
        name
      );
    } else if (provider === "lmstudio") {
      return new OpenAIProvider(
        "", // no api key
        this.settings.lmstudioModel || "gemma3",
        (this.settings.lmstudioUrl?.replace(/\/$/, "") || "http://localhost:1234"),
        "lmstudio",
        name
      );
    } else if (provider === "custom") {
      return new OpenAIProvider(
        this.settings.customApiKey || "",
        this.settings.customApiModel || "gpt-4",
        this.settings.customApiUrl || "https://example.com/v1/chat/completions",
        "openai", // still uses openai-style response
        name
      );
    } else {
      throw new Error("Unknown provider");
    }
  }


  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class GPTImageOCRSettingTab extends PluginSettingTab {
  plugin: GPTImageOCRPlugin;

  constructor(app: App, plugin: GPTImageOCRPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

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
            this.plugin.settings.provider = value as "openai" | "openai-mini" | "gemini" | "gemini-lite" | "gemini-pro" | "ollama" | "lmstudio" | "custom";
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
        .setName("Ollama Server URL")
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
        .setName("Ollama Model Name")
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
        .setName("LMStudio Server URL")
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
        .setName("LMStudio Model Name")
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
        .setName("Model ID")
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

// --------- Helper Functions ---------

function moveCursorToEnd(editor: Editor) {
  requestAnimationFrame(() => {
    const lastLine = editor.lastLine();
    const lastCh = editor.getLine(lastLine)?.length || 0;
    editor.setCursor({ line: lastLine, ch: lastCh });
    scrollEditorToCursor(editor);
  });
}

function scrollEditorToCursor(editor: Editor) {
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


function parseJsonResponse(
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


async function handleExtractedContent(
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
 * Returns { link: string, isExternal: boolean } or null.
 */
function findRelevantImageEmbed(editor: Editor): {
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

function parseEmbedLink(link: string): { link: string; isExternal: boolean } {
  // Internal if not a URL
  const isExternal = /^https?:\/\//i.test(link);
  // For ![[my image.png|resize]] strip any pipe-suffixes
  const normalized = link.split("|")[0].trim();
  return { link: normalized, isExternal };
}

// Helper to resolve full internal image path from short link
function resolveInternalImagePath(app: App, link: string): TFile | null {
  let file = app.vault.getAbstractFileByPath(link);
  if (file instanceof TFile) return file;
  return app.vault.getFiles().find(f => f.name === link) || null;
}

async function fetchExternalImageAsArrayBuffer(
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const binary = new Uint8Array(buffer).reduce(
    (acc, byte) => acc + String.fromCharCode(byte),
    "",
  );
  return btoa(binary);
}

async function selectImageFile(): Promise<File | null> {
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

function getEmbeddedImagePath(editor: Editor): string | null {
  const line = editor.getLine(editor.getCursor().line);
  const match = line.match(/!\[\[(.+\.(?:png|jpe?g|webp|gif))\]\]/i);
  return match ? match[1] : null;
}
