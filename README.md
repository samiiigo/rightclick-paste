# Right-Click Clipboard Paste

A Chrome Extension (Manifest V3) that pastes clipboard text directly when you right-click inside an editable area.

## Features

- Pastes immediately on right-click inside editable content (input, textarea, contenteditable).
- No custom extension context menu is used.
- Reads clipboard text at click time and inserts it into the clicked editor.
- Handles caret insertion, selection replacement, and empty-field paste.
- Works with standard text inputs, textareas, and many contenteditable editors.
- Runs through a lightweight MV3 content script across frames where permitted.

## Installation (Unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder (`rightclick-paste`).

## Usage

1. Open any page with an editable field.
2. Right-click inside the field.
3. Clipboard text is pasted immediately at the caret (or replaces selection).

## Permissions

- `clipboardRead`: read clipboard text from the right-click user gesture.

The extension injects `content.js` on all URLs via `content_scripts` so it can listen for right-click events in editable fields.

## Known limitations

- Some sites and browser surfaces (for example internal Chrome pages) block extension scripts or clipboard reads.
- Clipboard access via `navigator.clipboard.readText()` can fail on certain pages depending on user activation and site/browser restrictions.
- If direct clipboard read fails, the extension falls back to a manual prompt. This requires you to paste text yourself and can be less convenient.
- The extension suppresses the normal right-click context menu for editable targets where auto-paste is attempted.
- Complex editors in cross-origin iframes or heavily sandboxed environments may interfere with scripted paste behavior.
