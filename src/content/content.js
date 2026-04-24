(() => {
  const TEXT_INPUT_TYPES = new Set([
    "text",
    "search",
    "url",
    "tel",
    "email",
    "number"
  ]);

  const DEFAULT_SETTINGS = {
    enabled: true,
    blockedSites: [],
    alwaysPaste: false
  };

  let settings = { ...DEFAULT_SETTINGS };
  let lastRightClickedSelection = "";

  function normalizeBlockedSites(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => String(entry || "").trim().toLowerCase())
      .filter(Boolean);
  }

  function parseHostRule(rule) {
    if (!rule) {
      return "";
    }

    const trimmed = rule.trim().toLowerCase();

    try {
      if (/^https?:\/\//.test(trimmed)) {
        return new URL(trimmed).hostname;
      }
    } catch {
      return "";
    }

    return trimmed.replace(/^\.+|\.+$/g, "");
  }

  function isBlockedHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (!host) {
      return false;
    }

    for (const rawRule of settings.blockedSites) {
      const rule = parseHostRule(rawRule);
      if (!rule) {
        continue;
      }

      if (rule.startsWith("*.")) {
        const domain = rule.slice(2);
        if (domain && (host === domain || host.endsWith(`.${domain}`))) {
          return true;
        }
        continue;
      }

      if (host === rule || host.endsWith(`.${rule}`)) {
        return true;
      }
    }

    return false;
  }

  function canRunOnCurrentSite() {
    if (!settings.enabled) {
      return false;
    }

    return !isBlockedHost(window.location.hostname);
  }

  function hydrateSettings(next) {
    settings = {
      enabled: typeof next.enabled === "boolean" ? next.enabled : DEFAULT_SETTINGS.enabled,
      blockedSites: normalizeBlockedSites(next.blockedSites),
      alwaysPaste: typeof next.alwaysPaste === "boolean" ? next.alwaysPaste : DEFAULT_SETTINGS.alwaysPaste
    };
  }

  function loadSettings() {
    if (!chrome?.storage?.sync) {
      return;
    }

    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      hydrateSettings(stored || DEFAULT_SETTINGS);
    });
  }

  function watchSettingsChanges() {
    if (!chrome?.storage?.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      const next = { ...settings };
      if (changes.enabled) {
        next.enabled = changes.enabled.newValue;
      }
      if (changes.blockedSites) {
        next.blockedSites = changes.blockedSites.newValue;
      }
      if (changes.alwaysPaste) {
        next.alwaysPaste = changes.alwaysPaste.newValue;
      }
      hydrateSettings(next);
    });
  }

  function isEditorEmpty(target) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return target.value.length === 0;
    }

    if (target instanceof Element && target.isContentEditable) {
      const text = (target.textContent || "").trim();
      return text.length === 0;
    }

    return false;
  }

  function isEditableElement(node) {
    if (!(node instanceof Element)) {
      return false;
    }

    if (node instanceof HTMLTextAreaElement) {
      return !node.disabled && !node.readOnly;
    }

    if (node instanceof HTMLInputElement) {
      const type = (node.type || "text").toLowerCase();
      return TEXT_INPUT_TYPES.has(type) && !node.disabled && !node.readOnly;
    }

    return node.isContentEditable;
  }

  function findEditableTargetFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];

    for (const node of path) {
      if (isEditableElement(node)) {
        return node;
      }

      if (node instanceof Element) {
        const nearest = node.closest("textarea, input, [contenteditable]");
        if (isEditableElement(nearest)) {
          return nearest;
        }
      }
    }

    const active = document.activeElement;
    if (isEditableElement(active)) {
      return active;
    }

    return null;
  }

  function getSelectionFromTarget(target) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const start = typeof target.selectionStart === "number" ? target.selectionStart : 0;
      const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
      if (end <= start) {
        return "";
      }
      return target.value.slice(start, end).trim();
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return "";
    }

    return selection.toString().trim();
  }

  function isRightClickInsideSelection(event, target) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const start = typeof target.selectionStart === "number" ? target.selectionStart : 0;
      const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
      return end > start;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return false;
    }

    let probeRange = null;
    if (typeof document.caretRangeFromPoint === "function") {
      probeRange = document.caretRangeFromPoint(event.clientX, event.clientY);
    } else if (typeof document.caretPositionFromPoint === "function") {
      const position = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (position) {
        probeRange = document.createRange();
        probeRange.setStart(position.offsetNode, position.offset);
        probeRange.collapse(true);
      }
    }

    if (!probeRange) {
      return false;
    }

    const container = probeRange.startContainer;
    const offset = probeRange.startOffset;

    for (let i = 0; i < selection.rangeCount; i += 1) {
      const range = selection.getRangeAt(i);
      if (typeof range.isPointInRange === "function" && range.isPointInRange(container, offset)) {
        return true;
      }
    }

    return false;
  }

  async function copyTextToClipboard(text) {
    if (!text) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const active = document.activeElement;
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "true");
      helper.style.position = "fixed";
      helper.style.top = "-9999px";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.focus();
      helper.select();

      const copied = document.execCommand("copy");
      document.body.removeChild(helper);

      if (active instanceof HTMLElement) {
        active.focus({ preventScroll: true });
      }

      return copied;
    }
  }

  async function handleSelectionRightClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    if (!isRightClickInsideSelection(event, target)) {
      return false;
    }

    const selectedText = getSelectionFromTarget(target);
    if (!selectedText) {
      lastRightClickedSelection = "";
      return false;
    }

    if (selectedText === lastRightClickedSelection) {
      return false;
    }

    const copied = await copyTextToClipboard(selectedText);
    if (!copied) {
      return false;
    }

    lastRightClickedSelection = selectedText;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function dispatchEditableEvents(target, insertedText) {
    try {
      target.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertFromPaste",
          data: insertedText
        })
      );
    } catch {
      target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }

    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setCaretForContentEditable(target, x, y) {
    let range = null;

    if (typeof document.caretRangeFromPoint === "function") {
      range = document.caretRangeFromPoint(x, y);
    } else if (typeof document.caretPositionFromPoint === "function") {
      const position = document.caretPositionFromPoint(x, y);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      }
    }

    if (!range || !target.contains(range.commonAncestorContainer)) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function insertIntoInputLike(target, text) {
    const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
    const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;

    if (typeof target.setRangeText === "function") {
      target.setRangeText(text, start, end, "end");
    } else {
      target.value = target.value.slice(0, start) + text + target.value.slice(end);
      const nextCaret = start + text.length;
      if (typeof target.setSelectionRange === "function") {
        target.setSelectionRange(nextCaret, nextCaret);
      }
    }

    dispatchEditableEvents(target, text);
    return true;
  }

  function insertIntoContentEditable(target, text) {
    const selection = window.getSelection();
    if (!selection) {
      return false;
    }

    let range;
    if (selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
    }

    if (!target.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    dispatchEditableEvents(target, text);
    return true;
  }

  async function readClipboardTextWithFallback() {
    try {
      const text = await navigator.clipboard.readText();
      return { ok: true, text: text ?? "", usedFallback: false };
    } catch {
      const manual = window.prompt(
        "Clipboard read is blocked on this page. Paste text manually and press OK to continue:"
      );

      if (manual === null) {
        return {
          ok: false,
          error:
            "Unable to access clipboard automatically here, and manual fallback was canceled."
        };
      }

      return { ok: true, text: manual, usedFallback: true };
    }
  }

  async function handleContextMenu(event) {
    if (!canRunOnCurrentSite()) {
      return;
    }

    const selectionHandled = await handleSelectionRightClick(event);
    if (selectionHandled) {
      return;
    }

    const target = findEditableTargetFromEvent(event);
    if (!target) {
      return;
    }

    if (!settings.alwaysPaste && !isEditorEmpty(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    target.focus({ preventScroll: true });

    if (target.isContentEditable) {
      setCaretForContentEditable(target, event.clientX, event.clientY);
    }

    const clipboardResult = await readClipboardTextWithFallback();
    if (!clipboardResult.ok) {
      alert(`Right-Click Clipboard Paste: ${clipboardResult.error}`);
      return;
    }

    const text = clipboardResult.text;
    const success =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        ? insertIntoInputLike(target, text)
        : insertIntoContentEditable(target, text);

    if (!success) {
      alert("Right-Click Clipboard Paste: This editor does not support scripted paste in its current state.");
    }
  }

  document.addEventListener("contextmenu", (event) => {
    void handleContextMenu(event);
  }, true);

  loadSettings();
  watchSettingsChanges();
})();