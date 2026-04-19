(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    blockedSites: []
  };

  const TOGGLE_COMMAND = "toggle-extension-enabled";

  function setBadge(enabled) {
    if (!chrome?.action?.setBadgeText || !chrome?.action?.setBadgeBackgroundColor) {
      return;
    }

    if (enabled) {
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: "#0f766e" });
      return;
    }

    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#9f1239" });
  }

  function normalizeSettings(stored) {
    return {
      enabled: typeof stored?.enabled === "boolean" ? stored.enabled : DEFAULT_SETTINGS.enabled,
      blockedSites: Array.isArray(stored?.blockedSites) ? stored.blockedSites : DEFAULT_SETTINGS.blockedSites
    };
  }

  function initializeBadge() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      const settings = normalizeSettings(stored);
      setBadge(settings.enabled);
    });
  }

  function toggleGlobalEnabled() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      const settings = normalizeSettings(stored);
      const enabled = !settings.enabled;
      chrome.storage.sync.set({ enabled }, () => {
        setBadge(enabled);
      });
    });
  }

  chrome.commands.onCommand.addListener((command) => {
    if (command === TOGGLE_COMMAND) {
      toggleGlobalEnabled();
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes.enabled) {
      return;
    }

    setBadge(Boolean(changes.enabled.newValue));
  });

  chrome.runtime.onInstalled.addListener(() => {
    initializeBadge();
  });

  chrome.runtime.onStartup.addListener(() => {
    initializeBadge();
  });

  initializeBadge();
})();
