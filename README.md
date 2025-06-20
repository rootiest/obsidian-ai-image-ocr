<!--
 Copyright (c) 2025 Chris Laprade (chris@rootiest.com)

 This software is released under the MIT License.
 https://opensource.org/licenses/MIT
-->

# Obsidian AI Image OCR Plugin

A plugin for Obsidian that extracts text from images using
OCR powered by AI image recognition.

This is simple plugin for extremely accurate and reliable
text and handwriting recognition in images.

AI tools are very reliable at text extraction
compared to typically-used tools such as tesseract.

## Supported Models

### OpenAI GPT-4o

- A powerful model for text extraction
- Not free, but very inexpensive. See: [Pricing](https://platform.openai.com/docs/pricing)
- Requires [OpenAI API key](https://platform.openai.com/settings/organization/api-keys)
- See [Notes](#notes) for OpenAI API key requirements.

### Google Gemini Flash 1.5

- A fast and efficient model for text extraction
- Free tier available with generous rate limits. See: [Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- Requires [Google API key](https://aistudio.google.com/apikey)

## Features

- Extract text from images directly into your Obsidian notes
- Supports [multiple AI models](#supported-models) for text extraction
- Supports common image formats (PNG, JPG, WEBM, etc.)
- Simple and easy-to-use commands
- Returned text will be in markdown format
- Select an image via your OS-native file picker
- Use embedded images as the source
- Choose to output extracted text to a new note or append to an existing note
- [Customizable](#configuration) header template for extracted text
- Supports [moment.js](https://momentjs.com/docs/#/displaying/format/) date
  formatting in header template and filename template
- Replaces [selected image embeds](#notes) directly with extracted text
- Image embeds that are not selected will remain intact

## Installation

### Install via BRAT

If you have the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin installed,
you can install this plugin using the BRAT plugin manager:

1. Click `Add beta plugin`.
2. Enter `https://github.com/rootiest/obsidian-ai-image-ocr`
   in the `Repository URL` field.
3. (Optionally) Check the `Enable after installing the plugin`
   checkbox to enable the plugin immediately after installation.
4. Click `Add plugin`

### Manual Installation

Clone this repository to
your vault plugins directory (`<vault-name>/.obsidian/plugins/`)

```sh
git clone https://github.com/rootiest/obsidian-ai-image-ocr.git
```

Or download the [plugin archive](https://github.com/rootiest/obsidian-ai-image-ocr/archive/refs/heads/main.zip)
and extract to your plugins directory.

## Configuration

**These settings are required:**

- Select your preferred model in the plugin settings via the `Provider` field.
  See [Supported Models](#supported-models) for more information on available models.

- Enter your API key for the selected model in the `API Key` field.

**The remaining settings are all optional:**

- Configure a `Header Template`  
  This is a block of markdown text
  that will be inserted before the extracted text.  
  This can be used to add a title, date, or other information.  
   [moment.js](https://momentjs.com/docs/#/displaying/format/) formatting
  of dates and times is supported, e.g. `{{YYYY-MM-DD HH:mm:ss}}`.

- Choose to output the extracted text to another note.  
   This can be useful for keeping your extracted text organized into
  individual notes.

- If you choose to output to another note, you can configure the
  folder path where the note will be created.

- You can also specify a filename template for the created note,
  which will support the same
  [moment.js](https://momentjs.com/docs/#/displaying/format/) formatting
  mentioned above.

- Finally, you can choose whether to append the extracted text to the note if
  it already exists or create a new note with an incremented filename.

## Usage

### Open An Image For Extraction

1. Use the command palette (`Ctrl+P`) and search for "Extract Text from Image".
2. Select the source image from the image selection window.
3. The image data will be transmitted to the AI model for text extraction.
4. The text from your image will be
   inserted according to your settings configuration.

### Extract Text From An Embedded Image

1. Place your cursor in the note where you
   want to insert the extracted text.
2. If the image embed is not selected,
   the plugin will find the nearest image embed above the cursor.
3. Use the command palette (`Ctrl+P`) and
   search for "Extract Text from Embedded Image".
4. The text from the embedded image will be
   inserted according to your settings configuration.

## Notes

---

> [!TIP]
> You can select an image embed in your note to use it as the source
> _and_ replace it with the extracted text.

---

> [!NOTE]
> When using OpenAI:  
> The API key to use for authentication with the service.  
> This cannot be a "project" key (`sk-proj`).  
> A user or service account key is required.

---

> [!WARNING]
> CORS security restrictions may prevent the plugin
> from collecting externally linked images.  
> A CORS proxy is used as a fallback to collect external images
> when direct access fails.
> If an image is still not accessible,
> you may need to download it manually before extracting text.

---

## Requirements

- Internet connection
- An OpenAI or Google Gemini API key

## License

MIT

## Credits

Powered by GPT and open-source OCR libraries.
