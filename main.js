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
  geminiApiKey: "",
  outputToNewNote: false,
  noteFolderPath: "",
  noteNameTemplate: "Extracted OCR {{YYYY-MM-DD HH-mm-ss}}",
  appendIfExists: false,
  headerTemplate: ""
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
              text: "Extract only the raw text from this image. Do not add commentary or explanations. Do not prepend anything. Return only the transcribed text in markdown format. Do not put a markdown codeblock around the returned text."
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
              text: "Extract only the raw text from this image. Do not add commentary or explanations. Do not prepend anything. Return only the transcribed text in markdown format. Do not put a markdown codeblock around the returned text."
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
            await handleExtractedContent(this, content, editor ?? null);
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
    this.addCommand({
      id: "extract-text-from-embedded-image",
      name: "Extract Text from Embedded Image",
      // ✅ Update extract-text-from-embedded-image command
      // Inside editorCallback:
      editorCallback: async (editor2, view) => {
        const sel = editor2.getSelection();
        const embedMatch = sel.match(/!\[\[.*?\]\]/) || sel.match(/!\[.*?\]\(.*?\)/);
        const embed = findRelevantImageEmbed(editor2);
        if (!embed) {
          new import_obsidian.Notice("No image embed found.");
          return;
        }
        const { link, isExternal } = embed;
        let arrayBuffer = null;
        if (isExternal) {
          try {
            arrayBuffer = await fetchExternalImageAsArrayBuffer(link);
          } catch (e) {
            new import_obsidian.Notice("Failed to fetch external image.");
            return;
          }
        } else {
          const file = resolveInternalImagePath(this.app, link);
          if (file instanceof import_obsidian.TFile) {
            arrayBuffer = await this.app.vault.readBinary(file);
          } else {
            new import_obsidian.Notice("Image file not found in vault.");
            return;
          }
        }
        if (!arrayBuffer) {
          new import_obsidian.Notice("Could not read image data.");
          return;
        }
        const base64 = arrayBufferToBase64(arrayBuffer);
        const provider = this.getProvider();
        const notice = new import_obsidian.Notice(
          `Extracting from embed with ${provider.name}\u2026`,
          0
        );
        try {
          const content = await provider.extractTextFromBase64(base64);
          notice.hide();
          if (!content) {
            new import_obsidian.Notice("No content returned.");
            return;
          }
          if (embedMatch && sel === embedMatch[0]) {
            editor2.replaceSelection(content);
            return;
          }
          await handleExtractedContent(this, content, editor2 ?? null);
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
    new import_obsidian.Setting(containerEl).setName("Header template").setDesc(
      "Optional markdown placed above the extracted text. Supports {{moment.js}} formatting."
    ).addTextArea(
      (text) => text.setPlaceholder("### Extracted at {{YYYY-MM-DD HH:mm:ss}}\\n---").setValue(this.plugin.settings.headerTemplate).onChange(async (value) => {
        this.plugin.settings.headerTemplate = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Output to new note").setDesc("If enabled, extracted text will be saved to a new note.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.outputToNewNote).onChange(async (value) => {
        this.plugin.settings.outputToNewNote = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (this.plugin.settings.outputToNewNote) {
      new import_obsidian.Setting(containerEl).setName("Note folder path").setDesc("Relative to vault root (e.g., 'OCR Notes')").addText(
        (text) => text.setPlaceholder("OCR Notes").setValue(this.plugin.settings.noteFolderPath).onChange(async (value) => {
          this.plugin.settings.noteFolderPath = value.trim();
          await this.plugin.saveSettings();
        })
      );
      new import_obsidian.Setting(containerEl).setName("Note name template").setDesc("Supports {{moment.js}} date formatting.").addText(
        (text) => text.setPlaceholder("Extracted OCR {{YYYY-MM-DD}}").setValue(this.plugin.settings.noteNameTemplate).onChange(async (value) => {
          this.plugin.settings.noteNameTemplate = value;
          await this.plugin.saveSettings();
        })
      );
      new import_obsidian.Setting(containerEl).setName("Append if file exists").setDesc(
        "If enabled, appends to an existing note instead of creating a new one."
      ).addToggle(
        (toggle) => toggle.setValue(this.plugin.settings.appendIfExists).onChange(async (value) => {
          this.plugin.settings.appendIfExists = value;
          await this.plugin.saveSettings();
        })
      );
    }
    containerEl.createEl("hr");
    containerEl.createEl("div", {
      cls: "setting-item-description"
    }).innerHTML = `
    <strong>Tip:</strong> When you select the text of an image embed in the editor for extraction
    (e.g. <code>![[image.png]]</code>)<br> the extracted text will
    <em>replace the embed directly</em> \u2014 ignoring the output-to-note
    and header template settings above.
    `;
  }
};
async function handleExtractedContent(plugin, content, editor2) {
  const moment = window.moment;
  let header = plugin.settings.headerTemplate || "";
  if (header.trim()) {
    header = header.replace(
      /{{(.*?)}}/g,
      (_, fmt) => moment().format(fmt.trim())
    );
    content = header + "\n\n" + content;
  }
  if (!plugin.settings.outputToNewNote) {
    if (editor2) {
      editor2.replaceSelection(content);
    } else {
      new import_obsidian.Notice("No active editor to paste into.");
    }
    return;
  }
  const name = plugin.settings.noteNameTemplate.replace(
    /{{(.*?)}}/g,
    (_, fmt) => moment().format(fmt.trim())
  );
  const folder = plugin.settings.noteFolderPath.trim();
  const path = folder ? `${folder}/${name}.md` : `${name}.md`;
  if (folder) {
    const folderExists = plugin.app.vault.getAbstractFileByPath(folder);
    if (!folderExists) {
      try {
        await plugin.app.vault.createFolder(folder);
      } catch (err) {
        new import_obsidian.Notice(`Failed to create folder "${folder}".`);
        console.error(err);
        return;
      }
    }
  }
  let file = plugin.app.vault.getAbstractFileByPath(path);
  if (file instanceof import_obsidian.TFile) {
    if (plugin.settings.appendIfExists) {
      const existing = await plugin.app.vault.read(file);
      await plugin.app.vault.modify(file, existing + "\n\n" + content);
      await plugin.app.workspace.getLeaf(true).openFile(file);
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
      file = await plugin.app.vault.create(uniquePath, content);
    }
  } else {
    try {
      file = await plugin.app.vault.create(path, content);
    } catch (err) {
      new import_obsidian.Notice(`Failed to create note at "${path}".`);
      console.error(err);
      return;
    }
  }
  await plugin.app.workspace.getLeaf(true).openFile(file);
}
function findRelevantImageEmbed(editor2) {
  const sel = editor2.getSelection();
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
      embedType: "external"
    };
  }
  for (let i = editor2.getCursor().line; i >= 0; i--) {
    const line = editor2.getLine(i);
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
        embedType: "external"
      };
    }
  }
  return null;
}
function resolveInternalImagePath(app, link) {
  let file = app.vault.getAbstractFileByPath(link);
  if (file instanceof import_obsidian.TFile) return file;
  return app.vault.getFiles().find((f) => f.name === link) || null;
}
async function fetchExternalImageAsArrayBuffer(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.arrayBuffer();
  } catch (e) {
    console.warn("Direct image fetch blocked by CORS, trying proxy\u2026");
    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} from proxy`);
      return await resp.arrayBuffer();
    } catch (e2) {
      console.error("Failed to fetch image.");
      new import_obsidian.Notice(
        "Failed to fetch image.\nIf you can see the image in preview, right-click and 'Save image to vault',\nthen run OCR on the saved copy."
      );
      return null;
    }
  }
}
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
