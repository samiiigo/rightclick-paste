(() => {
  const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "number"]);
  const PENDING_CLIPBOARD_TTL_MS = 2000;

  const DEFAULT_SETTINGS = {
    enabled: true,
    blockedSites: [],
    alwaysPaste: false,
    selectionDoubleRightClickMenu: true
  };

  let settings = { ...DEFAULT_SETTINGS };
  const DOUBLE_RIGHT_CLICK_MS = 500;

  let lastCopiedSelection = "";
  let pendingRightClickPaste = null;
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
      return (target.textContent || "").trim().length === 0;
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

  function getInputSelectionRange(target) {
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return null;
    }

    const start = typeof target.selectionStart === "number" ? target.selectionStart : 0;
    const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
    return { start, end };
  }

  function getRangeAtClientPoint(x, y) {
    if (typeof document.caretRangeFromPoint === "function") {
      return document.caretRangeFromPoint(x, y);
    }

    if (typeof document.caretPositionFromPoint === "function") {
      const position = document.caretPositionFromPoint(x, y);
      if (!position) {
        return null;
      }
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }

    return null;
  }

  function getTrimmedSelectedTextFromTarget(target) {
    const range = getInputSelectionRange(target);
    if (range && range.end > range.start) {
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return target.value.slice(range.start, range.end).trim();
      }
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return "";
    }

    return selection.toString().trim();
  }

  function isClickInsideContentEditableSelection(event) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return false;
    }

    const probe = getRangeAtClientPoint(event.clientX, event.clientY);
    if (!probe) {
      return false;
    }

    const container = probe.startContainer;
    const offset = probe.startOffset;

    for (let i = 0; i < selection.rangeCount; i += 1) {
      const r = selection.getRangeAt(i);
      if (typeof r.isPointInRange === "function" && r.isPointInRange(container, offset)) {
        return true;
      }
    }

    return false;
  }

  function isRightClickOnActiveSelection(event, target) {
    const range = getInputSelectionRange(target);
    if (range) {
      return range.end > range.start;
    }

    return isClickInsideContentEditableSelection(event);
  }

  async function copyTextToClipboard(text) {
    if (!text) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const previousActive = document.activeElement;
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "true");
      helper.style.cssText = "position:fixed;top:-9999px;opacity:0";
      document.body.appendChild(helper);
      helper.focus();
      helper.select();

      const ok = document.execCommand("copy");
      document.body.removeChild(helper);

      if (previousActive instanceof HTMLElement) {
        previousActive.focus({ preventScroll: true });
      }

      return ok;
    }
  }

  function suppressContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  async function tryHandleCopySelectionToClipboard(event) {
    if (!(event.target instanceof HTMLElement)) {
      return false;
    }

    if (!isRightClickOnActiveSelection(event, event.target)) {
      return false;
    }

    const selected = getTrimmedSelectedTextFromTarget(event.target);
    if (!selected || selected === lastCopiedSelection) {
      return false;
    }

    suppressContextMenu(event);

    const ok = await copyTextToClipboard(selected);
    if (ok) {
      lastCopiedSelection = selected;
    }

    return true;
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
    const range = getRangeAtClientPoint(x, y);
    if (!range || !target.contains(range.commonAncestorContainer)) {
      return;
    }

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
      const next = start + text.length;
      if (typeof target.setSelectionRange === "function") {
        target.setSelectionRange(next, next);
      }
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

  function insertClipboardTextAtContextMenuPoint(event, target, text) {
    target.focus({ preventScroll: true });

    if (target.isContentEditable) {
      setCaretForContentEditable(target, event.clientX, event.clientY);
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return insertIntoInputLike(target, text);
    }

    return insertIntoContentEditable(target, text);
  }

  async function readClipboardText() {
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

  function clearPendingPaste() {
    pendingRightClickPaste = null;
  }

  function isFreshPendingForTarget(target) {
    if (!pendingRightClickPaste || pendingRightClickPaste.target !== target) {
      return false;
    }

    return Date.now() - pendingRightClickPaste.capturedAt <= PENDING_CLIPBOARD_TTL_MS;
  }

  function shouldBlockMenuForPendingRead(p) {
    return (
      Boolean(p) &&
      (!p.resolved || Boolean(p.result?.ok && p.result.text))
    );
  }

  function startPendingReadSession(target) {
    const session = {
      target,
      capturedAt: Date.now(),
      resolved: false,
      result: null,
      promise: readClipboardText()
    };

    pendingRightClickPaste = session;

    session.promise.then((result) => {
      if (pendingRightClickPaste === session) {
        session.resolved = true;
        session.result = result;
      }
    });
  }

  function startPendingReadForRightMouseDownIfEligible(event) {
    if (!canRunOnCurrentSite() || event.button !== 2) {
      clearPendingPaste();
      return;
    }

    const target = findEditableTargetFromEvent(event);
    if (!target) {
      clearPendingPaste();
      return;
    }

    const now = Date.now();
    const isDoubleClick = lastTextFieldContextMenu.target === target && (now - lastTextFieldContextMenu.time < DOUBLE_RIGHT_CLICK_MS);

    if (isDoubleClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressContextMenuUntil = now + 400;

      startPendingReadSession(target);
      void executePaste(target, event, true);
    } else {
      lastTextFieldContextMenu = { target, time: now };
      if (!shouldRunAutoPasteInEditor(target)) {
        clearPendingPaste();
        return;
      }
      startPendingReadSession(target);
    }
  }

  async function consumeClipboardTextForAutoPaste(usePending) {
    try {
      if (usePending && pendingRightClickPaste) {
        return await pendingRightClickPaste.promise;
      }
      return await readClipboardText();
    } finally {
      clearPendingPaste();
    }
  }

  function shouldRunAutoPasteInEditor(target) {
    return settings.alwaysPaste || isEditorEmpty(target);
  }

  async function executePaste(target, event, force = false) {
    if (!force && !shouldRunAutoPasteInEditor(target)) {
      return false;
    }

    const usePending = isFreshPendingForTarget(target);
    if (!force && usePending && shouldBlockMenuForPendingRead(pendingRightClickPaste)) {
      suppressContextMenu(event);
    }

    const { ok, text } = await consumeClipboardTextForAutoPaste(usePending);
    if (!ok || !text) {
      return false;
    }

    const success = insertClipboardTextAtContextMenuPoint(event, target, text);
    if (success && !force) {
      suppressContextMenu(event);
    }
    return success;
  }

  async function handleContextMenu(event) {
    if (!canRunOnCurrentSite()) {
      return;
    }

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

    if (await tryHandleCopySelectionToClipboard(event)) {
      return;
    }

    const target = findEditableTargetFromEvent(event);
    if (!target) {
      return;
    }

    void executePaste(target, event);
  }

  document.addEventListener("mousedown", (event) => {
    startPendingReadForRightMouseDownIfEligible(event);
  }, true);

  document.addEventListener("contextmenu", (event) => {
    void handleContextMenu(event);
  }, true);

  loadSettings();
  watchSettingsChanges();
})();