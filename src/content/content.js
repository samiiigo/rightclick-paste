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
    alwaysPaste: false,
    selectionDoubleRightClickMenu: true
  };

  let settings = { ...DEFAULT_SETTINGS };
  const CLIPBOARD_PRELOAD_MAX_AGE_MS = 1500;
  const DOUBLE_RIGHT_CLICK_MS = 500;

  let clipboardPreload = null;
  let lastRightClickedSelectionText = null;
  let lastTextFieldContextMenu = { target: null, time: 0 };
  let suppressContextMenuUntil = 0;

  function normalizeBlockedSites(value) {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean);
  }

  function parseHostRule(rule) {
    if (!rule) return "";
    const trimmed = rule.trim().toLowerCase();
    try {
      if (/^https?:\/\//.test(trimmed)) return new URL(trimmed).hostname;
    } catch {
      return "";
    }
    return trimmed.replace(/^\.+|\.+$/g, "");
  }

  function isBlockedHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (!host) return false;

    for (const rawRule of settings.blockedSites) {
      const rule = parseHostRule(rawRule);
      if (!rule) continue;
      if (rule.startsWith("*.")) {
        const domain = rule.slice(2);
        if (domain && (host === domain || host.endsWith(`.${domain}`))) return true;
        continue;
      }
      if (host === rule || host.endsWith(`.${rule}`)) return true;
    }
    return false;
  }

  function canRunOnCurrentSite() {
    if (!settings.enabled) return false;
    return !isBlockedHost(window.location.hostname);
  }

  function hydrateSettings(next) {
    settings = {
      enabled: typeof next.enabled === "boolean" ? next.enabled : DEFAULT_SETTINGS.enabled,
      blockedSites: normalizeBlockedSites(next.blockedSites),
      alwaysPaste: typeof next.alwaysPaste === "boolean" ? next.alwaysPaste : DEFAULT_SETTINGS.alwaysPaste,
      selectionDoubleRightClickMenu: typeof next.selectionDoubleRightClickMenu === "boolean" ? next.selectionDoubleRightClickMenu : DEFAULT_SETTINGS.selectionDoubleRightClickMenu
    };
  }

  function loadSettings() {
    if (!chrome?.storage?.sync) return;
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      hydrateSettings(stored || DEFAULT_SETTINGS);
    });
  }

  function watchSettingsChanges() {
    if (!chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") return;
      const next = { ...settings };
      if (changes.enabled) next.enabled = changes.enabled.newValue;
      if (changes.blockedSites) next.blockedSites = changes.blockedSites.newValue;
      if (changes.alwaysPaste) next.alwaysPaste = changes.alwaysPaste.newValue;
      if (changes.selectionDoubleRightClickMenu) next.selectionDoubleRightClickMenu = changes.selectionDoubleRightClickMenu.newValue;
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

  function isTextFieldElement(node) {
    if (!(node instanceof Element)) return false;
    if (node instanceof HTMLTextAreaElement) return !node.disabled && !node.readOnly;
    if (node instanceof HTMLInputElement) {
      const type = (node.type || "text").toLowerCase();
      return TEXT_INPUT_TYPES.has(type) && !node.disabled && !node.readOnly;
    }
    return false;
  }

  function isEditableElement(node) {
    if (isTextFieldElement(node)) return true;
    if (!(node instanceof Element)) return false;
    return node.isContentEditable;
  }

  function findEditableTargetFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const node of path) {
      if (isEditableElement(node)) return node;
      if (node instanceof Element) {
        const nearest = node.closest("textarea, input, [contenteditable]");
        if (isEditableElement(nearest)) return nearest;
      }
    }
    const active = document.activeElement;
    if (isEditableElement(active)) return active;
    return null;
  }

  function dispatchEditableEvents(target, insertedText) {
    try {
      target.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertFromPaste", data: insertedText }));
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
    if (!range || !target.contains(range.commonAncestorContainer)) return;
    const selection = window.getSelection();
    if (!selection) return;
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
      if (typeof target.setSelectionRange === "function") target.setSelectionRange(nextCaret, nextCaret);
    }
    dispatchEditableEvents(target, text);
    return true;
  }

  function insertIntoContentEditable(target, text) {
    const selection = window.getSelection();
    if (!selection) return false;
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

  async function tryReadClipboardText() {
    try {
      const text = await navigator.clipboard.readText();
      return { ok: true, text: text ?? "" };
    } catch {
      return { ok: false, text: "" };
    }
  }

  async function tryWriteClipboardText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function isRightClickOnSelection(event, selection) {
    if (!selection || selection.rangeCount === 0) return false;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const node of path) {
      if (node instanceof Node && selection.containsNode(node, true)) return true;
    }
    return false;
  }

  function preloadClipboardForRightClick(target) {
    clipboardPreload = {
      target,
      startedAt: Date.now(),
      promise: tryReadClipboardText()
    };
  }

  async function resolveClipboardForPaste(target) {
    const preload = clipboardPreload;
    const preloadFresh = preload && preload.target === target && Date.now() - preload.startedAt <= CLIPBOARD_PRELOAD_MAX_AGE_MS;
    if (preloadFresh) {
      try {
        return await preload.promise;
      } finally {
        if (clipboardPreload === preload) clipboardPreload = null;
      }
    }
    return tryReadClipboardText();
  }

  async function pasteClipboardIntoEditableTarget(target, event) {
    const clipboardResult = await resolveClipboardForPaste(target);
    if (!clipboardResult?.ok || !clipboardResult.text) return;

    target.focus({ preventScroll: true });
    if (target.isContentEditable) setCaretForContentEditable(target, event.clientX, event.clientY);

    const text = clipboardResult.text;
    const success = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        ? insertIntoInputLike(target, text)
        : insertIntoContentEditable(target, text);

    if (!success) console.warn("Right-Click Clipboard Paste: scripted insert failed.");
  }

  document.addEventListener("mousedown", (event) => {
    if (!canRunOnCurrentSite() || event.button !== 2) return;

    const target = findEditableTargetFromEvent(event);
    if (!target) return;

    const now = Date.now();
    const isDoubleClick = lastTextFieldContextMenu.target === target && (now - lastTextFieldContextMenu.time < DOUBLE_RIGHT_CLICK_MS);

    if (isDoubleClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressContextMenuUntil = now + 400;

      preloadClipboardForRightClick(target);
      void pasteClipboardIntoEditableTarget(target, event);
    } else {
      lastTextFieldContextMenu = { target, time: now };
      preloadClipboardForRightClick(target);
    }
  }, true);

  document.addEventListener("contextmenu", (event) => {
    if (!canRunOnCurrentSite()) return;

    const selection = window.getSelection();
    const selectedText = selection ? selection.toString() : "";

    if (settings.selectionDoubleRightClickMenu && !settings.alwaysPaste && selectedText && isRightClickOnSelection(event, selection)) {
      if (selectedText === lastRightClickedSelectionText) {
        lastRightClickedSelectionText = null;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      lastRightClickedSelectionText = selectedText;
      void tryWriteClipboardText(selectedText);
      return;
    }

    lastRightClickedSelectionText = null;

    if (Date.now() < suppressContextMenuUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const target = findEditableTargetFromEvent(event);
    if (!target) return;

    if (settings.alwaysPaste || isEditorEmpty(target)) {
      event.preventDefault();
      event.stopPropagation();
      void pasteClipboardIntoEditableTarget(target, event);
    }
  }, true);

  loadSettings();
  watchSettingsChanges();
})();