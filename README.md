# Right-Click Clipboard Paste

A Chrome extension (Manifest V3) that pastes clipboard text when you right-click in an editable area.

## Features

- Pastes on right-click in editable fields when the field is empty, or when **Always paste** is on.
- With **Always paste** off, a **second right-click** on the same field within about half a second still pastes even if the field is not empty (no custom context menu entry).
- Optional **double right-click on selected text**: first right-click copies the selection to the clipboard; a second right-click opens the normal context menu (useful when you still want cut/copy/search).
- No custom extension context menu is used.
- Reads clipboard text during the click gesture and inserts at the caret (with selection replace for inputs and textareas).
- Works with standard text inputs (common `type` values only), textareas, and many `contenteditable` regions. Password and other non-text input types are not treated as paste targets.
- Runs as a lightweight MV3 content script across frames where the browser allows it.
- **Options** page: global enable, always paste, selection double-click behavior, and blocked sites.
- **Toolbar popup**: quick toggles for global enable, current site, always paste, and selection double right-click menu.
- **Keyboard shortcut** (configurable): toggle extension on or off globally.

## Installation (unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Choose this repository’s root folder (the folder that contains `manifest.json`).

## Usage

1. Open a page with an editable field.
2. **Empty field**: right-click inside the field; clipboard text is inserted at the caret (the normal context menu does not open for that gesture).
3. **Non-empty field**: either enable **Always paste**, or right-click twice quickly on the same field (see above).
4. **Selected text** (when the selection option is enabled and **Always paste** is off): first right-click copies the selection; second right-click shows the usual browser menu.

### Toolbar popup

1. Click the extension icon in the toolbar.
2. **Enabled globally** — turn the feature on or off everywhere.
3. **Enabled on this site** — allow or block the current hostname.
4. **Always paste** — paste on every right-click in an editable target, not only when empty.
5. **Double right-click selection for menu** — first click copies selection, second opens the context menu.

### Keyboard shortcut

1. Open `chrome://extensions/shortcuts`.
2. Find **Right-Click Clipboard Paste**.
3. Set or change **Toggle Right-Click Clipboard Paste on or off** (default suggestion: **Ctrl+Shift+Y**, **Command+Shift+Y** on Mac).
4. Use the shortcut to flip global enabled state.

## Options

1. Open `chrome://extensions`, find **Right-Click Clipboard Paste**, then **Details** → **Extension options** (or use **Open full options** in the popup).

Configure:

- **Enable extension behavior** — master on/off.
- **Always paste** — paste even when the field is not empty on a single right-click.
- **Right-click selected text twice to open context menu** — copy on first right-click, show menu on second (only when **Always paste** is off and there is a selection).
- **Blocked sites** — one rule per line (`bank.example.com`, `*.example.com`, or full `https://…` URLs).

## Permissions

- **clipboardRead** — read clipboard text during the user’s right-click gesture.
- **storage** — sync settings (enabled state, blocked sites, always paste, selection behavior).
- **tabs** — read the active tab’s URL in the popup to show and toggle the current hostname.

## Privacy

- Clipboard text is handled only in the page context for insertion; nothing is sent to a remote server.
- Blocked-site rules and settings are stored in Chrome’s extension storage (sync where available).

The extension registers `src/content/content.js` for `<all_urls>` so it can attach listeners in editable fields on ordinary web pages.

## Known limitations

- Internal Chrome URLs and some other surfaces do not run extension content scripts or may block clipboard access.
- Clipboard read uses `navigator.clipboard.readText()` and can fail depending on permissions, focus, or site policy. If read fails after the menu was suppressed, you may get neither a paste nor a context menu for that click.
- Auto-paste replaces the native context menu for gestures where paste is attempted.
- Cross-origin iframes, sandboxing, or complex editors may interfere with caret placement or scripted insertion.

## Pre-release checklist

- Confirm blocked-site rules for exact hosts and `*.` wildcards.
- Confirm global off disables all intervention.
- Test clipboard-denied pages (no paste, menu behavior as above).
- Test plain `input`, `textarea`, and typical `contenteditable` editors.
- Confirm store listing text matches **clipboardRead**, **storage**, and **tabs**.
