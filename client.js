// ModelGlance — client half.
// An Apple / Arc inspired, quiet-luxury model picker for DeepSeek Harness.
//
// Security posture: this file has no filesystem, shell, process or network
// access. It only reads the session model directory through the seat face the
// host injects, and commits a selection through the same face. Everything it
// persists is a model identity (`provider/model`), nothing else.
window.__ModuleLoader__.load({
  id: 'dsh-model-glance',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')

    const {
      useCallback,
      useEffect,
      useLayoutEffect,
      useMemo,
      useRef,
      useState,
      useSyncExternalStore,
    } = React

    const h = React.createElement
    const NS = 'modelGlance'

    // ------------------------------------------------------------- dictionaries

    const zh = {
      'trigger.placeholder': '选择模型',
      'trigger.aria': '当前模型：{model}，点击更换',
      'trigger.ariaEmpty': '选择模型',
      'trigger.ariaEffort': '推理强度：{effort}',
      'menu.aria': '模型选择',
      'search.placeholder': '搜索模型…',
      'search.placeholderWide': '搜索模型名称、提供商或简介…',
      'search.clear': '清除搜索',
      'group.favorites': '我的收藏',
      'group.recent': '最近使用',
      'group.all': '全部模型',
      'nav.all': '全部模型',
      'nav.favorites': '我的收藏',
      'nav.recent': '最近使用',
      'nav.providers': '提供商',
      'effort.label': '推理强度',
      'effort.note': '档位越高，思考越久',
      'effort.none': '该模型未声明推理档位',
      'effort.supported': '支持推理强度调节',
      'effort.default': 'Default',
      'current.label': '当前',
      'count.available': '{count} 个可用模型',
      'action.expand': '全部',
      'action.expandTitle': '展开全部模型',
      'action.collapse': '收起为紧凑弹窗',
      'action.close': '关闭',
      'action.retry': '重试',
      'action.reload': '重新加载',
      'favorite.add': '收藏模型',
      'favorite.remove': '取消收藏',
      'status.loading': '正在加载模型…',
      'status.empty': '没有匹配的模型',
      'status.emptyFavorites': '悬停模型行并点击星标即可收藏',
      'status.emptyRecent': '暂无最近使用记录',
      'status.emptyCatalog': '没有可用的模型',
      'status.unavailable': '当前会话不可用',
      'error.switch': '切换失败，仍在用原来的模型（{message}）',
      'error.sessionInUse': '当前会话已被占用，请退出其他正在运行的 DSH 后重试',
      'provider.account': 'DeepSeek 账号',
    }

    const en = {
      'trigger.placeholder': 'Select model',
      'trigger.aria': 'Current model: {model}. Click to change',
      'trigger.ariaEmpty': 'Select model',
      'trigger.ariaEffort': 'Reasoning effort: {effort}',
      'menu.aria': 'Model selection',
      'search.placeholder': 'Search models…',
      'search.placeholderWide': 'Search models, providers, or descriptions…',
      'search.clear': 'Clear search',
      'group.favorites': 'Favorites',
      'group.recent': 'Recent',
      'group.all': 'All models',
      'nav.all': 'All models',
      'nav.favorites': 'Favorites',
      'nav.recent': 'Recent',
      'nav.providers': 'Providers',
      'effort.label': 'Effort',
      'effort.note': 'Higher means longer thinking',
      'effort.none': 'No reasoning efforts advertised',
      'effort.supported': 'Supports reasoning effort',
      'effort.default': 'Default',
      'current.label': 'Current',
      'count.available': '{count} models available',
      'action.expand': 'All',
      'action.expandTitle': 'Browse all models',
      'action.collapse': 'Collapse to popover',
      'action.close': 'Close',
      'action.retry': 'Retry',
      'action.reload': 'Reload',
      'favorite.add': 'Favorite model',
      'favorite.remove': 'Remove favorite',
      'status.loading': 'Loading models…',
      'status.empty': 'No matching model',
      'status.emptyFavorites': 'Hover a model and click the star to favorite it',
      'status.emptyRecent': 'No recently used models yet',
      'status.emptyCatalog': 'No models available',
      'status.unavailable': 'This session is unavailable',
      'error.switch': 'Switch failed, still using the previous model ({message})',
      'error.sessionInUse': 'This session is busy. Quit other running DSH windows and try again',
      'provider.account': 'DeepSeek account',
    }

    // ---------------------------------------------------------------- storage

    const FAVORITES_KEY = 'modelGlance.favorites.v1'
    const RECENT_KEY = 'modelGlance.recent.v1'
    const RECENT_MAX = 8

    function storage() {
      try {
        return window.localStorage
      } catch (error) {
        return null
      }
    }

    function readIds(key) {
      try {
        const raw = storage() && storage().getItem(key)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter((item) => typeof item === 'string')
      } catch (error) {
        return []
      }
    }

    function writeIds(key, ids) {
      try {
        const store = storage()
        if (store) store.setItem(key, JSON.stringify(ids))
      } catch (error) {
        /* localStorage can be unavailable or full; the UI still works */
      }
    }

    const rowKey = (provider, model) => provider + '/' + model

    // Curated Apple-grade restrained brand color & monogram mapping.
    // Unknown third-party providers deterministically hash into a 10-color low-saturation palette.
    const FALLBACK_BRANDS = [
      '#3B7BF6', '#0D9488', '#7C5CFA', '#C96442', '#109472',
      '#D44D8A', '#C88218', '#5264F0', '#0284C7', '#E05275',
    ]

    const BRAND_RULES = [
      { test: (id, s) => id === 'deepseek-account' || (/deepseek/i.test(s) && /账号|account/i.test(s)), mono: 'DS', color: '#3B7BF6' },
      { test: (id, s) => /deepseek/i.test(s) && /api/i.test(s), mono: 'API', color: '#0D9488' },
      { test: (id, s) => /deepseek/i.test(s), mono: 'DS', color: '#3B7BF6' },
      { test: (id, s) => /opencode/i.test(s), mono: 'OG', color: '#7C5CFA' },
      { test: (id, s) => /opendesign/i.test(s), mono: 'OD', color: '#D44D8A' },
      { test: (id, s) => /commandcode/i.test(s), mono: 'CC', color: '#C88218' },
      { test: (id, s) => /\bgoat\b|goat-/i.test(s), mono: 'GT', color: '#B87333' },
      { test: (id, s) => /openrout/i.test(s), mono: 'OR', color: '#6C5CE7' },
      { test: (id, s) => /silicon|硅基/i.test(s), mono: 'SF', color: '#5B6CFA' },
      { test: (id, s) => /anthropic|claude/i.test(s), mono: 'AN', color: '#C96442' },
      { test: (id, s) => /azure/i.test(s), mono: 'AZ', color: '#0078D4' },
      { test: (id, s) => /openai/i.test(s), mono: 'OA', color: '#109472' },
      { test: (id, s) => /vertex/i.test(s), mono: 'VX', color: '#0D9488' },
      { test: (id, s) => /google|gemini/i.test(s), mono: 'GM', color: '#5264F0' },
      { test: (id, s) => /zhipu|glm|智谱/i.test(s), mono: 'GL', color: '#4263EB' },
      { test: (id, s) => /qwen|dashscope|alibaba|aliyun|通义|百炼/i.test(s), mono: 'QW', color: '#8655E8' },
      { test: (id, s) => /moonshot|kimi|月之暗面/i.test(s), mono: 'KM', color: '#0284C7' },
      { test: (id, s) => /minimax/i.test(s), mono: 'MM', color: '#E05275' },
      { test: (id, s) => /volc|doubao|bytedance|ark|豆包|火山/i.test(s), mono: 'DB', color: '#2589F5' },
      { test: (id, s) => /stepfun|阶跃/i.test(s), mono: 'ST', color: '#D97706' },
      { test: (id, s) => /hunyuan|tencent|混元|腾讯/i.test(s), mono: 'HY', color: '#0F9D8A' },
      { test: (id, s) => /groq/i.test(s), mono: 'GQ', color: '#E05A2B' },
      { test: (id, s) => /mistral/i.test(s), mono: 'MS', color: '#D96B27' },
      { test: (id, s) => /together/i.test(s), mono: 'TG', color: '#3B6CE8' },
      { test: (id, s) => /fireworks/i.test(s), mono: 'FW', color: '#9333EA' },
      { test: (id, s) => /cloudflare/i.test(s), mono: 'CF', color: '#EA6A1F' },
      { test: (id, s) => /bedrock|aws/i.test(s), mono: 'AW', color: '#D97706' },
      { test: (id, s) => /hugging/i.test(s), mono: 'HF', color: '#D4940A' },
      { test: (id, s) => /perplexity/i.test(s), mono: 'PX', color: '#0E8A8A' },
      { test: (id, s) => /xai|grok/i.test(s), mono: 'XA', color: '#6B7280' },
      { test: (id, s) => /ollama/i.test(s), mono: 'OL', color: '#78716C' },
      { test: (id, s) => /lmstudio|lm-studio/i.test(s), mono: 'LM', color: '#78716C' },
      { test: (id, s) => /vllm/i.test(s), mono: 'VL', color: '#64748B' },
    ]

    function hashString(text) {
      let hash = 2166136261
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
      return hash >>> 0
    }

    function providerMonogram(name, id) {
      const rawName = String(name || id || '').trim()
      const asciiWords = rawName.match(/[A-Za-z0-9]+/g)
      if (asciiWords && asciiWords.length >= 2) {
        return (asciiWords[0][0] + asciiWords[1][0]).toUpperCase()
      }
      if (asciiWords && asciiWords.length === 1) {
        return asciiWords[0].slice(0, 2).toUpperCase()
      }
      return rawName.slice(0, 1).toUpperCase() || 'M'
    }

    function providerBrand(name, id) {
      const combined = String(id || '') + ' ' + String(name || '')
      for (const rule of BRAND_RULES) {
        if (rule.test(id, combined)) return { mono: rule.mono, color: rule.color }
      }
      const key = String(id || name || 'provider').toLowerCase()
      return {
        mono: providerMonogram(name, id),
        color: FALLBACK_BRANDS[hashString(key) % FALLBACK_BRANDS.length],
      }
    }

    // The host can carry a verbose error payload; keep one readable line.
    function tidyDetail(value) {
      const text = typeof value === 'string' ? value : String(value === undefined ? '' : value)
      const flat = text.replace(/\s+/g, ' ').trim()
      return flat.length > 160 ? flat.slice(0, 160) + '...' : flat
    }

    // ----------------------------------------------------------------- icons

    const svg = (props, ...children) =>
      h('svg', Object.assign({ viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' }, props), ...children)

    const iconChevron = () =>
      svg({ width: 11, height: 11, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, className: 'mg-chevron' },
        h('path', { d: 'M4.2 6.5 8 10.2 11.8 6.5', strokeLinecap: 'round', strokeLinejoin: 'round' }))

    const iconCheck = () =>
      svg({ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
        h('path', { d: 'M3.2 8.5 6.4 11.7 13 4.8', strokeLinecap: 'round', strokeLinejoin: 'round' }))

    const iconStar = (filled) =>
      svg({ width: 13, height: 13, fill: filled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' },
        h('path', { d: 'M8 2.1 9.8 5.8 13.8 6.4 10.9 9.2 11.6 13.2 8 11.3 4.4 13.2 5.1 9.2 2.2 6.4 6.2 5.8Z' }))

    const iconSpark = () =>
      svg({ width: 10, height: 10, fill: 'currentColor', className: 'mg-spark-svg' },
        h('path', { d: 'M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z' }))

    const iconClose = () =>
      svg({ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
        h('path', { d: 'M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8', strokeLinecap: 'round' }))

    const iconCollapse = () =>
      svg({ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M10 3.5H12.5V6' }),
        h('path', { d: 'M12.5 3.5 9 7' }),
        h('path', { d: 'M6 12.5H3.5V10' }),
        h('path', { d: 'M3.5 12.5 7 9' }))

    const iconArrowUpRight = () =>
      svg({ width: 11, height: 11, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M5 11 11 5M6 5h5v5' }))

    const iconSearch = () =>
      svg({ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, className: 'mg-search-icon' },
        h('circle', { cx: 7.2, cy: 7.2, r: 4.5 }),
        h('path', { d: 'M10.6 10.6 13.8 13.8', strokeLinecap: 'round' }))

    const iconGrid = () =>
      svg({ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, className: 'mg-nav-ico' },
        h('rect', { x: 2.5, y: 2.5, width: 4.5, height: 4.5, rx: 1.2 }),
        h('rect', { x: 9, y: 2.5, width: 4.5, height: 4.5, rx: 1.2 }),
        h('rect', { x: 2.5, y: 9, width: 4.5, height: 4.5, rx: 1.2 }),
        h('rect', { x: 9, y: 9, width: 4.5, height: 4.5, rx: 1.2 }))

    const iconClock = () =>
      svg({ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', className: 'mg-nav-ico' },
        h('circle', { cx: 8, cy: 8, r: 5.5 }),
        h('path', { d: 'M8 4.8V8L10.2 9.4' }))

    const iconAlert = () =>
      svg({ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', className: 'mg-alert-ico' },
        h('circle', { cx: 8, cy: 8, r: 5.8 }),
        h('path', { d: 'M8 5.2v3.3M8 11h.01' }))

    // ------------------------------------------------------------------- CSS
    // Apple / Arc Liquid-Glass Aesthetic — strictly derived from DSH --dsw-alias-* tokens

    const CSS = `
.mg-trigger{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;height:28px;padding:0 9px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-weight:500;letter-spacing:-.012em;line-height:1;cursor:pointer}
.mg-trigger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)}
.mg-trigger[aria-expanded="true"]{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent)}
.mg-trigger:disabled{opacity:.55;cursor:default}
.mg-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mg-trigger-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
.mg-trigger-dot{flex:none;width:6px;height:6px;border-radius:999px;background:var(--mg-brand,var(--dsw-alias-brand-primary));opacity:.9}
.mg-trigger-effort{flex:none;display:inline-flex;align-items:center;gap:3px;height:19px;padding:0 7px;border:0;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:550;letter-spacing:.01em;line-height:1}
.mg-trigger:hover:not(:disabled) .mg-trigger-effort{color:var(--dsw-alias-label-primary)}
.mg-chevron{flex:none;color:var(--dsw-alias-label-secondary);opacity:.8}
.mg-spark-svg{flex:none;opacity:.8}

.mg-pop{
  --mg-hair:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);
  --mg-hair-soft:color-mix(in srgb,var(--dsw-alias-label-primary) 5.5%,transparent);
  --mg-hover:color-mix(in srgb,var(--dsw-alias-label-primary) 4.5%,transparent);
  --mg-active:color-mix(in srgb,var(--dsw-alias-label-primary) 7.5%,transparent);
  --mg-track:color-mix(in srgb,var(--dsw-alias-label-primary) 5.5%,transparent);
  --mg-surface:color-mix(in srgb,var(--dsw-alias-bg-base) 86%,transparent);
  --mg-rail:color-mix(in srgb,var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base)) 72%,transparent);
  --mg-dock:color-mix(in srgb,var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base)) 76%,transparent);
  --mg-tint-bg:12%;
  --mg-tint-ring:22%;
  --mg-chip-tint:13%;
  position:relative;min-height:0;z-index:2147483000;display:flex;flex-direction:column;box-sizing:border-box;
  border:0;border-radius:18px;overflow:hidden;
  background:var(--mg-surface);
  backdrop-filter:blur(34px) saturate(185%);-webkit-backdrop-filter:blur(34px) saturate(185%);
  color:var(--dsw-alias-label-primary);
  box-shadow:0 30px 70px -16px rgba(15,23,42,.20),0 10px 24px -8px rgba(15,23,42,.08),0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 11%,transparent),inset 0 1px 0 rgba(255,255,255,.55);
  font-size:13px;line-height:1.4;text-align:left;outline:none
}
.mg-pop *{box-sizing:border-box}
@media (prefers-color-scheme: dark){
  .mg-pop{
    --mg-tint-bg:17%;
    --mg-tint-ring:28%;
    --mg-chip-tint:18%;
    box-shadow:0 36px 84px -14px rgba(0,0,0,.72),0 12px 28px -6px rgba(0,0,0,.46),0 0 0 .5px rgba(255,255,255,.12),inset 0 1px 0 rgba(255,255,255,.12)
  }
  .mg-seg-thumb{
    background:color-mix(in srgb,var(--dsw-alias-label-primary) 15%,var(--dsw-alias-bg-base));
    box-shadow:0 1px 3px rgba(0,0,0,.4),inset 0 .5px 0 rgba(255,255,255,.16)
  }
}

.mg-cmd-bar{flex:none;display:flex;align-items:center;gap:9px;height:44px;padding:0 14px;border-bottom:1px solid var(--mg-hair-soft)}
.mg-search-icon{flex:none;color:var(--dsw-alias-label-secondary);opacity:.72}
.mg-pop input.mg-search-input{flex:1 1 auto;min-width:0;height:28px;padding:0;margin:0;border:0;border-radius:0;background:transparent;box-shadow:none;appearance:none;-webkit-appearance:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:13.5px;letter-spacing:-.01em;line-height:28px;outline:none}
.mg-pop input.mg-search-input::-webkit-search-cancel-button{display:none}
.mg-pop input.mg-search-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.68}
.mg-kbd{flex:none;font-size:10px;font-weight:550;color:var(--dsw-alias-label-secondary);opacity:.72;padding:2px 6px;border-radius:5px;background:var(--mg-track);letter-spacing:.04em;user-select:none}

.mg-chips{flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px 4px}
.mg-chips-pin{flex:none;display:flex;align-items:center;gap:6px}
.mg-chips-divider{width:1px;height:14px;background:var(--mg-hair);flex:none}
.mg-chips-rail-wrap{position:relative;flex:1;min-width:0;display:flex;align-items:center}
.mg-chips-rail{display:flex;align-items:center;gap:4px;overflow-x:auto;scroll-behavior:smooth;scrollbar-width:none;padding:1px 14px 1px 2px;mask-image:linear-gradient(to right,transparent 0,black 8px,black calc(100% - 22px),transparent 100%);-webkit-mask-image:linear-gradient(to right,transparent 0,black 8px,black calc(100% - 22px),transparent 100%)}
.mg-chips-rail.at-start{mask-image:linear-gradient(to right,black 0,black calc(100% - 22px),transparent 100%);-webkit-mask-image:linear-gradient(to right,black 0,black calc(100% - 22px),transparent 100%)}
.mg-chips-rail.at-end{mask-image:linear-gradient(to right,transparent 0,black 10px,black 100%);-webkit-mask-image:linear-gradient(to right,transparent 0,black 10px,black 100%)}
.mg-chips-rail.no-overflow{mask-image:none;-webkit-mask-image:none;padding-right:2px}
.mg-chips-rail::-webkit-scrollbar{display:none}
.mg-chip{flex:none;display:inline-flex;align-items:center;gap:5px;height:25px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;font-weight:480;line-height:25px;cursor:pointer;white-space:nowrap}
.mg-chip:hover{background:var(--mg-hover);color:var(--dsw-alias-label-primary)}
.mg-chip.is-on{background:var(--mg-active);color:var(--dsw-alias-label-primary);font-weight:580;box-shadow:inset 0 0 0 .5px var(--mg-hair)}
.mg-chip.is-brand.is-on{background:color-mix(in srgb,var(--mg-brand) var(--mg-chip-tint),transparent);color:var(--mg-brand);box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--mg-brand) var(--mg-tint-ring),transparent)}
.mg-chip-dot{flex:none;width:5.5px;height:5.5px;border-radius:999px;background:var(--mg-brand);opacity:.8}
.mg-chip.is-on .mg-chip-dot{opacity:1}
.mg-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}

.mg-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:6px 7px 8px}
.mg-scroll::-webkit-scrollbar,.mg-list-scroll::-webkit-scrollbar,.mg-nav::-webkit-scrollbar{width:4px}
.mg-scroll::-webkit-scrollbar-track,.mg-list-scroll::-webkit-scrollbar-track,.mg-nav::-webkit-scrollbar-track{background:transparent}
.mg-scroll::-webkit-scrollbar-thumb,.mg-list-scroll::-webkit-scrollbar-thumb,.mg-nav::-webkit-scrollbar-thumb{background:var(--mg-hair);border-radius:999px}

.mg-sect{display:flex;align-items:center;gap:6px;padding:10px 10px 4px;color:var(--dsw-alias-label-secondary);opacity:.78;font-size:10.5px;font-weight:560;letter-spacing:.04em;text-transform:uppercase}
.mg-scroll>.mg-sect:first-child{padding-top:4px}
.mg-sect b{font-weight:560}
.mg-sect .n{font-variant-numeric:tabular-nums;opacity:.75}

.mg-row{position:relative;display:flex;align-items:center;gap:9px;height:38px;padding:0 7px 0 9px;border-radius:10px;cursor:pointer;box-sizing:border-box}
.mg-row:hover{background:var(--mg-hover)}
.mg-row.is-active{background:var(--mg-active);box-shadow:inset 0 0 0 .5px var(--mg-hair)}
.mg-row[aria-selected="true"]{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7.5%,transparent);box-shadow:inset 0 .5px 0 rgba(255,255,255,.22)}
.mg-row[aria-selected="true"]:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 9.5%,transparent)}
.mg-row[aria-selected="true"] .mg-name{font-weight:580;color:var(--dsw-alias-label-primary)}

.mg-monogram{flex:none;min-width:22px;height:19px;padding:0 4px;border-radius:6px;background:color-mix(in srgb,var(--mg-brand,var(--dsw-alias-label-secondary)) var(--mg-tint-bg),transparent);box-shadow:inset 0 0 0 .5px color-mix(in srgb,var(--mg-brand,var(--dsw-alias-label-secondary)) var(--mg-tint-ring),transparent);color:var(--mg-brand,var(--dsw-alias-label-secondary));font-size:9px;font-weight:680;letter-spacing:-.01em;display:inline-flex;align-items:center;justify-content:center;user-select:none}

.mg-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;letter-spacing:-.012em;color:var(--dsw-alias-label-primary)}
.mg-reason-glyph{flex:none;display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary);opacity:.62}
.mg-row[aria-selected="true"] .mg-reason-glyph{color:var(--dsw-alias-brand-primary);opacity:.92}

.mg-desc{flex:0 1 auto;min-width:0;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:var(--dsw-alias-label-secondary);opacity:.78;font-size:11.5px}
.mg-prov{flex:none;color:var(--dsw-alias-label-secondary);opacity:.78;font-size:11px;white-space:nowrap;text-align:right}
.mg-check{flex:none;width:15px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-brand-primary)}

.mg-star{flex:none;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0}
.mg-row:hover .mg-star,.mg-row:focus-within .mg-star,.mg-star.is-on{opacity:1}
.mg-star:hover{background:var(--mg-active);color:var(--dsw-alias-label-primary)}
.mg-star:active{transform:scale(.92)}
.mg-star.is-on{color:var(--dsw-alias-warn-primary,#d98a1c)}
.mg-star:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}

.mg-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px 8px 12px;border-top:1px solid var(--mg-hair-soft);background:var(--mg-dock)}
.mg-foot-left{display:flex;align-items:center;gap:7px;min-width:0}
.mg-foot-right{display:flex;align-items:center;gap:8px;flex:none}
.mg-foot-label{color:var(--dsw-alias-label-secondary);font-size:11px;letter-spacing:.01em;white-space:nowrap}
.mg-foot-count{color:var(--dsw-alias-label-secondary);opacity:.8;font-size:11px;padding-left:2px;white-space:nowrap}
.mg-foot-cur{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px}
.mg-foot-cur b{font-weight:580;color:var(--dsw-alias-label-primary)}
.mg-foot-note{color:var(--dsw-alias-label-secondary);opacity:.78;font-size:11px;white-space:nowrap}

.mg-more{flex:none;display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;font-weight:500;cursor:pointer;white-space:nowrap}
.mg-more:hover{background:var(--mg-hover);color:var(--dsw-alias-label-primary)}
.mg-more:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}

.mg-seg{position:relative;display:inline-flex;align-items:center;padding:2px;border-radius:999px;background:var(--mg-track)}
.mg-seg-thumb{position:absolute;top:2px;bottom:2px;left:0;border-radius:999px;background:var(--dsw-alias-bg-base);box-shadow:0 1px 3px rgba(0,0,0,.12),0 0 0 .5px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);pointer-events:none;z-index:0;transition:transform 200ms cubic-bezier(.22,1,.36,1),width 200ms cubic-bezier(.22,1,.36,1),opacity 120ms ease}
.mg-seg button{position:relative;z-index:1;height:22px;min-width:34px;padding:0 8px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;font-weight:500;cursor:pointer;white-space:nowrap}
.mg-seg button:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.mg-seg button.is-on{color:var(--dsw-alias-label-primary);font-weight:600}
.mg-seg button:disabled{opacity:.5;cursor:default}
.mg-seg button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}

.mg-status{padding:28px 14px;color:var(--dsw-alias-label-secondary);opacity:.82;font-size:12px;line-height:1.6;text-align:center}
.mg-status-reset{margin-top:8px;height:26px;padding:0 11px;border:1px solid var(--mg-hair);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}
.mg-status-reset:hover{background:var(--mg-hover);color:var(--dsw-alias-label-primary)}

.mg-spin{display:inline-block;width:12px;height:12px;border:1.5px solid color-mix(in srgb,var(--dsw-alias-label-secondary) 35%,transparent);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;flex:none;animation:mg-spin .65s linear infinite}
@keyframes mg-spin{to{transform:rotate(360deg)}}

.mg-error{display:flex;align-items:center;gap:8px;margin:8px 10px;padding:8px 12px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 24%,transparent);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px}
.mg-error button{margin-left:auto;height:24px;padding:0 10px;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px;cursor:pointer}
.mg-foot-error{display:flex;align-items:center;gap:7px;padding:8px 12px;border-top:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 22%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent);color:var(--dsw-alias-state-error-primary);font-size:11.5px}
.mg-alert-ico{flex:none}

.mg-pane{width:100%}
.mg-head-divider{width:1px;height:16px;background:var(--mg-hair-soft);margin:0 3px;flex:none}
.mg-head-actions{display:flex;align-items:center;gap:3px;flex:none}
.mg-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none}
.mg-icon-btn:hover{background:var(--mg-hover);color:var(--dsw-alias-label-primary)}
.mg-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}

.mg-body{flex:1;min-height:0;display:flex}
.mg-nav{flex:none;width:182px;padding:10px 8px;border-right:1px solid var(--mg-hair-soft);background:var(--mg-rail);overflow-y:auto}
.mg-nav-item{display:flex;align-items:center;gap:8px;width:100%;height:33px;padding:0 9px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;font-weight:480;cursor:pointer;text-align:left}
.mg-nav-item:hover{background:var(--mg-hover);color:var(--dsw-alias-label-primary)}
.mg-nav-item.is-on{background:var(--mg-active);box-shadow:inset 0 .5px 0 rgba(255,255,255,.2);color:var(--dsw-alias-label-primary);font-weight:570}
.mg-nav-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.mg-nav-ico{flex:none;opacity:.75}
.mg-nav-item.is-on .mg-nav-ico{opacity:1}
.mg-nav-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-nav-count{margin-left:auto;color:var(--dsw-alias-label-secondary);opacity:.72;font-size:11px;font-variant-numeric:tabular-nums}
.mg-nav-item.is-on .mg-nav-count{color:var(--dsw-alias-brand-primary);opacity:1}
.mg-nav-sep{height:1px;margin:10px 6px;background:var(--mg-hair-soft)}
.mg-nav-head{padding:4px 9px 6px;color:var(--dsw-alias-label-secondary);opacity:.68;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}

.mg-list{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}
.mg-list-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:6px 10px 10px}
.mg-group-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:6px;padding:10px 10px 4px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 96%,transparent);color:var(--dsw-alias-label-secondary);opacity:.86;font-size:10.5px;font-weight:620;letter-spacing:.05em;text-transform:uppercase}
.mg-group-dot{flex:none;width:6px;height:6px;border-radius:999px;background:var(--mg-brand,var(--dsw-alias-label-secondary))}
.mg-group-head:first-child{padding-top:4px}
.mg-pane .mg-row{height:40px}

.mg-row,.mg-chip,.mg-nav-item,.mg-more,.mg-seg button,.mg-star,.mg-trigger,.mg-icon-btn{transition:background-color 110ms ease,color 110ms ease,opacity 120ms ease,box-shadow 110ms ease,transform 110ms ease}
@media (prefers-reduced-motion: no-preference){.mg-pop{animation:mg-in .16s cubic-bezier(.16,1,.3,1)}}
@keyframes mg-in{from{opacity:0;transform:translateY(5px) scale(.988)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.mg-pop{animation:none}.mg-spin{animation:none}.mg-seg-thumb{transition:none}}
`

    // -------------------------------------------------------------- component

    function ModelGlance(props) {
      const { locked, available, directory, load, select, t: translate } = props
      const t = useCallback(
        (key, vars) => {
          const raw = translate ? translate(key, vars) : key
          if (!vars) return raw
          return String(raw).replace(/\{(\w+)\}/g, (match, name) =>
            vars[name] === undefined ? match : String(vars[name]))
        },
        [translate],
      )

      const state = useSyncExternalStore(
        useCallback((notify) => directory.subscribe(notify), [directory]),
        useCallback(() => directory.getSnapshot(), [directory]),
        useCallback(() => directory.getSnapshot(), [directory]),
      )

      const [open, setOpen] = useState(false)
      const [expanded, setExpanded] = useState(false)
      const [query, setQuery] = useState('')
      const [providerFilter, setProviderFilter] = useState('all')
      const [navKey, setNavKey] = useState('all')
      const [activeIndex, setActiveIndex] = useState(-1)
      // Keyboard highlight only appears once the user actually navigated with
      // the arrow keys; opening the panel must not look like a pre-selection.
      const [keysActive, setKeysActive] = useState(false)
      const [switchError, setSwitchError] = useState(null)
      const [pos, setPos] = useState(null)
      const [favoriteIds, setFavoriteIds] = useState(() => readIds(FAVORITES_KEY))
      const [recentIds, setRecentIds] = useState(() => readIds(RECENT_KEY))
      const [thumbStyle, setThumbStyle] = useState(null)
      const [railEdge, setRailEdge] = useState('no-overflow')

      const rootRef = useRef(null)
      const panelRef = useRef(null)
      const searchRef = useRef(null)
      const segRef = useRef(null)
      const chipsRailRef = useRef(null)

      const current = state && state.current ? state.current : null
      const groups = (state && state.groups) || []
      const status = state && state.status ? state.status : 'idle'
      // The shipped build publishes `pending` as undefined on some snapshots, so
      // compare against null rather than against a concrete null value.
      const busy = Boolean(state && state.pending != null)
      const pendingKey = state && state.pending ? rowKey(state.pending.provider, state.pending.model) : null

      // Load the directory as soon as the seat mounts, otherwise the trigger has
      // no model to show until the user opens the panel once.
      useEffect(() => {
        if (available) load()
      }, [available, load])

      // The host has no history API, so the model a session is already using is
      // the only honest seed for "recent". Everything after that is recorded
      // when a switch actually succeeds.
      const currentKey = current ? rowKey(current.provider, current.model) : null
      useEffect(() => {
        if (!currentKey) return
        setRecentIds((previous) => {
          if (previous[0] === currentKey) return previous
          const next = [currentKey].concat(previous.filter((item) => item !== currentKey)).slice(0, RECENT_MAX)
          writeIds(RECENT_KEY, next)
          return next
        })
      }, [currentKey])

      const rows = useMemo(() => {
        const list = []
        for (const group of groups) {
          const providerName = group.id === 'deepseek-account' ? t('provider.account') : group.name
          const brand = providerBrand(providerName, group.id)
          for (const model of group.models || []) {
            list.push({
              key: rowKey(group.id, model.id),
              providerId: group.id,
              providerName,
              monogram: brand.mono,
              brandColor: brand.color,
              model,
              name: model.name || model.id,
              description: model.description || '',
              reasoning: model.reasoning,
            })
          }
        }
        return list
      }, [groups, t])

      const currentRow = useMemo(() => rows.find((row) => row.key === currentKey) || null, [rows, currentKey])
      const reasoning = currentRow ? currentRow.reasoning : undefined
      const efforts = reasoning && Array.isArray(reasoning.efforts) ? reasoning.efforts : []
      const effectiveEffort = current && current.reasoningEffort !== undefined
        ? current.reasoningEffort
        : (reasoning ? reasoning.defaultEffort : undefined)

      const effortName = (() => {
        if (!reasoning) return state && state.retainedEffort ? state.retainedEffort : null
        if (effectiveEffort === undefined) return t('effort.default')
        const match = efforts.find((item) => item.id === effectiveEffort)
        if (match) return match.name
        return effectiveEffort
      })()

      const matches = useCallback((row) => {
        const needle = query.trim().toLowerCase()
        if (!needle) return true
        const haystack = (row.name + ' ' + row.model.id + ' ' + row.providerName + ' ' + row.description).toLowerCase()
        return haystack.indexOf(needle) !== -1
      }, [query])

      const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds])
      const favoriteRows = useMemo(() => rows.filter((row) => favoriteSet.has(row.key)), [rows, favoriteSet])
      const recentRows = useMemo(
        () => recentIds.map((key) => rows.find((row) => row.key === key)).filter(Boolean),
        [recentIds, rows],
      )

      const providers = useMemo(() => {
        const seen = new Map()
        for (const group of groups) {
          if (!seen.has(group.id)) {
            const name = group.id === 'deepseek-account' ? t('provider.account') : group.name
            const brand = providerBrand(name, group.id)
            seen.set(group.id, {
              id: group.id,
              name,
              monogram: brand.mono,
              brandColor: brand.color,
              count: rows.filter((row) => row.providerId === group.id).length,
            })
          }
        }
        return Array.from(seen.values())
      }, [groups, rows, t])

      const multiProvider = providers.length >= 2

      // The compact chip row is a compact-surface control. Expanding must not
      // keep a provider hidden behind a chip the expanded panel cannot show.
      const scoped = useMemo(() => {
        if (expanded || !multiProvider || providerFilter === 'all') return rows
        return rows.filter((row) => row.providerId === providerFilter)
      }, [rows, expanded, multiProvider, providerFilter])
      const visible = useMemo(() => scoped.filter(matches), [scoped, matches])

      // Left navigation always answers from the full catalog; a navigation entry
      // that announces N models must be able to show those N rows.
      const paneRows = useMemo(() => {
        if (navKey === 'favorites') return favoriteRows.filter(matches)
        if (navKey === 'recent') return recentRows.filter(matches)
        if (navKey.indexOf('provider:') === 0) {
          const id = navKey.slice('provider:'.length)
          return rows.filter((row) => row.providerId === id && matches(row))
        }
        return visible
      }, [navKey, favoriteRows, recentRows, rows, visible, matches])

      const keyboardRows = expanded ? paneRows : visible
      // Highlight by row identity, not by render index: the same catalog row can
      // be drawn in more than one section, so positional indices no longer match.
      const activeRow = keysActive && activeIndex >= 0 ? keyboardRows[activeIndex] : null
      const activeKey = activeRow ? activeRow.key : null

      const showEfforts = efforts.length > 0 && Boolean(currentRow)
      const triggerLabel = currentRow ? currentRow.name : t('trigger.placeholder')

      const close = useCallback(() => {
        setOpen(false)
        setExpanded(false)
        setProviderFilter('all')
        setNavKey('all')
        setQuery('')
        setActiveIndex(-1)
        setKeysActive(false)
        setSwitchError(null)
      }, [])

      const openPanel = useCallback(() => {
        setOpen(true)
        setActiveIndex(-1)
        setKeysActive(false)
        setSwitchError(null)
      }, [])

      // Handing the compact chip filter over to the left navigation, and back.
      const expandPanel = useCallback(() => {
        setExpanded(true)
        setNavKey('all')
        setActiveIndex(-1)
        setKeysActive(false)
      }, [])

      const collapsePanel = useCallback(() => {
        setExpanded(false)
        setNavKey('all')
        setActiveIndex(-1)
        setKeysActive(false)
      }, [])

      // ------------------------------------------------------------- placement

      const place = useCallback(() => {
        const trigger = rootRef.current
        const panel = panelRef.current
        if (!trigger) return
        const rect = trigger.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const width = Math.min(expanded ? 720 : 356, viewportWidth - 24)
        const gap = 8
        const roomAbove = rect.top - gap - 12
        const roomBelow = viewportHeight - rect.bottom - gap - 12
        const maxHeight = Math.round(Math.max(180, Math.min(expanded ? 520 : 480, Math.max(roomAbove, roomBelow))))
        const measured = panel ? panel.getBoundingClientRect().height : 0
        const height = Math.round(Math.min(measured > 0 ? measured : maxHeight, maxHeight))
        let left = Math.round(rect.right - width)
        left = Math.max(12, Math.min(left, Math.round(viewportWidth - width - 12)))
        let top = Math.round(rect.top - gap - height)
        if (top < 12) top = Math.round(Math.min(rect.bottom + gap, viewportHeight - height - 12))
        top = Math.max(12, top)
        setPos((previous) => {
          if (previous && previous.left === left && previous.top === top && previous.width === width && previous.maxHeight === maxHeight) return previous
          return { left, top, width, maxHeight }
        })
      }, [expanded])

      useLayoutEffect(() => {
        if (!open) {
          setPos((previous) => (previous === null ? previous : null))
          return undefined
        }
        place()
        const panel = panelRef.current
        let observer = null
        if (panel && typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => place())
          observer.observe(panel)
        }
        const onResize = () => place()
        window.addEventListener('resize', onResize)
        window.addEventListener('scroll', onResize, true)
        return () => {
          if (observer) observer.disconnect()
          window.removeEventListener('resize', onResize)
          window.removeEventListener('scroll', onResize, true)
        }
      }, [open, expanded, place, rows.length, visible.length, query, navKey, providerFilter])

      // Measure & slide the segmented-control pill thumb smoothly.
      useLayoutEffect(() => {
        if (!open || !showEfforts || !segRef.current) {
          setThumbStyle((previous) => (previous === null ? previous : null))
          return
        }
        const seg = segRef.current
        const activeBtn = seg.querySelector('button.is-on')
        if (!activeBtn) {
          setThumbStyle((previous) => (previous === null ? previous : null))
          return
        }
        const nextWidth = activeBtn.offsetWidth + 'px'
        const nextTransform = 'translateX(' + activeBtn.offsetLeft + 'px)'
        setThumbStyle((previous) => {
          if (previous && previous.width === nextWidth && previous.transform === nextTransform) return previous
          return { width: nextWidth, transform: nextTransform, opacity: 1 }
        })
      }, [open, expanded, showEfforts, effectiveEffort, efforts.length])

      // Keep horizontal provider rail edge-fade mask synchronized.
      const syncRailFade = useCallback(() => {
        const rail = chipsRailRef.current
        if (!rail) return
        const maxScroll = rail.scrollWidth - rail.clientWidth
        let next = 'middle'
        if (maxScroll <= 2) next = 'no-overflow'
        else if (rail.scrollLeft <= 2) next = 'at-start'
        else if (rail.scrollLeft >= maxScroll - 2) next = 'at-end'
        setRailEdge((previous) => (previous === next ? previous : next))
      }, [])

      useLayoutEffect(() => {
        if (!open || expanded || !multiProvider) return undefined
        syncRailFade()
        const rail = chipsRailRef.current
        let observer = null
        if (rail && typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => syncRailFade())
          observer.observe(rail)
        }
        return () => {
          if (observer) observer.disconnect()
        }
      }, [open, expanded, multiProvider, providers.length, syncRailFade])

      const onChipsWheel = useCallback((event) => {
        const rail = chipsRailRef.current
        if (!rail || rail.scrollWidth <= rail.clientWidth + 2) return
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          event.preventDefault()
          rail.scrollLeft += event.deltaY
          syncRailFade()
        }
      }, [syncRailFade])

      // Keep keyboard-highlighted row visible when navigating long catalogs.
      useEffect(() => {
        if (!open || !keysActive || !activeKey || !panelRef.current) return
        const node = panelRef.current.querySelector('.mg-row.is-active')
        if (node && typeof node.scrollIntoView === 'function') {
          node.scrollIntoView({ block: 'nearest' })
        }
      }, [open, keysActive, activeKey])

      // Focus: the search field when expanded, the panel otherwise, so the
      // keyboard handler is always reachable without a mouse.
      useEffect(() => {
        if (!open || !pos) return
        if (expanded && searchRef.current) searchRef.current.focus()
        else if (panelRef.current) panelRef.current.focus()
      }, [open, expanded, pos])

      useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const panel = panelRef.current
          const trigger = rootRef.current
          const target = event.target
          if (panel && panel.contains(target)) return
          if (trigger && trigger.contains(target)) return
          close()
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          close()
          const trigger = rootRef.current
          if (trigger) trigger.focus()
        }
        window.addEventListener('pointerdown', onPointerDown, true)
        window.addEventListener('mousedown', onPointerDown, true)
        window.addEventListener('keydown', onKeyDown, true)
        return () => {
          window.removeEventListener('pointerdown', onPointerDown, true)
          window.removeEventListener('mousedown', onPointerDown, true)
          window.removeEventListener('keydown', onKeyDown, true)
        }
      }, [open, close])

      // ------------------------------------------------------------- selection

      const toSelection = useCallback((row) => {
        const sameRoute = Boolean(current && current.provider === row.providerId && current.model === row.model.id)
        const next = { provider: row.providerId, model: row.model.id }
        const fallback = row.reasoning ? row.reasoning.defaultEffort : undefined
        const effort = sameRoute ? (current.reasoningEffort !== undefined ? current.reasoningEffort : fallback) : fallback
        if (effort !== undefined) next.reasoningEffort = effort
        return next
      }, [current])

      const describeFailure = useCallback((result) => {
        if (!result || result.ok) return null
        const error = result.error || {}
        if (error.code === 'session/writer-held') return t('error.sessionInUse')
        const detail = tidyDetail(error.message || error.code || 'unknown')
        return t('error.switch', { message: detail })
      }, [t])

      const rememberRecent = useCallback((key) => {
        setRecentIds((previous) => {
          if (previous[0] === key) return previous
          const next = [key].concat(previous.filter((item) => item !== key)).slice(0, RECENT_MAX)
          writeIds(RECENT_KEY, next)
          return next
        })
      }, [])

      const submit = useCallback(async (row) => {
        if (!row || busy) return
        setSwitchError(null)
        const stayingOpen = expanded
        try {
          const result = await select(toSelection(row))
          const failure = describeFailure(result)
          if (failure) {
            // A rejected selection must leave the previous model in place; the
            // host is the only owner of `current`, so nothing is rewritten here.
            setSwitchError({ key: row.key, message: failure })
            return
          }
          rememberRecent(row.key)
          if (!stayingOpen) {
            close()
            const trigger = rootRef.current
            if (trigger) trigger.focus()
          }
        } catch (error) {
          setSwitchError({ key: row.key, message: t('error.switch', { message: tidyDetail(error && error.message) }) })
        }
      }, [busy, expanded, select, toSelection, describeFailure, rememberRecent, close, t])

      const submitEffort = useCallback(async (effortId) => {
        if (busy || !currentRow) return
        const next = { provider: currentRow.providerId, model: currentRow.model.id }
        if (effortId !== undefined) next.reasoningEffort = effortId
        setSwitchError(null)
        try {
          const result = await select(next)
          const failure = describeFailure(result)
          if (failure) setSwitchError({ key: currentRow.key, message: failure })
        } catch (error) {
          setSwitchError({ key: currentRow.key, message: t('error.switch', { message: tidyDetail(error && error.message) }) })
        }
      }, [busy, currentRow, select, describeFailure, t])

      const toggleFavorite = useCallback((key) => {
        setFavoriteIds((previous) => {
          const next = previous.indexOf(key) === -1
            ? [key].concat(previous)
            : previous.filter((item) => item !== key)
          writeIds(FAVORITES_KEY, next)
          return next
        })
      }, [])

      const onSearchKeyDown = useCallback((event) => {
        // Chinese/Japanese IME: Enter commits the candidate, it must never
        // trigger a model switch.
        const native = event.nativeEvent || {}
        if (native.isComposing || event.keyCode === 229) return
        const stop = () => {
          event.preventDefault()
          event.stopPropagation()
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          stop()
          if (!keyboardRows.length) return
          const delta = event.key === 'ArrowDown' ? 1 : -1
          setKeysActive(true)
          setActiveIndex((previous) => {
            // First press starts next to the current model, so one ↓ followed
            // by Enter always moves to a different model instead of
            // re-selecting the one that is already active.
            let start = previous
            if (start < 0) {
              const currentIndex = keyboardRows.findIndex((row) => row.key === currentKey)
              start = currentIndex < 0 ? (delta > 0 ? -1 : 0) : currentIndex
            }
            return (start + delta + keyboardRows.length) % keyboardRows.length
          })
          return
        }
        if (event.key === 'Enter') {
          const row = activeIndex >= 0 ? keyboardRows[activeIndex] : null
          if (!row) return
          stop()
          submit(row)
          return
        }
        if (event.key === 'Tab') {
          stop()
          close()
          return
        }
        if (event.key === 'ArrowRight') {
          if (expanded) return
          const inSearch = searchRef.current && event.target === searchRef.current
          if (inSearch && query) return
          stop()
          expandPanel()
          return
        }
        if (event.key === 'ArrowLeft') {
          if (!expanded) return
          const inSearch = searchRef.current && event.target === searchRef.current
          if (inSearch && query) return
          stop()
          collapsePanel()
        }
      }, [keyboardRows, activeIndex, currentKey, submit, expanded, query, expandPanel, collapsePanel, close])

      // ------------------------------------------------------------- rendering

      const renderRow = (row, options) => {
        const selected = row.key === currentKey
        const isPending = pendingKey === row.key
        const favorited = favoriteSet.has(row.key)
        const hasReasoning = Boolean(row.reasoning && Array.isArray(row.reasoning.efforts) && row.reasoning.efforts.length > 0)
        const classes = ['mg-row']
        if (activeKey !== null && row.key === activeKey) classes.push('is-active')
        return h('div', {
          key: row.key + (options.suffix || ''),
          className: classes.join(' '),
          role: 'option',
          'aria-selected': selected ? 'true' : 'false',
          'data-provider-id': row.providerId,
          'data-model-id': row.model.id,
          onClick: () => submit(row),
        },
        options.withMonogram
          ? h('span', { className: 'mg-monogram', style: { '--mg-brand': row.brandColor }, title: row.providerName }, row.monogram)
          : null,
        h('span', { className: 'mg-name', title: row.name }, row.name),
        hasReasoning ? h('span', { className: 'mg-reason-glyph', title: t('effort.supported') }, iconSpark()) : null,
        options.withDescription && row.description ? h('span', { className: 'mg-desc', title: row.description }, row.description) : null,
        options.withProvider ? h('span', { className: 'mg-prov' }, row.providerName) : null,
        h('span', { className: 'mg-check' }, isPending ? h('span', { className: 'mg-spin' }) : (selected ? iconCheck() : null)),
        h('button', {
          type: 'button',
          className: 'mg-star' + (favorited ? ' is-on' : ''),
          title: favorited ? t('favorite.remove') : t('favorite.add'),
          'aria-label': favorited ? t('favorite.remove') : t('favorite.add'),
          'aria-pressed': favorited ? 'true' : 'false',
          onClick: (event) => { event.stopPropagation(); toggleFavorite(row.key) },
        }, iconStar(favorited)))
      }

      const effortSeg = showEfforts
        ? h('span', { ref: segRef, className: 'mg-seg', role: 'group', 'aria-label': t('effort.label') },
          thumbStyle ? h('span', { className: 'mg-seg-thumb', style: thumbStyle, 'aria-hidden': 'true' }) : null,
          h('button', {
            type: 'button',
            className: effectiveEffort === undefined ? 'is-on' : undefined,
            'aria-pressed': effectiveEffort === undefined ? 'true' : 'false',
            disabled: busy,
            onClick: () => submitEffort(undefined),
          }, t('effort.default')),
          efforts.map((effort) => h('button', {
            key: 'effort:' + effort.id,
            type: 'button',
            className: effectiveEffort === effort.id ? 'is-on' : undefined,
            'aria-pressed': effectiveEffort === effort.id ? 'true' : 'false',
            disabled: busy,
            onClick: () => submitEffort(effort.id),
          }, effort.name)))
        : null

      const sections = (() => {
        if (expanded) return null
        if (status === 'loading' && !rows.length) {
          return [h('div', { key: 'loading', className: 'mg-status' }, h('span', { className: 'mg-spin' }), ' ', t('status.loading'))]
        }
        if (!visible.length) {
          const hasQuery = Boolean(query.trim())
          return [h('div', { key: 'empty', className: 'mg-status' },
            h('div', null, rows.length ? t('status.empty') : t('status.emptyCatalog')),
            hasQuery
              ? h('button', {
                type: 'button',
                className: 'mg-status-reset',
                onClick: () => { setQuery(''); setActiveIndex(-1); setKeysActive(false) },
              }, t('search.clear'))
              : null)]
        }
        const out = []
        // A model shown under 我的收藏 / 最近使用 must not be repeated again in
        // the full list below, otherwise the same row appears twice and both
        // copies look selected at the same time.
        const placed = new Set()
        if (providerFilter === 'all' && !query.trim()) {
          const favorites = favoriteRows.filter(matches)
          if (favorites.length) {
            out.push(h('div', { key: 'sect-fav', className: 'mg-sect' },
              h('b', null, t('group.favorites')), h('span', { className: 'n' }, String(favorites.length))))
            favorites.forEach((row) => {
              placed.add(row.key)
              out.push(renderRow(row, { withMonogram: multiProvider, suffix: ':fav' }))
            })
          }
          const recent = recentRows.filter((row) => !placed.has(row.key) && matches(row))
          if (recent.length) {
            out.push(h('div', { key: 'sect-recent', className: 'mg-sect' },
              h('b', null, t('group.recent')), h('span', { className: 'n' }, String(recent.length))))
            recent.forEach((row) => {
              placed.add(row.key)
              out.push(renderRow(row, { withMonogram: multiProvider, suffix: ':recent' }))
            })
          }
        }
        const rest = visible.filter((row) => !placed.has(row.key))
        if (rest.length) {
          out.push(h('div', { key: 'sect-all', className: 'mg-sect' },
            h('b', null, t('group.all')), h('span', { className: 'n' }, String(rest.length))))
          rest.forEach((row) => out.push(renderRow(row, { withMonogram: multiProvider && providerFilter === 'all' })))
        }
        return out
      })()

      const panelStyle = { width: '100%', maxHeight: pos ? pos.maxHeight : undefined }

      const compactPanel = h('div', {
          ref: panelRef,
          style: panelStyle,
          className: 'mg-pop',
          role: 'dialog',
          'aria-label': t('menu.aria'),
          tabIndex: -1,
          onKeyDown: onSearchKeyDown,
        },
        h('div', { className: 'mg-cmd-bar' },
          iconSearch(),
          h('input', {
            ref: searchRef,
            className: 'mg-search-input',
            type: 'search',
            value: query,
            placeholder: t('search.placeholder'),
            'aria-label': t('search.placeholder'),
            onChange: (event) => { setQuery(event.target.value); setActiveIndex(-1); setKeysActive(false) },
            onCompositionStart: () => {},
          }),
          query
            ? h('button', {
              type: 'button',
              className: 'mg-icon-btn',
              title: t('search.clear'),
              'aria-label': t('search.clear'),
              onClick: () => { setQuery(''); setActiveIndex(-1); setKeysActive(false); if (searchRef.current) searchRef.current.focus() },
            }, iconClose())
            : h('span', { className: 'mg-kbd', 'aria-hidden': 'true' }, 'ESC')),
        multiProvider
          ? h('div', { className: 'mg-chips' },
            h('div', { className: 'mg-chips-pin' },
              h('button', {
                type: 'button',
                className: 'mg-chip' + (providerFilter === 'all' ? ' is-on' : ''),
                onClick: () => { setProviderFilter('all'); setNavKey('all') },
              }, t('nav.all')),
              h('span', { className: 'mg-chips-divider', 'aria-hidden': 'true' })),
            h('div', { className: 'mg-chips-rail-wrap' },
              h('div', {
                ref: chipsRailRef,
                className: 'mg-chips-rail' + (railEdge !== 'middle' ? ' ' + railEdge : ''),
                onWheel: onChipsWheel,
                onScroll: syncRailFade,
              },
              providers.map((provider) => h('button', {
                key: 'chip:' + provider.id,
                type: 'button',
                className: 'mg-chip is-brand' + (providerFilter === provider.id ? ' is-on' : ''),
                style: { '--mg-brand': provider.brandColor },
                title: provider.name,
                onClick: (event) => {
                  setProviderFilter(provider.id)
                  setNavKey('all')
                  if (event.currentTarget && typeof event.currentTarget.scrollIntoView === 'function') {
                    event.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
                  }
                },
              },
              h('span', { className: 'mg-chip-dot', 'aria-hidden': 'true' }),
              provider.name)))))
          : null,
        h('div', { className: 'mg-scroll' },
          status === 'error' && state && state.error
            ? h('div', { className: 'mg-error', role: 'alert' }, tidyDetail(state.error),
              h('button', { type: 'button', onClick: () => load() }, t('action.retry')))
            : null,
          sections),
        h('div', { className: 'mg-foot' },
          effortSeg
            ? h('div', { className: 'mg-foot-left' }, effortSeg)
            : h('span', { className: 'mg-foot-count' }, t('count.available', { count: rows.length })),
          h('button', {
            type: 'button',
            className: 'mg-more',
            title: t('action.expandTitle'),
            'aria-label': t('action.expandTitle'),
            onClick: expandPanel,
          }, t('action.expand'), iconArrowUpRight())),
        switchError
          ? h('div', { className: 'mg-foot-error', role: 'alert' }, iconAlert(), h('span', null, switchError.message))
          : null)

      const navItem = (key, label, count, iconNode) => h('button', {
        key: 'nav:' + key,
        type: 'button',
        className: 'mg-nav-item' + (navKey === key ? ' is-on' : ''),
        onClick: () => { setNavKey(key); setActiveIndex(-1); setKeysActive(false) },
      },
      iconNode,
      h('span', { className: 'mg-nav-label' }, label),
      h('span', { className: 'mg-nav-count' }, String(count)))

      const paneBody = (() => {
        if (status === 'loading' && !paneRows.length) {
          return h('div', { className: 'mg-status' }, h('span', { className: 'mg-spin' }), ' ', t('status.loading'))
        }
        if (!paneRows.length) {
          if (query.trim()) {
            return h('div', { className: 'mg-status' },
              h('div', null, t('status.empty')),
              h('button', {
                type: 'button',
                className: 'mg-status-reset',
                onClick: () => { setQuery(''); setActiveIndex(-1); setKeysActive(false) },
              }, t('search.clear')))
          }
          if (!rows.length) return h('div', { className: 'mg-status' }, t('status.emptyCatalog'))
          if (navKey === 'favorites') return h('div', { className: 'mg-status' }, t('status.emptyFavorites'))
          if (navKey === 'recent') return h('div', { className: 'mg-status' }, t('status.emptyRecent'))
          return h('div', { className: 'mg-status' }, t('status.empty'))
        }
        const isGrouped = navKey === 'all' || navKey.indexOf('provider:') === 0
        const out = []
        if (isGrouped) {
          let lastProvider = null
          for (const row of paneRows) {
            if (row.providerId !== lastProvider) {
              lastProvider = row.providerId
              out.push(h('div', { key: 'head:' + row.providerId, className: 'mg-group-head', style: { '--mg-brand': row.brandColor } },
                h('span', { className: 'mg-group-dot', 'aria-hidden': 'true' }),
                h('b', null, row.providerName)))
            }
            out.push(renderRow(row, { withDescription: true, withMonogram: false, withProvider: false }))
          }
        } else {
          for (const row of paneRows) {
            out.push(renderRow(row, { withDescription: true, withMonogram: multiProvider, withProvider: false }))
          }
        }
        return out
      })()

      const expandedPanel = h('div', {
          ref: panelRef,
          style: panelStyle,
          className: 'mg-pop mg-pane',
          role: 'dialog',
          'aria-label': t('menu.aria'),
          tabIndex: -1,
          onKeyDown: onSearchKeyDown,
        },
        h('div', { className: 'mg-cmd-bar' },
          iconSearch(),
          h('input', {
            ref: searchRef,
            className: 'mg-search-input',
            type: 'search',
            value: query,
            placeholder: t('search.placeholderWide'),
            'aria-label': t('search.placeholderWide'),
            onChange: (event) => { setQuery(event.target.value); setActiveIndex(-1); setKeysActive(false) },
            onCompositionStart: () => {},
          }),
          query
            ? h('button', {
              type: 'button',
              className: 'mg-icon-btn',
              title: t('search.clear'),
              'aria-label': t('search.clear'),
              onClick: () => { setQuery(''); setActiveIndex(-1); setKeysActive(false); if (searchRef.current) searchRef.current.focus() },
            }, iconClose())
            : null,
          h('span', { className: 'mg-head-divider', 'aria-hidden': 'true' }),
          h('span', { className: 'mg-head-actions' },
            h('button', { type: 'button', className: 'mg-icon-btn', title: t('action.collapse'), 'aria-label': t('action.collapse'), onClick: collapsePanel }, iconCollapse()),
            h('button', { type: 'button', className: 'mg-icon-btn', title: t('action.close'), 'aria-label': t('action.close'), onClick: () => { close() } }, iconClose()))),
        h('div', { className: 'mg-body' },
          h('div', { className: 'mg-nav' },
            navItem('all', t('nav.all'), rows.length, iconGrid()),
            navItem('favorites', t('nav.favorites'), favoriteRows.length, h('span', { className: 'mg-nav-ico' }, iconStar(false))),
            navItem('recent', t('nav.recent'), recentRows.length, iconClock()),
            h('div', { key: 'nav-sep', className: 'mg-nav-sep' }),
            h('div', { key: 'nav-head', className: 'mg-nav-head' }, t('nav.providers')),
            providers.map((provider) => navItem(
              'provider:' + provider.id,
              provider.name,
              provider.count,
              h('span', { className: 'mg-monogram', style: { '--mg-brand': provider.brandColor }, title: provider.name }, provider.monogram),
            ))),
          h('div', { className: 'mg-list' },
            h('div', { className: 'mg-list-scroll' },
              status === 'error' && state && state.error
                ? h('div', { className: 'mg-error', role: 'alert' }, tidyDetail(state.error),
                  h('button', { type: 'button', onClick: () => load() }, t('action.retry')))
                : null,
              paneBody))),
        h('div', { className: 'mg-foot' },
          h('div', { className: 'mg-foot-left' },
            currentRow
              ? h(React.Fragment, null,
                h('span', { className: 'mg-foot-cur' }, t('current.label')),
                h('span', { className: 'mg-monogram', style: { '--mg-brand': currentRow.brandColor }, title: currentRow.providerName }, currentRow.monogram),
                h('span', { className: 'mg-foot-cur' }, h('b', null, currentRow.name)))
              : h('span', { className: 'mg-foot-count' }, t('count.available', { count: rows.length }))),
          h('div', { className: 'mg-foot-right' },
            effortSeg ? h('span', { className: 'mg-foot-label' }, t('effort.label')) : null,
            effortSeg || h('span', { className: 'mg-foot-note' }, t('effort.none')))),
        switchError
          ? h('div', { className: 'mg-foot-error', role: 'alert' }, iconAlert(), h('span', null, switchError.message))
          : null)

      const panel = h('div', {
        className: 'mg-panel-host',
        style: pos
          ? { position: 'fixed', left: pos.left, top: pos.top, width: pos.width, display: 'flex', flexDirection: 'column', zIndex: 2147483000 }
          : { position: 'fixed', left: -9999, top: 0, width: expanded ? 720 : 356, visibility: 'hidden' },
      }, expanded ? expandedPanel : compactPanel)

      const triggerContent = [
        multiProvider && currentRow ? h('span', { key: 'dot', className: 'mg-trigger-dot', style: { '--mg-brand': currentRow.brandColor }, 'aria-hidden': 'true' }) : null,
        h('span', { key: 'name', className: 'mg-trigger-name' }, triggerLabel),
        effortName && reasoning ? h('span', { key: 'effort', className: 'mg-trigger-effort' }, iconSpark(), effortName) : null,
        busy ? h('span', { key: 'spin', className: 'mg-spin' }) : h('span', { key: 'chevron', style: { display: 'flex' } }, iconChevron()),
      ]

      return h(React.Fragment, null,
        h('style', { key: 'mg-css' }, CSS),
        h('button', {
          key: 'trigger',
          ref: rootRef,
          type: 'button',
          className: 'mg-trigger',
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          'aria-busy': busy ? 'true' : undefined,
          'aria-label': currentRow ? t('trigger.aria', { model: currentRow.name }) : t('trigger.ariaEmpty'),
          title: currentRow ? currentRow.name + (effortName && reasoning ? ' · ' + t('effort.label') + ' ' + effortName : '') : t('trigger.placeholder'),
          disabled: Boolean(locked) || !available,
          onClick: () => { if (open) close(); else openPanel() },
        }, triggerContent),
        open ? createPortal(panel, document.body) : null)
    }

    // ------------------------------------------------------------------ plugin

    const SUPPORTED = 'conversation.input.model'

    // Another plugin can take the same single seat. That is not something to
    // arbitrate: never steal the seat and never disable the other plugin.
    function hasForeignOccupant(slots) {
      try {
        if (!slots || typeof slots.entries !== 'function') return false
        const entries = slots.entries(SUPPORTED) || []
        for (const entry of entries) {
          const module = entry && (entry.module || entry.registrant)
          if (!module) continue
          const name = String(module)
          if (name.indexOf('@deepseek-ai/') === 0) continue
          if (name.indexOf('model-lifecycle') !== -1) continue
          if (name.indexOf('dsh-model-glance') !== -1) continue
          return true
        }
        return false
      } catch (error) {
        // An unknown slot API shape is treated as "someone else may be there".
        return true
      }
    }

    const plugin = {
      inject: ['locale', 'slots'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { zh, en }),
          'model-glance: dictionaries',
        )

        ctx.inject(['slots', 'modelDirectories', 'sessions'], (scope) => {
          if (hasForeignOccupant(scope.slots)) {
            console.warn(
              'model-glance: the conversation model seat is occupied by another plugin; ' +
              'ModelGlance stays out of the way and does not take the seat.',
            )
            return
          }
          scope.slots.inject(SUPPORTED, () => scope.slots.register({
            name: SUPPORTED,
            locale: NS,
            // The shipped entry registers at 0 inside this single slot; a lower
            // priority wins deterministically instead of relying on load order.
            priority: -1,
            inject: (sessionId) => {
              const directory = scope.modelDirectories.directoryFor(sessionId)
              const available = scope.sessions.subagentAddress(sessionId) === undefined
              return {
                available,
                directory: directory.store,
                load: () => { if (available) directory.load().catch(() => {}) },
                resolveText: (text) => (ctx.locale && ctx.locale.resolveText ? ctx.locale.resolveText(text) : text),
                select: (selection) => (available ? directory.select(selection) : Promise.resolve(undefined)),
              }
            },
          }, ModelGlance))
        })
      },
    }

    return plugin
  },
})
