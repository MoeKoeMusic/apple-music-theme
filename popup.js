(() => {
  "use strict";

  const STORAGE_KEY = "appleMusicLayoutTheme";
  const DEFAULT_CONFIG = Object.freeze({ enabled: true });

  const enabledToggle = document.getElementById("enabledToggle");
  const statusText = document.getElementById("statusText");

  const normalizeConfig = (config = {}) => ({
    enabled: config.enabled !== false
  });

  const render = (config) => {
    enabledToggle.checked = config.enabled;
  };

  const setStatus = (enabled) => {
    statusText.textContent = enabled
      ? "Theme is enabled and applied to the current window."
      : "Theme is disabled and default layout is restored.";
    statusText.className = "status success";
  };

  const readConfig = () => new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result = {}) => {
      resolve(normalizeConfig(result[STORAGE_KEY] || DEFAULT_CONFIG));
    });
  });

  const writeConfig = (config) => new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: normalizeConfig(config) }, resolve);
  });

  const init = async () => {
    const config = await readConfig();
    render(config);
  };

  enabledToggle.addEventListener("change", async () => {
    const nextConfig = { enabled: enabledToggle.checked };
    await writeConfig(nextConfig);
    render(nextConfig);
    setStatus(nextConfig.enabled);
  });

  init();
})();
