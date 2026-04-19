# Right-Click Clipboard Paste

A lightweight Chrome extension (Manifest V3) that **instantly pastes your clipboard** when you right-click inside an editable text field — `<input>`, `<textarea>`, or `contenteditable` elements. No menu, no extra click — just right-click and the text is pasted.

---

## Features

- Right-clicking an editable field pastes immediately — no context menu appears.
- Pastes at the caret position, replaces any selected text, or fills an empty field.
- Supports standard inputs/textareas and most `contenteditable` rich editors.
- Uses `navigator.clipboard.readText()` (granted by the `clipboardRead` permission).
- Only activates on editable elements; right-clicking non-editable areas shows the normal browser menu.

---

## Installation

1. Clone or download this repository so you have the folder locally.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `rightclick-paste` folder (the one that contains `manifest.json`).
5. Chrome will prompt you to confirm the `clipboardRead` permission.

---

## How it works

1. **`content.js`** is injected into every page as a content script.
2. It listens for `contextmenu` events using a capturing listener.
3. When you right-click an editable element (`<input>`, `<textarea>`, or `contenteditable`), `event.preventDefault()` suppresses the browser's context menu and the script reads your clipboard via `navigator.clipboard.readText()`.
4. The text is inserted at the correct position:
   - For `<input>` / `<textarea>`: uses `selectionStart`/`selectionEnd`, then dispatches `input` and `change` events so framework listeners (React, Vue, etc.) pick up the change.
   - For `contenteditable`: uses the current `Selection` / `Range` to insert a text node, then dispatches `input`.

---

## How to test

1. Load the extension as described above.
2. Copy some text to your clipboard (`Ctrl+C` / `Cmd+C`).
3. Open any web page with a text input (e.g. Google search, a form, etc.).
4. Right-click inside the input field — the clipboard text pastes instantly.

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

Open the file in Chrome (`File → Open File`), copy some text, then right-click inside each field.

---

## Known limitations

- **No context menu on editable fields**: Because right-click is intercepted, you lose access to the browser's built-in context menu (copy, cut, select all, spell-check, etc.) on inputs and textareas while the extension is enabled. Use keyboard shortcuts instead: `Ctrl+C` / `Cmd+C` to copy, `Ctrl+X` / `Cmd+X` to cut, `Ctrl+A` / `Cmd+A` to select all.
- **`chrome://` and `edge://` pages**: Chrome does not allow content scripts to run on browser-internal pages.
- **Cross-origin iframes**: The content script runs in the top-level frame. If the editable element is inside a cross-origin `<iframe>`, the paste will not reach it.
- **Sandboxed iframes**: Pages in sandboxed iframes may block clipboard access regardless.
- **Framework-controlled inputs**: Some SPA frameworks use synthetic events. The extension dispatches native `input` and `change` events, which works for most frameworks, but highly customised editors may not respond correctly.
- **Clipboard permission prompt**: Chrome will ask the user to grant clipboard access the first time the extension reads the clipboard on a given site.
