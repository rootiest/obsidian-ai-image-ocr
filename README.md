<!--
 Copyright (c) 2025 Chris Laprade (chris@rootiest.com)

 This software is released under the MIT License.
 https://opensource.org/licenses/MIT
-->

# Obsidian AI Image OCR Plugin

A plugin for Obsidian that extracts text from images using OCR powered by AI image recognition.

This is simple plugin for extremely accurate and reliable text and handwriting recognition in images.

AI tools are very reliable at text extraction compared to typically-used tools such as tesseract.

> [!NOTE]
> At this time GPT-4o is the only supported model.

## Features

- Extract text from images directly into your Obsidian notes
- Supports common image formats (PNG, JPG, WEBM, etc.)
- Simple and easy-to-use command

## Installation

Clone this repository to your vault plugins directory (`<vault-name>/.obsidian/plugins/`)

```sh
git clone https://github.com/rootiest/obsidian-ai-image-ocr.git
```

Or download the [plugin archive](https://github.com/rootiest/obsidian-ai-image-ocr/archive/refs/heads/main.zip) and extract to your plugins directory.

## Configuration

Enter or paste your [OpenAI API Key](https://platform.openai.com/api-keys) into the API key settings field.

## Usage

1. Use the command palette (`Ctrl+P`) and search for "Extract Text from Image".
2. Select the source image from the image selection window.
3. The text from your image will be inserted into the current note at the cursor.

## Requirements

- Internet connection
- An OpenAI API key

## Settings

- API key: The OpenAI API key to use for authentication with the service  
  This cannot be a "project" key (`sk-proj`). A user or service account key is required.

## License

MIT

## Credits

Powered by GPT and open-source OCR libraries.
