var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => GPTImageOCRPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  provider: "openai",
  openaiApiKey: "",
  geminiApiKey: ""
};
var OpenAIProvider = class {
  constructor(apiKey) {
    this.apiKey = apiKey;
    __publicField(this, "id", "openai");
    __publicField(this, "name", "OpenAI GPT-4o");
  }
  async extractTextFromBase64(image) {
    const payload = {
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${image}` }
            },
            {
              type: "text",
              text: "Extract only the raw text from this image. Do not add commentary or explanations. Do not prepend anything. Return only the transcribed text in markdown format."
            }
          ]
        }
      ],
      max_tokens: 1024
    };
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  }
};
var GeminiProvider = class {
  constructor(apiKey) {
    this.apiKey = apiKey;
    __publicField(this, "id", "gemini");
    __publicField(this, "name", "Google Gemini 1.5 Flash");
  }
  async extractTextFromBase64(image) {
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inline_data: {
                mime_type: "image/jpeg",
                // update dynamically if desired
                data: image
              }
            },
            {
              text: "Extract only the raw text from this image. Do not add commentary or explanations. Do not prepend anything. Return only the transcribed text in markdown format."
            }
          ]
        }
      ]
    };
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json();
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
};
var GPTImageOCRPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings");
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "extract-text-from-image",
      name: "Extract Text from Image",
      callback: async () => {
        const file = await selectImageFile();
        if (!file) {
          new import_obsidian.Notice("No file selected.");
          return;
        }
        const arrayBuffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        const provider = this.getProvider();
        const notice = new import_obsidian.Notice(`Using ${provider.name}\u2026`, 0);
        try {
          const content = await provider.extractTextFromBase64(base64);
          notice.hide();
          if (content) {
            const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
            if (view) {
              view.editor.replaceSelection(content);
            } else {
              new import_obsidian.Notice("No active editor found.");
            }
          } else {
            new import_obsidian.Notice("No content returned.");
          }
        } catch (e) {
          notice.hide();
          console.error("OCR failed:", e);
          new import_obsidian.Notice("Failed to extract text.");
        }
      }
    });
    this.addSettingTab(new GPTImageOCRSettingTab(this.app, this));
  }
  getProvider() {
    const { provider, openaiApiKey, geminiApiKey } = this.settings;
    if (provider === "gemini") {
      return new GeminiProvider(geminiApiKey);
    } else {
      return new OpenAIProvider(openaiApiKey);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var GPTImageOCRSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    __publicField(this, "plugin");
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "OCR Plugin Settings" });
    new import_obsidian.Setting(containerEl).setName("Provider").setDesc("Choose which OCR provider to use.").addDropdown(
      (dropdown) => dropdown.addOption("openai", "OpenAI GPT-4o").addOption("gemini", "Google Gemini 1.5 Flash").setValue(this.plugin.settings.provider).onChange(async (value) => {
        this.plugin.settings.provider = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (this.plugin.settings.provider === "openai") {
      new import_obsidian.Setting(containerEl).setName("OpenAI API Key").setDesc("Your OpenAI API key").addText(
        (text) => text.setPlaceholder("sk-...").setValue(this.plugin.settings.openaiApiKey).onChange(async (value) => {
          this.plugin.settings.openaiApiKey = value.trim();
          await this.plugin.saveSettings();
        })
      );
    }
    if (this.plugin.settings.provider === "gemini") {
      new import_obsidian.Setting(containerEl).setName("Gemini API Key").setDesc("Your Google Gemini API key").addText(
        (text) => text.setPlaceholder("AIza...").setValue(this.plugin.settings.geminiApiKey).onChange(async (value) => {
          this.plugin.settings.geminiApiKey = value.trim();
          await this.plugin.saveSettings();
        })
      );
    }
  }
};
function arrayBufferToBase64(buffer) {
  const binary = new Uint8Array(buffer).reduce(
    (acc, byte) => acc + String.fromCharCode(byte),
    ""
  );
  return btoa(binary);
}
async function selectImageFile() {
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
