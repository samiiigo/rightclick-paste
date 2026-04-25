(() => {
  const DEFAULTS = {
    enabled: true,
    blockedSites: [],
    alwaysPaste: false,
    selectionDoubleRightClickMenu: true
  };

  const enabledCheckbox = document.getElementById("enabled");
  const alwaysPasteCheckbox = document.getElementById("alwaysPaste");
  const selectionDoubleRightClickMenuCheckbox = document.getElementById("selectionDoubleRightClickMenu");
  const blockedSitesTextarea = document.getElementById("blockedSites");
  const saveButton = document.getElementById("save");
  const statusLabel = document.getElementById("status");

  function normalizeLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function setStatus(message) {
    statusLabel.textContent = message;
    window.setTimeout(() => {
      if (statusLabel.textContent === message) {
        statusLabel.textContent = "";
      }
    }, 1500);
  }

  function restoreOptions() {
    chrome.storage.sync.get(DEFAULTS, (items) => {
      enabledCheckbox.checked = Boolean(items.enabled);
      alwaysPasteCheckbox.checked = Boolean(items.alwaysPaste);
      selectionDoubleRightClickMenuCheckbox.checked =
        typeof items.selectionDoubleRightClickMenu === "boolean"
          ? items.selectionDoubleRightClickMenu
          : DEFAULTS.selectionDoubleRightClickMenu;
      blockedSitesTextarea.value = Array.isArray(items.blockedSites)
        ? items.blockedSites.join("\n")
        : "";
    });
  }

  function saveOptions() {
    const blockedSites = normalizeLines(blockedSitesTextarea.value);
    const payload = {
      enabled: enabledCheckbox.checked,
      alwaysPaste: alwaysPasteCheckbox.checked,
      selectionDoubleRightClickMenu: selectionDoubleRightClickMenuCheckbox.checked,
      blockedSites
    };

    chrome.storage.sync.set(payload, () => {
      setStatus("Saved");
    });
  }

  saveButton.addEventListener("click", saveOptions);
  document.addEventListener("DOMContentLoaded", restoreOptions);
})();
