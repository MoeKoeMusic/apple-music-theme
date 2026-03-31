(() => {
  "use strict";

  const STORAGE_KEY = "appleMusicLayoutTheme";
  const ENABLED_CLASS = "mk-apple-layout-enabled";
  const STATIC_MENU_ID = "mk-apple-static-account-links";
  const PROFILE_NAME_CLASS = "mk-apple-profile-name";
  const DEFAULT_LOGIN_LABEL = "\u767b\u5f55";
  const DEFAULT_CONFIG = Object.freeze({ enabled: true });

  const ACTION_ICON_CLASS = Object.freeze({
    settings: "fa-cog",
    update: "fa-github",
    about: "fa-info-circle",
    login: "fa-sign-in-alt",
    logout: "fa-sign-out-alt"
  });

  const STATIC_ACCOUNT_MENU_HTML = `
    <button type="button" class="mk-apple-side-link" data-action="settings">
      <i class="fas fa-cog"></i>
      <span>&#35774;&#32622;</span>
    </button>
    <button type="button" class="mk-apple-side-link" data-action="update">
      <i class="fab fa-github"></i>
      <span>&#26356;&#26032;</span>
    </button>
    <button type="button" class="mk-apple-side-link" data-action="about">
      <i class="fas fa-info-circle"></i>
      <span>&#20851;&#20110;</span>
    </button>
    <button type="button" class="mk-apple-side-link mk-link-login" data-action="login">
      <i class="fas fa-sign-in-alt"></i>
      <span>&#30331;&#24405;</span>
    </button>
    <button type="button" class="mk-apple-side-link mk-link-logout" data-action="logout">
      <i class="fas fa-sign-out-alt"></i>
      <span>&#36864;&#20986;</span>
    </button>
  `;

  let currentConfig = { ...DEFAULT_CONFIG };
  let floatingSyncFrame = 0;
  let applySyncFrame = 0;

  const normalizeConfig = (config = {}) => ({
    enabled: config.enabled !== false
  });

  const isExcludedRoute = () => /^#\/?(lyrics|video)(?:[/?]|$)/i.test(window.location.hash || "");

  const normalizePath = (path) => {
    if (!path) return "/";
    const withSlash = path.startsWith("/") ? path : `/${path}`;
    return withSlash.replace(/\/+$/, "") || "/";
  };

  const getCurrentPath = () => {
    const hash = window.location.hash || "#/";
    return normalizePath(hash.replace(/^#/, "").split("?")[0] || "/");
  };

  const getRoutePathFromHref = (href) => normalizePath(String(href || "").replace(/^#/, ""));

  const isPathActive = (targetPath, currentPath) => {
    if (targetPath === "/") return currentPath === "/";
    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
  };

  const readAuthStore = () => {
    const raw = localStorage.getItem("MoeData");
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const getProfileLabel = () => {
    const store = readAuthStore();
    const nickname = typeof store?.UserInfo?.nickname === "string" ? store.UserInfo.nickname.trim() : "";
    return nickname || DEFAULT_LOGIN_LABEL;
  };

  const isAuthenticated = () => Boolean(readAuthStore()?.UserInfo);

  const dispatchClick = (target) => {
    if (!(target instanceof Element)) return;
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  };

  const waitFrame = () => new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

  const syncTopNavActive = (enabled) => {
    const links = [...document.querySelectorAll("header .nav-links a[href^='#/']")];
    if (!links.length) return;

    if (!enabled) {
      links.forEach((link) => link.classList.remove("active"));
      return;
    }

    const currentPath = getCurrentPath();
    links.forEach((link) => {
      const targetPath = getRoutePathFromHref(link.getAttribute("href") || "");
      link.classList.toggle("active", isPathActive(targetPath, currentPath));
    });
  };

  const findHeaderMenuAction = (iconClass) => {
    const items = [...document.querySelectorAll("header .profile-menu li a")];
    return items.find((item) => item.querySelector(`.${iconClass}`)) || null;
  };

  const ensureHeaderMenuReady = async () => {
    if (findHeaderMenuAction(ACTION_ICON_CLASS.settings)) return true;

    const profile = document.querySelector("header .profile");
    if (!(profile instanceof Element)) return false;

    dispatchClick(profile);
    for (let i = 0; i < 6; i++) {
      await waitFrame();
      if (findHeaderMenuAction(ACTION_ICON_CLASS.settings)) return true;
    }

    return false;
  };

  const invokeHeaderAction = async (action) => {
    const iconClass = ACTION_ICON_CLASS[action];
    if (!iconClass) return false;

    let target = findHeaderMenuAction(iconClass);
    if (!target) {
      const ready = await ensureHeaderMenuReady();
      if (!ready) return false;
      target = findHeaderMenuAction(iconClass);
    }

    if (!target) return false;
    dispatchClick(target);
    return true;
  };

  const syncProfileLabel = (enabled) => {
    const profile = document.querySelector("header .profile");
    if (!(profile instanceof Element)) return;

    let nameNode = profile.querySelector(`.${PROFILE_NAME_CLASS}`);
    if (!enabled) {
      if (nameNode) nameNode.remove();
      profile.removeAttribute("title");
      return;
    }

    if (!nameNode) {
      nameNode = document.createElement("span");
      nameNode.className = PROFILE_NAME_CLASS;
      profile.appendChild(nameNode);
    }

    const label = getProfileLabel();
    if (nameNode.textContent !== label) {
      nameNode.textContent = label;
    }
    profile.title = label;
  };

  const updateStaticAccountMenu = (menu) => {
    const authenticated = isAuthenticated();
    const currentPath = getCurrentPath();

    const loginButton = menu.querySelector(".mk-link-login");
    const logoutButton = menu.querySelector(".mk-link-logout");
    const settingsButton = menu.querySelector('[data-action="settings"]');

    loginButton.classList.toggle("mk-hidden", authenticated);
    logoutButton.classList.toggle("mk-hidden", !authenticated);

    settingsButton.classList.toggle("active", isPathActive("/settings", currentPath));
    loginButton.classList.toggle("active", !authenticated && isPathActive("/login", currentPath));
  };

  const ensureStaticAccountMenu = () => {
    const navLinks = document.querySelector("header .nav-links");
    if (!navLinks) return;

    let menu = document.getElementById(STATIC_MENU_ID);
    if (!menu) {
      menu = document.createElement("div");
      menu.id = STATIC_MENU_ID;
      menu.className = "mk-apple-account-links";
      menu.innerHTML = STATIC_ACCOUNT_MENU_HTML;

      menu.addEventListener("click", async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const actionButton = target.closest("[data-action]");
        if (!actionButton) return;

        event.preventDefault();
        event.stopPropagation();

        const action = actionButton.getAttribute("data-action");
        await invokeHeaderAction(action);
        scheduleApply();
      });
    }

    if (menu.parentElement !== navLinks.parentElement || menu.previousElementSibling !== navLinks) {
      navLinks.insertAdjacentElement("afterend", menu);
    }

    updateStaticAccountMenu(menu);
  };

  const removeStaticAccountMenu = () => {
    const menu = document.getElementById(STATIC_MENU_ID);
    if (menu) menu.remove();
  };

  const syncFloatingContextMenus = () => {
    if (!(currentConfig.enabled && !isExcludedRoute())) return;

    if (!document.querySelector(".context-menu")) return;

    document.querySelectorAll(".context-menu").forEach((menu) => {
      if (!(menu instanceof HTMLElement)) return;
      if (menu.parentElement !== document.body) {
        document.body.appendChild(menu);
      }
      menu.style.position = "fixed";
      menu.style.zIndex = "60";
    });
  };

  const scheduleFloatingMenuSync = () => {
    if (floatingSyncFrame) return;
    floatingSyncFrame = window.requestAnimationFrame(() => {
      floatingSyncFrame = 0;
      syncFloatingContextMenus();
    });
  };

  const applyTheme = () => {
    const enabled = currentConfig.enabled && !isExcludedRoute();
    document.documentElement.classList.toggle(ENABLED_CLASS, enabled);

    if (enabled) {
      ensureStaticAccountMenu();
      syncProfileLabel(true);
      syncTopNavActive(true);
      scheduleFloatingMenuSync();
    } else {
      removeStaticAccountMenu();
      syncProfileLabel(false);
      syncTopNavActive(false);
    }
  };

  const scheduleApply = () => {
    if (applySyncFrame) return;
    applySyncFrame = window.requestAnimationFrame(() => {
      applySyncFrame = 0;
      applyTheme();
      window.requestAnimationFrame(applyTheme);
    });
  };

  const readConfig = () => new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result = {}) => {
      const hasStored = Object.prototype.hasOwnProperty.call(result, STORAGE_KEY);
      const normalized = normalizeConfig(result[STORAGE_KEY] || DEFAULT_CONFIG);
      if (!hasStored) {
        chrome.storage.local.set({ [STORAGE_KEY]: normalized });
      }
      resolve(normalized);
    });
  });

  const init = async () => {
    currentConfig = await readConfig();
    scheduleApply();
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) return;
    currentConfig = normalizeConfig(changes[STORAGE_KEY].newValue || DEFAULT_CONFIG);
    scheduleApply();
  });

  window.addEventListener("hashchange", () => {
    scheduleApply();
    window.setTimeout(scheduleApply, 0);
  }, { passive: true });

  window.addEventListener("focus", scheduleApply, { passive: true });

  document.addEventListener("contextmenu", scheduleFloatingMenuSync, true);
  document.addEventListener("click", (event) => {
    scheduleFloatingMenuSync();
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("header .nav-links a, .profile-menu a, .mk-apple-side-link")) return;
    window.setTimeout(scheduleApply, 0);
  }, true);

  document.documentElement.classList.toggle(ENABLED_CLASS, DEFAULT_CONFIG.enabled && !isExcludedRoute());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleApply, { once: true });
  }

  init();
})();
