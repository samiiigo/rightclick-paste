# Right-Click Clipboard Paste

A Chrome Extension (Manifest V3) that pastes clipboard text directly when you right-click inside an editable area.

## Features

- Pastes immediately on right-click inside editable content (input, textarea, contenteditable).
- No custom extension context menu is used.
- Reads clipboard text at click time and inserts it into the clicked editor.
- Handles caret insertion, selection replacement, and empty-field paste.
- Works with standard text inputs, textareas, and many contenteditable editors.
- Runs through a lightweight MV3 content script across frames where permitted.
- Does not target password fields.
- Includes an options page to enable/disable behavior and block specific sites.
- Includes a toolbar popup to quickly toggle globally and for the current site.
- Includes a keyboard command to toggle the extension enabled state.

## Installation (Unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder (`rightclick-paste`).

## Usage

1. Open any page with an editable field.
2. Right-click inside the field.
3. Clipboard text is pasted immediately at the caret (or replaces selection).

### Quick popup controls

1. Click the extension icon in the Chrome toolbar.
2. Use **Enabled globally** to turn the feature on/off everywhere.
3. Use **Enabled on this site** to allow/block the current hostname quickly.

### Keyboard shortcut

1. Open `chrome://extensions/shortcuts`.
2. Find **Right-Click Clipboard Paste**.
3. Assign or change the shortcut for **Toggle Right-Click Clipboard Paste on or off**.
4. Press the shortcut to flip global enabled status instantly.

## Options

1. Open `chrome://extensions`.
2. Find **Right-Click Clipboard Paste**.
3. Click **Details** -> **Extension options**.
4. Configure:
	- **Enable extension behavior**: turn auto-paste on/off globally.
	- **Blocked sites**: one rule per line (for example `bank.example.com`, `*.example.com`, or full URLs).

## Permissions

- `clipboardRead`: read clipboard text from the right-click user gesture.
- `storage`: persist extension options (enabled toggle and blocked sites).
- `tabs`: detect current tab hostname for popup site toggle.

## Privacy

- Clipboard text is processed locally in the page context for insertion.
- The extension does not send clipboard contents to any remote service.
- Blocked-site rules are stored locally with Chrome extension storage sync.

The extension injects `content.js` on all URLs via `content_scripts` so it can listen for right-click events in editable fields.

## Known limitations

- Some sites and browser surfaces (for example internal Chrome pages) block extension scripts or clipboard reads.
- Clipboard access via `navigator.clipboard.readText()` can fail on certain pages depending on user activation and site/browser restrictions.
- If direct clipboard read fails, the extension falls back to a manual prompt. This requires you to paste text yourself and can be less convenient.
- The extension suppresses the normal right-click context menu for editable targets where auto-paste is attempted.
- Complex editors in cross-origin iframes or heavily sandboxed environments may interfere with scripted paste behavior.

## Pre-release checklist

- Verify blocked-site behavior on exact hosts and wildcard domains.
- Verify global enable toggle disables all intervention.
- Test fallback behavior on a page where Clipboard API read is blocked.
- Test common editors (plain input, textarea, contenteditable-rich editors).
- Confirm Chrome Web Store listing explains `clipboardRead` and `storage` permissions.
