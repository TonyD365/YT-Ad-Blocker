// ==UserScript==
// @name              YT-Ad-Blocker
// @name:zh-CN        YouTube 广告拦截器
// @namespace         https://github.com/TonyD365/YT-Ad-Blocker
// @version           1.0.0
// @description       Block and hide ads on YouTube (banners, overlays, masthead and promoted content).
// @description:zh-CN 拦截并隐藏 YouTube 广告（横幅、浮层、首页大图以及推广内容）。
// @author            TonyD365
// @license           MIT
// @homepageURL       https://github.com/TonyD365/YT-Ad-Blocker
// @supportURL        https://github.com/TonyD365/YT-Ad-Blocker/issues
// @match             https://www.youtube.com/*
// @match             https://m.youtube.com/*
// @match             https://music.youtube.com/*
// @match             https://www.youtube-nocookie.com/*
// @icon              https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @run-at            document-start
// @grant             GM_addStyle
// @grant             GM_getValue
// @grant             GM_setValue
// @grant             GM_registerMenuCommand
// @grant             unsafeWindow
// @downloadURL       https://raw.githubusercontent.com/TonyD365/YT-Ad-Blocker/main/yt-ad-blocker.user.js
// @updateURL         https://raw.githubusercontent.com/TonyD365/YT-Ad-Blocker/main/yt-ad-blocker.user.js
// @compatible        chrome
// @compatible        firefox
// @compatible        edge
// @compatible        opera
// @compatible        safari
// ==/UserScript==

(function () {
  'use strict';

  const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  /* ------------------------------------------------------------------ *
   * Settings (live — every module reads from this object at call time, *
   * so toggles take effect without a page reload).                     *
   * ------------------------------------------------------------------ */
  const DEFAULTS = {
    enabled: true,
    skipVideoAds: true,
    hideStaticAds: true,
    removePopups: true,
    blockNetwork: true,
    panelHidden: false,
    panelPos: null,
  };

  const settings = {};
  for (const key in DEFAULTS) settings[key] = GM_getValue(key, DEFAULTS[key]);

  const save = (key, value) => { settings[key] = value; GM_setValue(key, value); };
  const active = (feature) => settings.enabled && settings[feature];

  /* ------------------------------------------------------------------ *
   * 1. Network interception — strip ad metadata from the InnerTube     *
   *    player/next responses so the player never schedules ads.        *
   * ------------------------------------------------------------------ */
  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];

  function stripAds(data) {
    if (!data || typeof data !== 'object') return data;
    for (const key of AD_KEYS) if (key in data) delete data[key];
    if (data.playerResponse && typeof data.playerResponse === 'object') {
      for (const key of AD_KEYS) if (key in data.playerResponse) delete data.playerResponse[key];
    }
    return data;
  }

  function cleanJson(text) {
    try {
      return JSON.stringify(stripAds(JSON.parse(text)));
    } catch (e) {
      return null;
    }
  }

  const isPlayerUrl = (url) =>
    typeof url === 'string' &&
    (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next'));

  function installNetworkHook() {
    if (w.__ytabHooked) return;
    w.__ytabHooked = true;

    const origFetch = w.fetch;
    if (typeof origFetch === 'function') {
      w.fetch = function (input, init) {
        const promise = origFetch.apply(this, arguments);
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (!isPlayerUrl(url) || !active('blockNetwork')) return promise;
        return promise.then((resp) => {
          if (!resp.ok) return resp;
          return resp.clone().text().then((text) => {
            const cleaned = cleanJson(text);
            if (cleaned === null) return resp;
            try {
              const headers = new Headers(resp.headers);
              headers.delete('content-length'); // body length changed after stripping
              return new Response(cleaned, { status: resp.status, statusText: resp.statusText, headers });
            } catch (e) {
              return resp;
            }
          }).catch(() => resp);
        });
      };
    }

    const OrigXHR = w.XMLHttpRequest;
    if (typeof OrigXHR === 'function') {
      const Hooked = function () {
        const xhr = new OrigXHR();
        let reqUrl = '';
        const origOpen = xhr.open;
        xhr.open = function (method, url) {
          reqUrl = url || '';
          return origOpen.apply(xhr, arguments);
        };
        xhr.addEventListener('readystatechange', function () {
          if (xhr.readyState !== 4 || !isPlayerUrl(reqUrl) || !active('blockNetwork')) return;
          try {
            const type = xhr.responseType;
            if (type === 'json') {
              const value = stripAds(xhr.response);
              Object.defineProperty(xhr, 'response', { value, configurable: true });
            } else if (type === '' || type === 'text') {
              const cleaned = cleanJson(xhr.responseText);
              if (cleaned !== null) {
                Object.defineProperty(xhr, 'responseText', { value: cleaned, configurable: true });
                Object.defineProperty(xhr, 'response', { value: cleaned, configurable: true });
              }
            }
          } catch (e) { /* leave the original response untouched */ }
        });
        return xhr;
      };
      Hooked.prototype = OrigXHR.prototype;
      Object.setPrototypeOf(Hooked, OrigXHR);
      w.XMLHttpRequest = Hooked;
    }

    // The first player response is also inlined in the page as a global; intercept the assignment.
    try {
      let cached;
      Object.defineProperty(w, 'ytInitialPlayerResponse', {
        configurable: true,
        get() { return cached; },
        set(value) { cached = active('blockNetwork') ? stripAds(value) : value; },
      });
    } catch (e) { /* property may be locked on some pages */ }
  }

  /* ------------------------------------------------------------------ *
   * 2. Video-ad skipper (DOM fallback for ads that still play).        *
   * ------------------------------------------------------------------ */
  function setupAdSkipper() {
    let classObserver = null;
    let adTimer = null;

    function skip(player) {
      if (!active('skipVideoAds')) return;
      const skipBtn = player.querySelector(
        '.ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button'
      );
      if (skipBtn) { skipBtn.click(); return; }
      const video = player.querySelector('video.html5-main-video, video.video-stream, video');
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        try { video.currentTime = video.duration; } catch (e) { /* may be reset by player */ }
        video.muted = true;
      }
    }

    function evaluate(player) {
      const adShowing = player.classList.contains('ad-showing') ||
                        player.classList.contains('ad-interrupting');
      if (adShowing && !adTimer) {
        skip(player);
        adTimer = setInterval(() => skip(player), 200);
      } else if (!adShowing && adTimer) {
        clearInterval(adTimer);
        adTimer = null;
      }
    }

    function attach() {
      const player = document.querySelector('#movie_player, .html5-video-player');
      if (!player) return false;
      if (classObserver) classObserver.disconnect();
      classObserver = new MutationObserver(() => evaluate(player));
      classObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
      evaluate(player);
      return true;
    }

    if (!attach()) {
      const waitForPlayer = new MutationObserver(() => { if (attach()) waitForPlayer.disconnect(); });
      waitForPlayer.observe(document.documentElement, { childList: true, subtree: true });
    }
    w.addEventListener('yt-navigate-finish', attach);
    document.addEventListener('yt-navigate-finish', attach);
  }

  /* ------------------------------------------------------------------ *
   * 3. Static ad hiding via CSS (toggleable stylesheet).               *
   * ------------------------------------------------------------------ */
  const STATIC_AD_CSS = `
    #masthead-ad,
    #player-ads,
    ytd-ad-slot-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-banner-promo-renderer,
    ytd-banner-promo-renderer-background,
    ytd-statement-banner-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-promoted-video-renderer,
    ytd-display-ad-renderer,
    ytd-companion-slot-renderer,
    ytd-action-companion-ad-renderer,
    .ytp-ad-module,
    .ytp-ad-overlay-slot,
    .ytp-ad-overlay-container,
    #related ytd-ad-slot-renderer {
      display: none !important;
    }
  `;
  const staticStyle = GM_addStyle(STATIC_AD_CSS);
  const applyStaticState = () => {
    if (staticStyle) staticStyle.disabled = !active('hideStaticAds');
  };
  applyStaticState();

  /* ------------------------------------------------------------------ *
   * 4. Anti-adblock popup removal + resume playback.                   *
   * ------------------------------------------------------------------ */
  function setupPopupRemover() {
    function clean() {
      if (!active('removePopups')) return;
      let removed = false;
      document.querySelectorAll('ytd-enforcement-message-view-model').forEach((el) => {
        (el.closest('tp-yt-paper-dialog') || el).remove();
        removed = true;
      });
      document.querySelectorAll('tp-yt-iron-overlay-backdrop').forEach((el) => { el.remove(); removed = true; });
      document.querySelectorAll('tp-yt-paper-toast#toast').forEach((toast) => {
        if (toast.querySelector('a[href*="blocker"], a[href*="ad_blocker"]')) { toast.remove(); removed = true; }
      });
      if (!removed) return;
      if (document.body && document.body.style.overflow === 'hidden') document.body.style.overflow = '';
      const video = document.querySelector('video.html5-main-video, video.video-stream');
      if (video && video.paused) video.play().catch(() => {});
    }
    new MutationObserver(clean).observe(document.documentElement, { childList: true, subtree: true });
    clean();
  }

  /* ------------------------------------------------------------------ *
   * 0. Floating control panel — draggable & hideable.                  *
   * ------------------------------------------------------------------ */
  const PANEL_CSS = `
    #ytab-panel {
      position: fixed; top: 70px; right: 16px; z-index: 2147483647;
      width: 210px; background: rgba(28,28,28,.96); color: #fff;
      font: 12px/1.4 Roboto, Arial, sans-serif; border-radius: 10px;
      box-shadow: 0 4px 18px rgba(0,0,0,.45); user-select: none; overflow: hidden;
    }
    #ytab-panel * { box-sizing: border-box; }
    #ytab-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 10px; cursor: move; background: rgba(255,255,255,.07); font-weight: 600;
    }
    #ytab-close { cursor: pointer; opacity: .7; padding: 0 4px; font-size: 13px; }
    #ytab-close:hover { opacity: 1; }
    #ytab-body { padding: 4px 10px 8px; }
    .ytab-row { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; }
    .ytab-row > label { cursor: pointer; }
    .ytab-sw { position: relative; width: 34px; height: 18px; flex: 0 0 auto; }
    .ytab-sw input { position: absolute; opacity: 0; width: 0; height: 0; }
    .ytab-sw > label {
      display: block; width: 34px; height: 18px; border-radius: 9px;
      background: #666; cursor: pointer; transition: background .2s;
    }
    .ytab-sw > label::after {
      content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
      border-radius: 50%; background: #fff; transition: transform .2s;
    }
    .ytab-sw input:checked + label { background: #3ea6ff; }
    .ytab-sw input:checked + label::after { transform: translateX(16px); }
  `;
  GM_addStyle(PANEL_CSS);

  const ROWS = [
    ['enabled', '总开关'],
    ['skipVideoAds', '跳过视频广告'],
    ['hideStaticAds', '隐藏静态广告'],
    ['removePopups', '移除反屏蔽弹窗'],
    ['blockNetwork', '网络拦截'],
  ];

  function makeDraggable(panel, handle) {
    let startX, startY, originX, originY, dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.id === 'ytab-close') return;
      const rect = panel.getBoundingClientRect();
      originX = rect.left; originY = rect.top;
      startX = e.clientX; startY = e.clientY;
      panel.style.left = originX + 'px';
      panel.style.top = originY + 'px';
      panel.style.right = 'auto';
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;
      const x = Math.max(0, Math.min(originX + e.clientX - startX, maxX));
      const y = Math.max(0, Math.min(originY + e.clientY - startY, maxY));
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
    });
    handle.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      handle.releasePointerCapture(e.pointerId);
      save('panelPos', { x: parseInt(panel.style.left, 10), y: parseInt(panel.style.top, 10) });
    });
  }

  function buildPanel() {
    if (!document.body || document.getElementById('ytab-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'ytab-panel';
    panel.innerHTML =
      '<div id="ytab-header"><span>🛡️ YT Ad Blocker</span><span id="ytab-close" title="隐藏">✕</span></div>' +
      '<div id="ytab-body">' +
      ROWS.map(([key, label]) =>
        `<div class="ytab-row"><label for="ytab-${key}">${label}</label>` +
        `<span class="ytab-sw"><input type="checkbox" id="ytab-${key}" data-key="${key}"` +
        `${settings[key] ? ' checked' : ''}><label for="ytab-${key}"></label></span></div>`
      ).join('') +
      '</div>';
    document.body.appendChild(panel);

    if (settings.panelPos) {
      panel.style.left = settings.panelPos.x + 'px';
      panel.style.top = settings.panelPos.y + 'px';
      panel.style.right = 'auto';
    }
    if (settings.panelHidden) panel.style.display = 'none';

    panel.querySelectorAll('input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', () => {
        save(cb.dataset.key, cb.checked);
        applyStaticState();
      });
    });
    panel.querySelector('#ytab-close').addEventListener('click', () => {
      panel.style.display = 'none';
      save('panelHidden', true);
    });
    makeDraggable(panel, panel.querySelector('#ytab-header'));
  }

  GM_registerMenuCommand('显示 / 隐藏 控制面板', () => {
    const panel = document.getElementById('ytab-panel');
    if (!panel) { buildPanel(); save('panelHidden', false); return; }
    const willHide = panel.style.display !== 'none';
    panel.style.display = willHide ? 'none' : '';
    save('panelHidden', willHide);
  });

  /* ------------------------------------------------------------------ *
   * Boot.                                                              *
   * ------------------------------------------------------------------ */
  installNetworkHook();

  function onReady() {
    buildPanel();
    setupAdSkipper();
    setupPopupRemover();
  }
  if (document.body) onReady();
  else document.addEventListener('DOMContentLoaded', onReady, { once: true });
})();
