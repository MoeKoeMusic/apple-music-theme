(() => {
  "use strict";

  const STORAGE_KEY = "appleMusicLayoutTheme";
  const DEFAULT_CONFIG = Object.freeze({
    enabled: true,
    sidebarWidth: 252,
    blurStrength: 22,
    artworkEmphasis: true
  });

  function clamp(value, min, max, fallback) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return fallback;
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  function normalizeConfig(config) {
    const next = config && typeof config === "object" ? config : {};
    return {
      enabled: next.enabled !== false,
      sidebarWidth: clamp(next.sidebarWidth, 220, 300, DEFAULT_CONFIG.sidebarWidth),
      blurStrength: clamp(next.blurStrength, 12, 32, DEFAULT_CONFIG.blurStrength),
      artworkEmphasis: next.artworkEmphasis !== false
    };
  }

  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        console.error("[apple-music-theme] failed to read storage:", chrome.runtime.lastError);
        return;
      }

      const existing = result[STORAGE_KEY];
      const normalized = normalizeConfig(existing || DEFAULT_CONFIG);

      if (!existing || JSON.stringify(existing) !== JSON.stringify(normalized)) {
        chrome.storage.local.set({ [STORAGE_KEY]: normalized }, () => {
          if (chrome.runtime.lastError) {
            console.error("[apple-music-theme] failed to seed storage:", chrome.runtime.lastError);
          }
        });
      }
    });
  });
})();
