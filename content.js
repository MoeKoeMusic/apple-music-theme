(() => {
  "use strict";

  const STORAGE_KEY = "appleMusicLayoutTheme";
  const ENABLED_CLASS = "mk-apple-layout-enabled";
  const STATIC_MENU_ID = "mk-apple-static-account-links";
  const PROFILE_NAME_CLASS = "mk-apple-profile-name";
  const PROFILE_LINK_CLASS = "mk-apple-profile-link";
  const PROFILE_BOOTSTRAP_MARK = "data-mk-profile-bootstrap";
  const FLOATING_MENU_PORTAL_MARK = "data-mk-floating-portal";
  const CLICK_GUARD_MARK = "data-mk-click-guard";
  const DEFAULT_CONFIG = Object.freeze({
    enabled: true
  });

  let currentConfig = { ...DEFAULT_CONFIG };
  let scheduledFrame = 0;
  let bootstrapRetryTimer = 0;
  let bootstrapRetryCount = 0;
  let observerHoldCount = 0;
  let headerObserver = null;
  let floatingUiObserver = null;
  let floatingUiFrame = 0;
  let initialConfigPromise = null;

  function normalizeConfig(config) {
    const next = config && typeof config === "object" ? config : {};
    return {
      enabled: next.enabled !== false
    };
  }

  function isExcludedRoute() {
    const hash = window.location.hash || "";
    return /^#\/?(lyrics|video)(?:[/?]|$)/i.test(hash);
  }


  function applyRootThemeState(config) {
    const root = document.documentElement;
    if (!root) return false;

    const shouldEnable = Boolean(config.enabled) && !isExcludedRoute();
    if (!shouldEnable) {
      root.classList.remove(ENABLED_CLASS);
      return false;
    }

    root.classList.add(ENABLED_CLASS);
    return true;
  }

  function getCurrentPath() {
    const hash = window.location.hash || "#/";
    const cleaned = hash.replace(/^#/, "");
    return cleaned.split("?")[0] || "/";
  }

  function normalizePath(path) {
    if (!path) return "/";
    const withSlash = path.startsWith("/") ? path : `/${path}`;
    return withSlash.replace(/\/+$/, "") || "/";
  }

  function navigateTo(path) {
    const targetPath = normalizePath(path);
    const targetHash = `#${targetPath}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }

  function readPersistedAuth() {
    try {
      const raw = localStorage.getItem("MoeData");
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function getAuthState() {
    const store = readPersistedAuth();
    const userInfo = store && typeof store.UserInfo === "object" ? store.UserInfo : null;
    const nickname = typeof userInfo?.nickname === "string" ? userInfo.nickname.trim() : "";
    return {
      nickname,
      isAuthenticated: Boolean(userInfo && nickname)
    };
  }

  function getLibraryLabel(navLinks) {
    const libraryLink = navLinks?.querySelector('a[href="#/library"]');
    const label = libraryLink?.textContent?.trim();
    return label || "Library";
  }

  function dispatchClick(target) {
    if (!target) return;
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }

  function requestBootstrapRetry() {
    if (bootstrapRetryTimer || bootstrapRetryCount >= 12) return;
    bootstrapRetryCount += 1;
    bootstrapRetryTimer = window.setTimeout(() => {
      bootstrapRetryTimer = 0;
      scheduleApply();
    }, 0);
  }

  function withObserverHold(fn) {
    observerHoldCount += 1;
    try {
      return fn();
    } finally {
      queueMicrotask(() => {
        observerHoldCount = Math.max(0, observerHoldCount - 1);
      });
    }
  }

  function isInjectedElement(node) {
    if (!(node instanceof Element)) return false;
    if (node.id === STATIC_MENU_ID) return true;
    if (node.classList.contains(PROFILE_NAME_CLASS) || node.classList.contains(PROFILE_LINK_CLASS)) return true;
    if (node.closest(`#${STATIC_MENU_ID}`)) return true;
    return false;
  }

  function hasRelevantMutation(mutations) {
    return mutations.some((mutation) => {
      const elements = [...mutation.addedNodes, ...mutation.removedNodes].filter((node) => node instanceof Element);

      if (!elements.length) {
        return mutation.target instanceof Element && Boolean(mutation.target.closest("header"));
      }

      return elements.some((node) => {
        if (isInjectedElement(node)) return false;
        if (node.matches("header, nav, .navigation, .search-profile, .nav-links, .profile, .profile-menu")) {
          return true;
        }
        return Boolean(node.querySelector("header, .navigation, .search-profile, .nav-links, .profile, .profile-menu"));
      });
    });
  }

  function ensureHeaderObserver() {
    if (headerObserver) return;

    headerObserver = new MutationObserver((mutations) => {
      if (!currentConfig.enabled) return;
      if (observerHoldCount > 0) return;
      if (!hasRelevantMutation(mutations)) return;
      scheduleApply();
    });

    headerObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function hasFloatingUiMutation(mutations) {
    return mutations.some((mutation) => {
      const elements = [...mutation.addedNodes, ...mutation.removedNodes].filter((node) => node instanceof Element);

      if (!elements.length) {
        return mutation.target instanceof Element && Boolean(
          mutation.target.closest(".context-menu, .submenu, .more-btn, .dropdown-menu, .detail-page")
        );
      }

      return elements.some((node) => {
        if (node.matches(".context-menu, .submenu, .more-btn, .dropdown-menu, .detail-page")) {
          return true;
        }
        return Boolean(node.querySelector(".context-menu, .submenu, .more-btn, .dropdown-menu, .detail-page"));
      });
    });
  }

  function ensureFloatingUiObserver() {
    if (floatingUiObserver) return;

    floatingUiObserver = new MutationObserver((mutations) => {
      if (!currentConfig.enabled) return;
      if (observerHoldCount > 0) return;
      if (!hasFloatingUiMutation(mutations)) return;
      scheduleFloatingUiSync();
    });

    floatingUiObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function moveFloatingContextMenusToBody() {
    document.querySelectorAll(".context-menu").forEach((menu) => {
      if (!(menu instanceof HTMLElement)) return;
      if (menu.parentElement === document.body && menu.getAttribute(FLOATING_MENU_PORTAL_MARK) === "true") return;
      document.body.appendChild(menu);
      menu.setAttribute(FLOATING_MENU_PORTAL_MARK, "true");
    });
  }

  function bindDetailMenuClickGuards() {
    document.querySelectorAll(".detail-page .more-btn, .detail-page .dropdown-menu").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.getAttribute(CLICK_GUARD_MARK) === "true") return;
      node.setAttribute(CLICK_GUARD_MARK, "true");
      node.addEventListener("click", (event) => {
        event.stopPropagation();
      }, true);
    });
  }

  function syncFloatingUi(shouldEnable) {
    if (!shouldEnable) return;
    moveFloatingContextMenusToBody();
    bindDetailMenuClickGuards();
  }

  function scheduleFloatingUiSync() {
    if (floatingUiFrame) return;
    floatingUiFrame = window.requestAnimationFrame(() => {
      floatingUiFrame = 0;
      syncFloatingUi(Boolean(currentConfig.enabled) && !isExcludedRoute());
    });
  }

  function ensureProfileMenuMounted(profile) {
    const existingMenu = document.querySelector("header .profile-menu");
    if (existingMenu) {
      bootstrapRetryCount = 0;
      return existingMenu;
    }
    if (!profile || profile.hasAttribute(PROFILE_BOOTSTRAP_MARK)) return null;

    profile.setAttribute(PROFILE_BOOTSTRAP_MARK, "true");
    dispatchClick(profile);
    queueMicrotask(() => profile.removeAttribute(PROFILE_BOOTSTRAP_MARK));

    const mountedMenu = document.querySelector("header .profile-menu");
    if (mountedMenu) {
      bootstrapRetryCount = 0;
      return mountedMenu;
    }

    requestBootstrapRetry();
    return null;
  }

  function closeProfileMenu(profile) {
    if (!profile || !document.querySelector("header .profile-menu")) return;
    profile.setAttribute(PROFILE_BOOTSTRAP_MARK, "true");
    dispatchClick(profile);
    queueMicrotask(() => profile.removeAttribute(PROFILE_BOOTSTRAP_MARK));
  }

  function removeInjectedSidebarUi() {
    const menu = document.getElementById(STATIC_MENU_ID);
    if (menu) menu.remove();

    document.querySelectorAll(`header .${PROFILE_NAME_CLASS}`).forEach((node) => node.remove());
    document.querySelectorAll(`header .${PROFILE_LINK_CLASS}`).forEach((node) => node.remove());

    const profile = document.querySelector("header .profile");
    if (profile) {
      profile.removeAttribute("data-mk-user-label");
      profile.removeAttribute("title");
      closeProfileMenu(profile);
    }
  }

  function isRouteLink(sourceNode) {
    const href = sourceNode?.getAttribute("href") || "";
    return href.startsWith("#/");
  }

  function getRoutePathFromHref(href) {
    return normalizePath(String(href || "").replace(/^#/, ""));
  }

  function isActiveRouteLink(href, currentPath) {
    const targetPath = getRoutePathFromHref(href);
    if (targetPath === "/") return currentPath === "/";
    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
  }

  function cloneMenuContent(sourceNode, targetNode) {
    for (const childNode of sourceNode.childNodes) {
      targetNode.appendChild(childNode.cloneNode(true));
    }
  }

  function buildSidebarItem(sourceNode, currentPath, itemIndex, profile) {
    if (!(sourceNode instanceof Element)) return null;

    const href = sourceNode.getAttribute("href") || "";
    const routeLike = isRouteLink(sourceNode);
    const element = document.createElement(routeLike ? "a" : "button");
    element.className = "mk-apple-side-link";
    cloneMenuContent(sourceNode, element);

    if (routeLike) {
      element.href = href;
      if (isActiveRouteLink(href, currentPath)) {
        element.classList.add("active");
      }
      element.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      return element;
    }

    element.type = "button";
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const liveMenu = ensureProfileMenuMounted(profile);
      const liveItems = liveMenu ? [...liveMenu.querySelectorAll("li > a")] : [];
      const liveNode = liveItems[itemIndex] || sourceNode;
      dispatchClick(liveNode);
      window.requestAnimationFrame(scheduleApply);
    });
    return element;
  }

  function getMenuSignature(sourceItems, currentPath) {
    const itemSignature = sourceItems.map((item) => {
      const badge = item.querySelector(".new-badge") ? "1" : "0";
      return [item.getAttribute("href") || "", item.textContent?.trim() || "", badge].join("|");
    }).join("||");
    return `${currentPath}::${itemSignature}`;
  }

  function syncStaticSidebarMenu(navLinks, sourceMenu, profile) {
    const sourceItems = [...sourceMenu.querySelectorAll("li > a")].filter((node) => node instanceof Element);
    if (!sourceItems.length) return;

    let menu = document.getElementById(STATIC_MENU_ID);
    if (!menu) {
      menu = document.createElement("div");
      menu.id = STATIC_MENU_ID;
      menu.className = "mk-apple-account-links";
      navLinks.insertAdjacentElement("afterend", menu);
    }

    const currentPath = getCurrentPath();
    const signature = getMenuSignature(sourceItems, currentPath);
    if (menu.dataset.signature === signature) return;

    const nextNodes = sourceItems
      .map((item, index) => buildSidebarItem(item, currentPath, index, profile))
      .filter((node) => node instanceof Node);

    menu.replaceChildren(...nextNodes);
    menu.dataset.signature = signature;
  }

  function syncProfileCard(profile, navLinks) {
    const auth = getAuthState();
    const userLabel = auth.nickname || getLibraryLabel(navLinks);

    profile.dataset.mkUserLabel = userLabel;
    profile.title = userLabel;

    let nameNode = profile.querySelector(`.${PROFILE_NAME_CLASS}`);
    if (!nameNode) {
      nameNode = document.createElement("span");
      nameNode.className = PROFILE_NAME_CLASS;
      profile.appendChild(nameNode);
    }
    if (nameNode.textContent !== userLabel) {
      nameNode.textContent = userLabel;
    }

    let hitArea = profile.querySelector(`.${PROFILE_LINK_CLASS}`);
    if (!hitArea) {
      hitArea = document.createElement("a");
      hitArea.className = PROFILE_LINK_CLASS;
      hitArea.href = "#/library";
      hitArea.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        navigateTo("/library");
      });
      profile.appendChild(hitArea);
    }
    hitArea.setAttribute("aria-label", userLabel);
  }


  function syncSidebarEnhancements(shouldEnable) {
    const header = document.querySelector("header");
    const navLinks = header?.querySelector(".nav-links");
    const profile = header?.querySelector(".profile");

    if (!shouldEnable) {
      bootstrapRetryCount = 0;
      removeInjectedSidebarUi();
      return;
    }

    if (!header || !navLinks || !profile) {
      requestBootstrapRetry();
      return;
    }

    const sourceMenu = ensureProfileMenuMounted(profile);
    if (!sourceMenu) return;

    bootstrapRetryCount = 0;
    syncProfileCard(profile, navLinks);
    syncStaticSidebarMenu(navLinks, sourceMenu, profile);
  }

  function applyTheme(config) {
    const shouldEnable = applyRootThemeState(config);

    if (!shouldEnable) {
      withObserverHold(() => {
        syncSidebarEnhancements(false);
      });
      return;
    }

    if (!document.body) return;

    withObserverHold(() => {
      syncSidebarEnhancements(true);
      syncFloatingUi(true);
    });
  }

  function scheduleApply() {
    if (scheduledFrame) return;
    scheduledFrame = window.requestAnimationFrame(() => {
      scheduledFrame = 0;
      applyTheme(currentConfig);
    });
  }

  function readConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        const hasStoredConfig = Object.prototype.hasOwnProperty.call(result || {}, STORAGE_KEY);
        const normalized = normalizeConfig((result || {})[STORAGE_KEY] || DEFAULT_CONFIG);

        if (!hasStoredConfig) {
          chrome.storage.local.set({ [STORAGE_KEY]: normalized }, () => resolve(normalized));
          return;
        }

        resolve(normalized);
      });
    });
  }

  function primeTheme() {
    if (initialConfigPromise) return initialConfigPromise;

    initialConfigPromise = readConfig()
      .then((config) => {
        currentConfig = config;
        applyRootThemeState(config);
        return config;
      })
      .catch(() => {
        applyRootThemeState(currentConfig);
        return currentConfig;
      });

    return initialConfigPromise;
  }

  async function init() {
    currentConfig = await primeTheme();
    ensureHeaderObserver();
    ensureFloatingUiObserver();
    applyTheme(currentConfig);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) return;
    currentConfig = normalizeConfig(changes[STORAGE_KEY].newValue || DEFAULT_CONFIG);
    applyTheme(currentConfig);
  });

  window.addEventListener("hashchange", scheduleApply, { passive: true });
  window.addEventListener("focus", scheduleApply, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleApply();
  });

  primeTheme();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

