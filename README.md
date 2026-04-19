# Right-Click Clipboard Paste

A lightweight Chrome extension (Manifest V3) that adds a **"Paste clipboard"** item to the browser's right-click context menu whenever you right-click inside an editable text field — `<input>`, `<textarea>`, or `contenteditable` elements.

---

## Features

- Context menu item appears **only** on editable fields (never on plain text or images).
- Pastes at the caret position, replaces any selected text, or fills an empty field.
- Supports standard inputs/textareas and most `contenteditable` rich editors.
- Reads clipboard text directly from the page using `navigator.clipboard.readText()` (triggered by the user gesture from the context-menu click).
- Includes a `document.execCommand` fallback for sites that restrict the Clipboard API.
- No clipboard permissions required in `manifest.json` — the user gesture grants access.

---

## Installation

1. Clone or download this repository so you have the folder locally.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `rightclick-paste` folder (the one that contains `manifest.json`).
5. The extension icon appears in the Chrome toolbar.

---

## How it works

1. **`background.js`** registers a service worker that calls `chrome.contextMenus.create()` on both `onInstalled` and `onStartup`, creating a single menu item with `contexts: ["editable"]`.
2. When you right-click an editable field and choose **"Paste clipboard"**, `chrome.contextMenus.onClicked` fires.
3. The handler calls `chrome.scripting.executeScript()` to inject the `pasteFromClipboard` function into the active tab.
4. Inside the page, `navigator.clipboard.readText()` reads the clipboard (the originating user gesture grants permission without extra manifest permissions).
5. The text is inserted at the correct position:
   - For `<input>` / `<textarea>`: uses `selectionStart`/`selectionEnd`, then dispatches `input` and `change` events so framework listeners (React, Vue, etc.) pick up the change.
   - For `contenteditable`: uses the current `Selection` / `Range` to insert a text node, then dispatches `input`.

---

## How to test

1. Load the extension as described above.
2. Copy some text to your clipboard (`Ctrl+C` / `Cmd+C`).
3. Open any web page with a text input (e.g. Google, a form, or a plain `<textarea>` page).
4. Right-click inside the input field.
5. Click **"Paste clipboard"** in the context menu.
6. The copied text should appear at the cursor position.

You can also test with a quick local HTML file:

```html
<!DOCTYPE html>
<html>
  <body>
    <input type="text" placeholder="right-click here" style="width:300px" />
    <br /><br />
    <textarea rows="5" cols="40">Right-click inside me</textarea>
    <br /><br />
    <div contenteditable="true" style="border:1px solid #ccc;padding:8px;width:300px">
      Contenteditable area — right-click here
    </div>
  </body>
</html>
```

Open the file in Chrome (`File → Open File`), copy some text, then right-click each field and choose **"Paste clipboard"**.

---

## Known limitations

- **Clipboard API blocked by CSP**: Some sites set a strict Content Security Policy that prevents `navigator.clipboard.readText()` from running. The extension attempts a `document.execCommand("paste")` fallback, but this is also increasingly restricted and may silently fail.
- **`chrome://` and `edge://` pages**: Chrome does not allow extensions to inject scripts into browser-internal pages.
- **Extensions pages**: Script injection is blocked on other extensions' pages.
- **Cross-origin iframes**: If the editable element is inside a cross-origin `<iframe>`, the extension injects into the top-level frame only and will not reach the iframe. A future version could enumerate sub-frames, but this adds complexity and may still be blocked by site policies.
- **Sandboxed iframes**: Pages loaded in sandboxed iframes may block clipboard access regardless.
- **Framework-controlled inputs**: Some single-page app frameworks (e.g. React with controlled components) listen to `onInput` / `onChange` through synthetic events. The extension dispatches native `input` and `change` events, which should trigger most listeners, but highly customised editors may still not pick up the change correctly.
- **Browser startup delay**: The service worker may be unloaded between sessions. The context menu is re-created on `onStartup`, but there can be a very brief window before it appears after a fresh browser launch.