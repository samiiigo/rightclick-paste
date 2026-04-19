// content.js — Right-Click Clipboard Paste (Manifest V3)
// Intercepts right-click on editable elements and pastes clipboard content directly.

function isEditable(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  return false;
}

function pasteText(el, text) {
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    // Some input types (e.g. email, number) do not support selectionStart/End.
    try {
      if (typeof el.selectionStart === "number" && el.selectionStart !== null) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.value = el.value.slice(0, start) + text + el.value.slice(end);
        el.selectionStart = el.selectionEnd = start + text.length;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    } catch (_) {
      // Fall through to contenteditable path if selection API throws
    }
  }

  if (el.isContentEditable) {
    el.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.insertAdjacentText("beforeend", text);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

document.addEventListener("contextmenu", async (event) => {
  const el = event.target;
  if (!isEditable(el)) return;

  event.preventDefault();

  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch (err) {
    console.warn("Right-Click Paste: could not read clipboard —", err.message);
    return;
  }

  if (typeof text === "string") pasteText(el, text);
}, { capture: true });
