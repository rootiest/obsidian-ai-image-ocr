// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { Notice } from "obsidian";

// Global debug mode variable (set this in your plugin settings or main class)
export let DEBUG_MODE = false;

export function setDebugMode(enabled: boolean) {
  DEBUG_MODE = enabled;
}

/**
 * Outputs a message to the console or as a notification, depending on type and debug mode.
 * @param message The message or error to output.
 * @param type 'log' | 'warn' | 'error' | 'notice' (default: 'log')
 * @param always If true, output even if debug mode is off.
 */
export function pluginLog(
  message: string | Error,
  type: "log" | "warn" | "error" | "notice" | "permanent" = "log",
  always: boolean = false
) {
  if (!DEBUG_MODE && !always) return;

  const prefix = "[AI Image OCR]";
  if (type === "permanent") {
    new Notice(message instanceof Error ? message.message : message, 0);
    return;
  }
  if (type === "notice") {
    new Notice(message instanceof Error ? message.message : message, 5000);
    return;
  }

  if (message instanceof Error) {
    switch (type) {
      case "warn":
        console.warn(prefix, message.message, message);
        break;
      case "error":
        console.error(prefix, message.message, message);
        break;
      default:
        console.log(prefix, message.message, message);
    }
  } else {
    switch (type) {
      case "warn":
        console.warn(prefix, message);
        break;
      case "error":
        console.error(prefix, message);
        break;
      default:
        console.log(prefix, message);
    }
  }
}