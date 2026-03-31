(() => {
  "use strict";

  const STORAGE_KEY = "appleMusicLayoutTheme";
  const DEFAULT_CONFIG = Object.freeze({ enabled: true });

  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(STORAGE_KEY, (result = {}) => {
      if (Object.prototype.hasOwnProperty.call(result, STORAGE_KEY)) return;
      chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_CONFIG });
    });
  });
})();
