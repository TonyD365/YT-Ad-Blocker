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

  // Hide static ad slots: banners, overlays, masthead and promoted shelves.
  GM_addStyle(`
    #masthead-ad,
    #player-ads,
    ytd-ad-slot-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-banner-promo-renderer,
    ytd-statement-banner-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-promoted-video-renderer,
    .ytp-ad-module,
    .ytp-ad-overlay-slot {
      display: none !important;
    }
  `);

  // TODO: hook the player to skip in-stream video ads.
})();
