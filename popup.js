(() => {
  "use strict";

  const STORAGE_KEY = "appleMusicLayoutTheme";
  const DEFAULT_CONFIG = Object.freeze({
    enabled: true
  });

  const enabledToggle = document.getElementById("enabledToggle");
  const statusText = document.getElementById("statusText");

  let pendingConfig = { ...DEFAULT_CONFIG };

  function normalizeConfig(config) {
    const next = config && typeof config === "object" ? config : {};
    return {
      enabled: next.enabled !== false
    };
  }

  function setStatus(message, type = "") {
    statusText.textContent = message;
    statusText.className = `status ${type}`.trim();
  }

  function render() {
    enabledToggle.checked = pendingConfig.enabled;
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => resolve(result[key]));
    });
  }

  function storageSet(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => resolve());
    });
  }

  async function loadConfig() {
    const saved = await storageGet(STORAGE_KEY);
    pendingConfig = normalizeConfig(saved || DEFAULT_CONFIG);
    render();
  }

  async function saveConfig() {
    pendingConfig = normalizeConfig(pendingConfig);
    await storageSet({ [STORAGE_KEY]: pendingConfig });
    render();
    setStatus(pendingConfig.enabled ? "已启用，会立即应用到当前窗口。" : "已关闭，会立即恢复原有布局。", "success");
  }

  enabledToggle.addEventListener("change", async (event) => {
    pendingConfig.enabled = Boolean(event.target.checked);
    await saveConfig();
  });

  loadConfig().catch((error) => {
    console.error("[apple-music-theme] failed to load config:", error);
    setStatus("配置加载失败。");
  });
})();
