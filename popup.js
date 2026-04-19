(() => {
  const DEFAULTS = {
    enabled: true,
    blockedSites: []
  };

  const globalToggle = document.getElementById("toggleGlobal");
  const siteToggle = document.getElementById("toggleSite");
  const siteHostLabel = document.getElementById("siteHost");
  const globalStatus = document.getElementById("globalStatus");
  const siteStatus = document.getElementById("siteStatus");
  const optionsLink = document.getElementById("openOptions");
  const shortcutsLink = document.getElementById("openShortcuts");

  let currentHost = "";

  function normalizeRules(value) {
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

  function isBlockedForHost(host, rules) {
    const safeHost = String(host || "").toLowerCase();
    if (!safeHost) {
      return false;
    }

    return rules.some((rule) => {
      const parsedRule = parseHostRule(rule);
      if (!parsedRule) {
        return false;
      }

      if (parsedRule.startsWith("*.")) {
        const domain = parsedRule.slice(2);
        return Boolean(domain) && (safeHost === domain || safeHost.endsWith(`.${domain}`));
      }

      return safeHost === parsedRule || safeHost.endsWith(`.${parsedRule}`);
    });
  }

  function updateGlobalStatus(enabled) {
    globalStatus.textContent = enabled ? "Global status: ON" : "Global status: OFF";
    globalStatus.className = enabled ? "status ok" : "status off";
  }

  function updateSiteStatus(enabledOnSite) {
    siteStatus.textContent = enabledOnSite ? "Site status: ON" : "Site status: OFF";
    siteStatus.className = enabledOnSite ? "status ok" : "status off";
  }

  function withStorage(callback) {
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      callback({
        enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULTS.enabled,
        blockedSites: normalizeRules(stored.blockedSites)
      });
    });
  }

  function render(settings) {
    globalToggle.checked = settings.enabled;
    updateGlobalStatus(settings.enabled);

    const blocked = isBlockedForHost(currentHost, settings.blockedSites);
    siteToggle.checked = !blocked;
    updateSiteStatus(!blocked && settings.enabled);
  }

  function saveSettings(next) {
    chrome.storage.sync.set(next, () => {
      render(next);
    });
  }

  function toggleGlobal() {
    withStorage((settings) => {
      const next = {
        enabled: globalToggle.checked,
        blockedSites: settings.blockedSites
      };
      saveSettings(next);
    });
  }

  function toggleSite() {
    if (!currentHost) {
      return;
    }

    withStorage((settings) => {
      const set = new Set(settings.blockedSites);
      if (siteToggle.checked) {
        set.delete(currentHost);
      } else {
        set.add(currentHost);
      }

      const next = {
        enabled: settings.enabled,
        blockedSites: Array.from(set).sort()
      };
      saveSettings(next);
    });
  }

  function bindEvents() {
    globalToggle.addEventListener("change", toggleGlobal);
    siteToggle.addEventListener("change", toggleSite);
    optionsLink.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    shortcutsLink.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    });
  }

  function init() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      let host = "";

      try {
        if (activeTab?.url) {
          host = new URL(activeTab.url).hostname.toLowerCase();
        }
      } catch {
        host = "";
      }

      currentHost = host;
      siteHostLabel.textContent = currentHost ? `Current host: ${currentHost}` : "Current host: unavailable";
      siteToggle.disabled = !currentHost;

      withStorage(render);
    });
  }

  bindEvents();
  init();
})();
