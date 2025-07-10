// Copyright (c) 2025 Chris Laprade (chris@rootiest.com)
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { Editor, EditorPosition } from "obsidian";
import { pluginLog } from "./log";

/**
 * Moves the editor cursor to the end of the document and scrolls into view.
 */
export function moveCursorToEnd(editor: Editor) {
  requestAnimationFrame(() => {
    const lastLine = editor.lastLine();
    const lastCh = editor.getLine(lastLine)?.length || 0;
    editor.setCursor({ line: lastLine, ch: lastCh });
    scrollEditorToCursor(editor);
  });
}

/**
 * Scrolls the editor view to the current cursor position.
 */
export function scrollEditorToCursor(editor: Editor) {
  try {
    const maybeCM = (editor as Editor & { cm?: unknown }).cm;
    if (
      maybeCM &&
      typeof maybeCM === "object" &&
      "scrollIntoView" in maybeCM &&
      typeof (maybeCM as { scrollIntoView?: unknown }).scrollIntoView ===
        "function"
    ) {
      (maybeCM as { scrollIntoView: (pos: EditorPosition, margin?: number) => void }).scrollIntoView(
        editor.getCursor(),
        100
      );
    }
  } catch (e) {
    pluginLog(
      `scrollIntoView failed or is unsupported in this version: ${e}`,
      "warn",
      true
    );
  }
}
