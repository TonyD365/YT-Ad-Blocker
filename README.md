# YT-Ad-Blocker

> A Tampermonkey userscript that blocks ads on YouTube with a **hybrid** strategy
> (network interception + DOM skipping + CSS hiding), plus a draggable, hideable
> in-page control panel.
>
> 一个用**混合策略**（网络拦截 + DOM 跳过 + CSS 隐藏）拦截 YouTube 广告的油猴
> （Tampermonkey）用户脚本，并带有可拖动、可隐藏的页面内控制面板。

![license](https://img.shields.io/badge/license-MIT-blue.svg)
![userscript](https://img.shields.io/badge/userscript-Tampermonkey-00485B.svg)
![version](https://img.shields.io/badge/version-1.0.0-brightgreen.svg)

**Language / 语言:** [English](#english) · [中文](#中文)

---

## English

- [Features](#features)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Usage](#usage)
- [Settings & Persistence](#settings--persistence)
- [Supported Sites](#supported-sites)
- [Compatibility & Requirements](#compatibility--requirements)
- [Limitations](#limitations)
- [Disclaimer](#disclaimer)
- [License](#license)

### Features

- **Network interception** — strips ad metadata from YouTube's player API responses so ads are never scheduled.
- **Video-ad skipping** — clicks the *Skip* button and fast-forwards unskippable in-stream ads as a fallback.
- **Static-ad hiding** — hides masthead, in-feed, overlay, companion, and promoted ad slots via CSS.
- **Anti-adblock popup removal** — dismisses the "ad blocker detected" enforcement popup and resumes playback.
- **Draggable control panel** — an in-page panel with a master switch and per-feature toggles; drag to reposition, hide it, and re-open it from the Tampermonkey menu.
- **Live toggles** — every switch takes effect immediately, no page reload required.
- **Auto-update** — `@updateURL` / `@downloadURL` keep the script up to date through Tampermonkey.

### How It Works

YouTube serves ads in **three** distinct ways, so the script combines **three** countermeasures. Since around 2025 YouTube increasingly *server-stitches* video ads, which means no single technique is 100% reliable — combining them is what makes blocking robust.

| Ad category | Example | Countermeasure |
| --- | --- | --- |
| Static display ads | Masthead banner, in-feed "promoted", overlay/companion ads | CSS hiding |
| In-stream video ads | Pre-/mid-/post-roll played by the player | Network interception (primary) + DOM skip (fallback) |
| Anti-adblock detection | "Ad blockers violate YouTube's Terms of Service" popup | Remove element + resume playback |

The script runs at **`@run-at document-start`** so its network hooks are installed *before* YouTube's own page scripts execute. It is organized into five modules inside a single IIFE:

#### 1. Network interception (core)

- Patches `unsafeWindow.fetch` and `unsafeWindow.XMLHttpRequest`, and defines a getter/setter over the inline `ytInitialPlayerResponse` global.
- For requests to `/youtubei/v1/player` and `/youtubei/v1/next`, it deletes the ad-carrying fields from the JSON: `adPlacements`, `playerAds`, `adSlots`, `adBreakHeartbeatParams` (including a nested `playerResponse`).
- `fetch` responses are `clone()`d, rewritten, and returned as a new `Response` with `content-length` dropped (the body shrank). XHR responses are rewritten by shadowing `responseText` / `response`.
- **Only ad fields are removed** — stream URLs and player config are left untouched, so playback is unaffected.

#### 2. Video-ad skipper (DOM fallback)

- A `MutationObserver` watches `#movie_player` / `.html5-video-player` for the `ad-showing` / `ad-interrupting` classes.
- When an ad is detected it clicks `.ytp-ad-skip-button-modern` (and older `.ytp-skip-ad-button` / `.ytp-ad-skip-button`); for unskippable ads it sets `video.currentTime = video.duration` and mutes.
- Re-attaches on the `yt-navigate-finish` SPA navigation event.

#### 3. Static-ad CSS hiding

- Injects a stylesheet that applies `display: none !important` to ad renderers such as `#masthead-ad`, `ytd-ad-slot-renderer`, `ytd-in-feed-ad-layout-renderer`, `ytd-promoted-*`, `.ytp-ad-module`, and more.
- The stylesheet is toggleable (`<style>.disabled`), so it can be switched on/off live.

#### 4. Anti-adblock popup removal

- A `MutationObserver` removes `ytd-enforcement-message-view-model`, `tp-yt-iron-overlay-backdrop`, the related `tp-yt-paper-dialog`, and the "blocker" toast.
- It then restores the locked `body` scroll and calls `play()` on the paused `<video>`.

#### 5. Control panel & settings

- Settings are stored with `GM_getValue` / `GM_setValue`. A single live `settings` object is read by every module *at call time*, which is why toggles apply without a reload.
- The panel is built once the DOM is ready, made draggable with pointer events (position saved), hideable (state saved), and re-openable through `GM_registerMenuCommand`.

### Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser.
2. Open the raw script to trigger the install prompt:
   **https://raw.githubusercontent.com/TonyD365/YT-Ad-Blocker/main/yt-ad-blocker.user.js**
3. Confirm in Tampermonkey. Updates are then applied automatically.

### Usage

- A small panel appears at the top-right of YouTube. **Drag it by the header** to reposition — the position is remembered.
- Click **✕** to hide the panel. **Re-open** it from the Tampermonkey menu → **"显示 / 隐藏 控制面板"** (Show / Hide control panel).
- Toggle the master switch or any individual feature:

  | Toggle (panel label) | Effect |
  | --- | --- |
  | 总开关 — Master | Enables/disables everything |
  | 跳过视频广告 — Skip video ads | In-stream ad skipping |
  | 隐藏静态广告 — Hide static ads | CSS hiding of ad slots |
  | 移除反屏蔽弹窗 — Remove anti-adblock popups | Dismiss enforcement popups |
  | 网络拦截 — Network blocking | Strip ad metadata from responses |

### Settings & Persistence

All preferences are stored per-browser via the userscript manager:

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Master switch |
| `skipVideoAds` | `true` | Skip in-stream video ads |
| `hideStaticAds` | `true` | Hide static ad elements |
| `removePopups` | `true` | Remove anti-adblock popups |
| `blockNetwork` | `true` | Strip ad metadata from network responses |
| `panelHidden` | `false` | Whether the panel is hidden |
| `panelPos` | `null` | Saved panel position `{x, y}` |

### Supported Sites

`www.youtube.com`, `youtube.com`, `m.youtube.com`, `music.youtube.com`, `www.youtube-nocookie.com`

### Compatibility & Requirements

- Requires a userscript manager — **Tampermonkey is recommended** (the live CSS toggle relies on `GM_addStyle` returning the injected element).
- Works on Chrome, Firefox, Edge, Opera, and Safari.

### Limitations

- YouTube changes its DOM selectors and API response shapes frequently; a class or field rename can temporarily break a module.
- Server-stitched ads may occasionally slip past the network layer — that's exactly what the DOM skip fallback is for.
- In fullscreen, the floating panel may be covered by the fullscreen video element.
- This is a lightweight personal tool, not a replacement for a full-featured blocker such as uBlock Origin.

### Disclaimer

This project is for personal and educational use. Ad blocking may conflict with YouTube's Terms of Service, and the techniques here can break at any time. If you enjoy a creator's work, please consider supporting them or subscribing to YouTube Premium.

### License

[MIT](https://github.com/TonyD365/YT-Ad-Blocker/blob/main/LICENSE) © TonyD365

---

## 中文

- [功能](#功能)
- [原理](#原理)
- [安装](#安装)
- [使用](#使用)
- [设置与持久化](#设置与持久化)
- [支持站点](#支持站点)
- [兼容性与依赖](#兼容性与依赖)
- [局限性](#局限性)
- [免责声明](#免责声明)
- [许可证](#许可证)

### 功能

- **网络拦截** —— 从 YouTube 播放器接口响应中剥离广告字段，让广告根本不被排期。
- **视频广告跳过** —— 作为兜底，点击*跳过*按钮并对不可跳过的贴片广告快进。
- **静态广告隐藏** —— 用 CSS 隐藏首页大图、信息流、浮层、companion 与推广广告位。
- **反屏蔽弹窗移除** —— 关闭"检测到广告拦截器"弹窗并恢复播放。
- **可拖动控制面板** —— 含总开关与分项开关的页面内面板；可拖动改位、可隐藏，并能从油猴菜单重新唤出。
- **实时开关** —— 每个开关都即时生效，无需刷新页面。
- **自动更新** —— `@updateURL` / `@downloadURL` 让油猴自动保持脚本更新。

### 原理

YouTube 用**三种**不同方式投放广告，因此本脚本组合了**三种**应对手段。自 2025 年起，YouTube 越来越多地采用**服务端拼接**视频广告，单一手段都无法做到 100% 可靠 —— 多手段组合才稳健。

| 广告类别 | 例子 | 应对手段 |
| --- | --- | --- |
| 静态展示广告 | 首页大图横幅、信息流"推广"、浮层/companion 广告 | CSS 隐藏 |
| 内嵌视频广告 | 播放器播放的前/中/后贴片 | 网络拦截（主）+ DOM 跳过（兜底） |
| 反屏蔽检测 | "广告拦截器违反 YouTube 服务条款"弹窗 | 移除元素 + 恢复播放 |

脚本以 **`@run-at document-start`** 运行，确保网络钩子在 YouTube 自身页面脚本执行**之前**安装好。整体在一个 IIFE 内分为五个模块：

#### 1. 网络拦截（核心）

- 改写 `unsafeWindow.fetch` 与 `unsafeWindow.XMLHttpRequest`，并对页面内联的全局变量 `ytInitialPlayerResponse` 定义读写访问器。
- 对 `/youtubei/v1/player` 与 `/youtubei/v1/next` 的请求，从 JSON 中删除承载广告的字段：`adPlacements`、`playerAds`、`adSlots`、`adBreakHeartbeatParams`（含嵌套的 `playerResponse`）。
- `fetch` 响应会被 `clone()`、改写后以新的 `Response` 返回，并删除 `content-length`（正文变短了）；XHR 响应则通过遮蔽 `responseText` / `response` 改写。
- **只删除广告字段** —— 流地址与播放器配置原样保留，因此不影响播放。

#### 2. 视频广告跳过（DOM 兜底）

- 用 `MutationObserver` 监听 `#movie_player` / `.html5-video-player` 上的 `ad-showing` / `ad-interrupting` 类。
- 检测到广告时点击 `.ytp-ad-skip-button-modern`（以及旧版 `.ytp-skip-ad-button` / `.ytp-ad-skip-button`）；不可跳过的广告则设 `video.currentTime = video.duration` 并静音。
- 在 SPA 导航事件 `yt-navigate-finish` 后重新挂载。

#### 3. 静态广告 CSS 隐藏

- 注入样式表，对 `#masthead-ad`、`ytd-ad-slot-renderer`、`ytd-in-feed-ad-layout-renderer`、`ytd-promoted-*`、`.ytp-ad-module` 等广告元素应用 `display: none !important`。
- 样式表可开关（`<style>.disabled`），因此能实时启用/停用。

#### 4. 反屏蔽弹窗移除

- 用 `MutationObserver` 移除 `ytd-enforcement-message-view-model`、`tp-yt-iron-overlay-backdrop`、相关的 `tp-yt-paper-dialog` 以及"blocker"提示条。
- 随后恢复被锁定的 `body` 滚动，并对暂停的 `<video>` 调用 `play()`。

#### 5. 控制面板与设置

- 设置通过 `GM_getValue` / `GM_setValue` 存储。各模块在**运行时**读取同一个实时的 `settings` 对象，所以开关无需刷新即可生效。
- 面板在 DOM 就绪后构建，用指针事件实现拖动（位置持久化）、可隐藏（状态持久化），并可通过 `GM_registerMenuCommand` 重新唤出。

### 安装

1. 为你的浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展。
2. 打开脚本原始地址以触发安装：
   **https://raw.githubusercontent.com/TonyD365/YT-Ad-Blocker/main/yt-ad-blocker.user.js**
3. 在 Tampermonkey 中确认安装，之后会自动更新。

### 使用

- 面板默认出现在 YouTube 右上角。**按住标题栏拖动**可改变位置，位置会被保存。
- 点击 **✕** 隐藏面板。可从油猴菜单 → **"显示 / 隐藏 控制面板"** 重新唤出。
- 可切换总开关或任意分项：

  | 开关（面板文字） | 作用 |
  | --- | --- |
  | 总开关 | 启用/停用全部功能 |
  | 跳过视频广告 | 跳过内嵌视频广告 |
  | 隐藏静态广告 | CSS 隐藏广告位 |
  | 移除反屏蔽弹窗 | 关闭检测弹窗 |
  | 网络拦截 | 从响应中剥离广告字段 |

### 设置与持久化

所有偏好都由用户脚本管理器按浏览器保存：

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `skipVideoAds` | `true` | 跳过内嵌视频广告 |
| `hideStaticAds` | `true` | 隐藏静态广告元素 |
| `removePopups` | `true` | 移除反屏蔽弹窗 |
| `blockNetwork` | `true` | 从网络响应剥离广告字段 |
| `panelHidden` | `false` | 面板是否隐藏 |
| `panelPos` | `null` | 已保存的面板位置 `{x, y}` |

### 支持站点

`www.youtube.com`、`youtube.com`、`m.youtube.com`、`music.youtube.com`、`www.youtube-nocookie.com`

### 兼容性与依赖

- 需要用户脚本管理器 —— **推荐 Tampermonkey**（实时 CSS 开关依赖 `GM_addStyle` 返回注入的元素）。
- 可在 Chrome、Firefox、Edge、Opera、Safari 上运行。

### 局限性

- YouTube 经常更改 DOM 选择器与接口响应结构；某个类名或字段被重命名可能会暂时让对应模块失效。
- 服务端拼接的广告偶尔会绕过网络层 —— 这正是 DOM 跳过兜底存在的意义。
- 全屏时，浮动面板可能被全屏视频元素遮挡。
- 这是一个轻量的个人工具，并非 uBlock Origin 等全功能拦截器的替代品。

### 免责声明

本项目仅供个人学习与研究使用。拦截广告可能与 YouTube 的服务条款相冲突，且这里的技术随时可能失效。如果你喜欢某位创作者，请考虑支持他们或订阅 YouTube Premium。

### 许可证

[MIT](https://github.com/TonyD365/YT-Ad-Blocker/blob/main/LICENSE) © TonyD365
