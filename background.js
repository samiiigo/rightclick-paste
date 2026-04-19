// background.js — service worker for Right-Click Clipboard Paste (Manifest V3)

const MENU_ITEM_ID = "rightclick-paste";

// Create the context menu item once on install and on service-worker startup.
function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ITEM_ID,
      title: "Paste clipboard",
      contexts: ["editable"],
    });
  });
}

chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);

// When the menu item is clicked, inject the paste function into the active tab.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ITEM_ID || !tab?.id) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: pasteFromClipboard,
  }).catch((err) => {
    console.error("Right-Click Paste: could not inject script —", err.message);
  });
});

/**
 * Injected into the page by chrome.scripting.executeScript().
 * Runs in the page context, so it has access to the DOM and navigator.clipboard.
 * The user gesture that triggered the context-menu click propagates here, which
 * is what allows navigator.clipboard.readText() to succeed without extra permissions.
 */
async function pasteFromClipboard() {
  let text;

  try {
    text = await navigator.clipboard.readText();
  } catch (primaryErr) {
    // Fallback: some sites override the clipboard API or CSP blocks it.
    // We attempt a legacy document.execCommand approach as a best-effort.
    try {
      const tmp = document.createElement("textarea");
      tmp.style.cssText = "position:absolute;left:-9999px;opacity:0;pointer-events:none";
      tmp.setAttribute("aria-hidden", "true");
      document.body.appendChild(tmp);
      tmp.focus();
      document.execCommand("paste");
      text = tmp.value;
      document.body.removeChild(tmp);
    } catch (fallbackErr) {
      console.warn(
        "Right-Click Paste: clipboard read failed.\n" +
        "Primary error: " + primaryErr.message + "\n" +
        "Fallback error: " + fallbackErr.message + "\n" +
        "The site may be blocking clipboard access."
      );
      return;
    }

    if (!text) {
      console.warn(
        "Right-Click Paste: clipboard appears empty or could not be read. " +
        "Primary error: " + primaryErr.message
      );
      return;
    }
  }

  const el = document.activeElement;
  if (!el) return;

  // Standard input / textarea
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    if (typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const current = el.value;
      el.value = current.slice(0, start) + text + current.slice(end);
      el.selectionStart = el.selectionEnd = start + text.length;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
  }

  // contenteditable elements (rich editors, etc.)
  if (el.isContentEditable) {
    el.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      // Move caret to end of inserted text
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      // No selection available — append to the element without destroying existing child nodes
      el.insertAdjacentText("beforeend", text);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  console.warn("Right-Click Paste: active element is not a recognized editable field.");
}
