import {
  Plugin,
  PluginSettingTab,
  App,
  Setting,
  Notice,
  TFile,
  MarkdownView,
  Editor,
  requestUrl,
} from "obsidian";

interface GPTImageOCRSettings {
  provider: "openai" | "gemini";
  openaiApiKey: string;
  geminiApiKey: string;

  outputToNewNote: boolean;
  noteFolderPath: string;
  noteNameTemplate: string;
  appendIfExists: boolean;
  headerTemplate: string;
}

const DEFAULT_SETTINGS: GPTImageOCRSettings = {
  provider: "openai",
  openaiApiKey: "",
  geminiApiKey: "",
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

class OpenAIProvider implements OCRProvider {
  id = "openai";
  name = "OpenAI GPT-4o";

  constructor(private apiKey: string) { }

  async extractTextFromBase64(image: string): Promise<string | null> {
    const payload = {
      model: "gpt-4o",
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

    try {
      const response = await requestUrl({
        url: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = parseJsonResponse(response, d => Array.isArray(d.choices));

      const content = data.choices?.[0]?.message?.content?.trim();

      if (content) {
        return content;
      }

      console.warn("OpenAI response did not contain expected text:", data);
      return null;
    } catch (err) {
      console.error("OpenAI fetch error:", err);
      return null;
    }
  }
}

class GeminiProvider implements OCRProvider {
  id = "gemini";
  name = "Google Gemini 1.5 Flash";

  constructor(private apiKey: string) { }

  async extractTextFromBase64(image: string): Promise<string | null> {
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inline_data: {
                mime_type: "image/jpeg", // update dynamically if desired
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
        url: `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
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

  async onload() {
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
      // Update extract-text-from-embedded-image command
      // Inside editorCallback:
      editorCallback: async (editor: Editor, view: MarkdownView) => {
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
          .addOption("gemini", "Google Gemini 1.5 Flash")
          .setValue(this.plugin.settings.provider)
          .onChange(async (value) => {
            this.plugin.settings.provider = value as "openai" | "gemini";
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (this.plugin.settings.provider === "openai") {
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

    if (this.plugin.settings.provider === "gemini") {
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
      editor.replaceSelection(content);
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
    // If append is off, ensure a unique note is created
    if (plugin.settings.appendIfExists) {
      const existing = await plugin.app.vault.read(file);
      await plugin.app.vault.modify(file, existing + "\n\n" + content);
      await plugin.app.workspace.getLeaf(true).openFile(file);
      return;
    } else {
      // Find and create a unique file
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

  await plugin.app.workspace.getLeaf(true).openFile(file);
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
