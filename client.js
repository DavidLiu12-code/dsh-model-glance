// ModelGlance — client half.
// A refined, lightweight model picker for DeepSeek Harness.
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
      'search.placeholder': '搜索模型',
      'search.placeholderWide': '搜索模型或提供商',
      'search.clear': '清除搜索',
      'group.favorites': '我的收藏',
      'group.recent': '最近使用',
      'group.all': '全部模型',
      'nav.all': '全部模型',
      'nav.favorites': '我的收藏',
      'nav.recent': '最近使用',
      'nav.providers': '按提供商',
      'effort.label': '推理强度',
      'effort.note': '档位越高，思考越久',
      'effort.default': 'Default',
      'current.label': '当前',
      'action.expand': '展开全部模型',
      'action.collapse': '收起',
      'action.close': '关闭',
      'action.retry': '重试',
      'action.reload': '重新加载',
      'status.loading': '正在加载模型…',
      'status.empty': '没有匹配的模型',
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
      'search.placeholder': 'Search models',
      'search.placeholderWide': 'Search models or providers',
      'search.clear': 'Clear search',
      'group.favorites': 'Favorites',
      'group.recent': 'Recent',
      'group.all': 'All models',
      'nav.all': 'All models',
      'nav.favorites': 'Favorites',
      'nav.recent': 'Recent',
      'nav.providers': 'By provider',
      'effort.label': 'Effort',
      'effort.note': 'Higher means longer thinking',
      'effort.default': 'Default',
      'current.label': 'Current',
      'action.expand': 'Browse all models',
      'action.collapse': 'Collapse',
      'action.close': 'Close',
      'action.retry': 'Retry',
      'action.reload': 'Reload',
      'status.loading': 'Loading models…',
      'status.empty': 'No matching model',
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

    // The host can carry a verbose error payload; keep one readable line.
    function tidyDetail(value) {
      const text = typeof value === 'string' ? value : String(value === undefined ? '' : value)
      const flat = text.replace(/\s+/g, ' ').trim()
      return flat.length > 160 ? flat.slice(0, 160) + '...' : flat
    }

    // ----------------------------------------------------------------- icons

    const svg = (props, children) =>
      h('svg', Object.assign({ viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' }, props), children)

    const iconChevron = () =>
      svg({ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, className: 'mg-chevron' },
        h('path', { d: 'M4 6.5 8 10.5 12 6.5', strokeLinecap: 'round', strokeLinejoin: 'round' }))

    const iconCheck = () =>
      svg({ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 },
        h('path', { d: 'M3 8.5 6.2 11.6 13 4.6', strokeLinecap: 'round', strokeLinejoin: 'round' }))

    const iconStar = (filled) =>
      svg({ width: 13, height: 13, fill: filled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' },
        h('path', { d: 'M8 2.2 9.7 5.9 13.7 6.4 10.8 9.2 11.6 13.1 8 11.1 4.4 13.1 5.2 9.2 2.3 6.4 6.3 5.9Z' }))

    const iconClose = () =>
      svg({ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
        h('path', { d: 'M4 4 12 12M12 4 4 12', strokeLinecap: 'round' }))

    const iconCollapse = () =>
      svg({ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
        h('path', { d: 'M4 9.5 8 5.5 12 9.5', strokeLinecap: 'round', strokeLinejoin: 'round' }))

    const iconArrowRight = () =>
      svg({ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
        h('path', { d: 'M6 4 10 8 6 12', strokeLinecap: 'round', strokeLinejoin: 'round' }))

    const iconSearch = () =>
      svg({ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, className: 'mg-search-icon' },
        h('circle', { cx: 7, cy: 7, r: 4.2 }),
        h('path', { d: 'M10.2 10.2 13.4 13.4', strokeLinecap: 'round' }))

    // Corner arrow pair: a second way to open the full list, without repeating
    // the words that already sit in the compact body.
    const iconExpand = () =>
      svg({ width: 14, height: 14, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M4.6 2.8H2.6v2' }),
        h('path', { d: 'M2.8 2.8 5.4 5.4' }),
        h('path', { d: 'M7.4 9.2h2v-2' }),
        h('path', { d: 'M9.2 9.2 6.6 6.6' }))

    // ------------------------------------------------------------------- CSS

    const CSS = `
.mg-trigger{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;height:26px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1;cursor:pointer}
.mg-trigger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)}
.mg-trigger:disabled{opacity:.55;cursor:default}
.mg-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mg-trigger-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
.mg-trigger-effort{flex:none;display:inline-flex;align-items:center;height:20px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:500;line-height:1}
.mg-trigger:hover:not(:disabled) .mg-trigger-effort{border-color:var(--dsw-alias-label-secondary);color:var(--dsw-alias-label-primary)}
.mg-chevron{flex:none;color:var(--dsw-alias-label-secondary)}
.mg-pop{--mg-line:color-mix(in srgb,var(--dsw-alias-label-primary) 9%,transparent);position:relative;min-height:0;z-index:2147483000;display:flex;flex-direction:column;box-sizing:border-box;border:1px solid var(--mg-line);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 12px 32px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.06);font-size:13px;line-height:1.45;text-align:left}
.mg-pop *{box-sizing:border-box}
.mg-top{display:grid;gap:6px;padding:10px 10px 9px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 2.5%,transparent);border-bottom:1px solid var(--mg-line)}
.mg-search{display:flex;align-items:center;gap:6px;height:30px;padding:0 8px;border:1px solid var(--mg-line);border-radius:6px;background:var(--dsw-alias-bg-base);box-shadow:0 1px 1px rgba(15,18,24,.03)}
.mg-search-icon{flex:none;opacity:.8}
.mg-search:focus-within{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent)}
.mg-pop input.mg-search-input{flex:1 1 auto;min-width:0;height:24px;padding:0;margin:0;border:0;border-radius:0;background:transparent;box-shadow:none;appearance:none;-webkit-appearance:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:24px;outline:none}
.mg-pop input.mg-search-input::-webkit-search-cancel-button{display:none}
.mg-pop input.mg-search-input::placeholder{color:var(--dsw-alias-label-secondary)}
.mg-chips{display:flex;align-items:center;flex-wrap:wrap;gap:4px;padding:0 0}
.mg-chip{flex:none;height:24px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:24px;cursor:pointer;white-space:nowrap}
.mg-chip:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);color:var(--dsw-alias-label-primary)}
.mg-chip.is-on{background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);color:var(--dsw-alias-label-primary);font-weight:500}
.mg-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mg-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 4px 6px}
.mg-sect{display:flex;align-items:center;gap:6px;padding:12px 8px 5px;color:var(--dsw-alias-label-secondary);font-size:11px;letter-spacing:.01em}
.mg-scroll>.mg-sect:first-child{padding-top:8px}
.mg-sect b{font-weight:500}
.mg-sect .n{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.mg-row{position:relative;display:flex;align-items:center;gap:8px;height:32px;padding:0 6px 0 10px;border-radius:6px;cursor:pointer;box-sizing:border-box}
.mg-row:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent)}
.mg-row.is-active{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)}
.mg-row[aria-selected="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 6%,transparent)}
.mg-row[aria-selected="true"]:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent)}
.mg-row[aria-selected="true"]::before{content:"";position:absolute;left:2px;top:50%;transform:translateY(-50%);width:2px;height:16px;border-radius:1px;background:var(--dsw-alias-brand-primary)}
.mg-row[aria-selected="true"] .mg-name{font-weight:500}
.mg-check{flex:none;width:14px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-brand-primary)}
.mg-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-star{flex:none;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:.7}
.mg-row:hover .mg-star,.mg-star.is-on{opacity:1}
.mg-star:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)}
.mg-star.is-on{color:var(--dsw-alias-warn-primary,#d99a2b)}
.mg-star:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mg-sep{height:1px;margin:4px 0;background:var(--dsw-alias-border-l2)}
.mg-more{display:flex;align-items:center;gap:6px;width:100%;height:34px;margin:2px 0 4px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;text-align:left}
.mg-more svg{flex:none;margin-left:auto}
.mg-more:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);color:var(--dsw-alias-label-primary)}
.mg-foot{flex:none;display:flex;align-items:center;gap:8px;padding:9px 12px;border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}
.mg-foot-label{color:var(--dsw-alias-label-secondary);font-size:11.5px;letter-spacing:.01em}
.mg-foot-label.is-right{margin-left:auto}
.mg-foot-label:first-child{margin-right:auto}
.mg-foot-cur{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11.5px}
.mg-foot-cur b{font-weight:500;color:var(--dsw-alias-label-primary)}
.mg-foot-note{color:var(--dsw-alias-label-secondary);font-size:11px;margin-left:auto}
.mg-foot-more{flex:none;display:flex;align-items:center;justify-content:center;margin-left:auto;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.mg-foot-more svg{flex:none}
.mg-foot-more:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-primary)}
.mg-foot-more:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mg-seg{display:inline-flex;align-items:center;gap:1px;padding:2px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)}
.mg-seg button{height:24px;min-width:34px;padding:0 8px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}
.mg-seg button:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.mg-seg button.is-on{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 1px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent),0 1px 2px rgba(0,0,0,.10)}
.mg-seg button:disabled{opacity:.5;cursor:default}
.mg-seg button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mg-status{padding:14px 10px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6;text-align:center}
.mg-spin{display:inline-block;width:12px;height:12px;border:1.5px solid color-mix(in srgb,var(--dsw-alias-label-secondary) 45%,transparent);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;flex:none;animation:mg-spin .7s linear infinite}
@keyframes mg-spin{to{transform:rotate(360deg)}}
.mg-error{display:flex;align-items:center;gap:8px;margin:6px 10px 8px;padding:8px 10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 26%,transparent);border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px}
.mg-error button{margin-left:auto;height:24px;padding:0 8px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;font:inherit;font-size:11px;cursor:pointer}
.mg-foot-error{padding:6px 12px;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-state-error-primary);font-size:11px}
.mg-pane{width:100%}
.mg-head{flex:none;display:flex;align-items:center;gap:8px;height:44px;padding:0 10px 0 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.mg-head-title{font-size:13px;font-weight:600;letter-spacing:-.01em}
.mg-head-actions{margin-left:auto;display:flex;align-items:center;gap:4px}
.mg-icon-btn{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.mg-icon-btn:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-primary)}
.mg-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.mg-body{flex:1;min-height:0;display:flex}
.mg-nav{flex:none;width:184px;padding:8px 0;border-right:1px solid var(--dsw-alias-border-l1);overflow-y:auto}
.mg-nav-item{display:flex;align-items:center;gap:6px;width:calc(100% - 8px);margin:0 4px;height:32px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;text-align:left}
.mg-nav-item:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent)}
.mg-nav-item.is-on{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent)}
.mg-nav-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.mg-nav-count{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums}
.mg-nav-sep{height:1px;margin:8px 12px;background:var(--dsw-alias-border-l2)}
.mg-nav-head{padding:12px 12px 5px;color:var(--dsw-alias-label-secondary);font-size:11px;letter-spacing:.02em}
.mg-list{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}
.mg-pane-search{flex:none;padding:12px 14px 8px}
.mg-list-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 8px 8px}
.mg-group-head{position:sticky;top:0;z-index:1;padding:12px 8px 5px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-size:11px;letter-spacing:.01em}
.mg-group-head:first-child{padding-top:4px}
.mg-pane .mg-row{height:36px}
.mg-pane .mg-row[aria-selected="true"]::before{left:3px;height:18px}
.mg-pane .mg-name{font-size:13px}
.mg-desc{flex:0 1 auto;min-width:0;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:var(--dsw-alias-label-secondary);font-size:11px;max-width:220px}
.mg-prov{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;min-width:84px;text-align:right}
.mg-tag{flex:none;display:inline-flex;align-items:center;justify-content:center;height:20px;min-width:30px;padding:0 6px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-label-primary);font-size:11px;line-height:1;font-variant-numeric:tabular-nums}
@media (prefers-color-scheme: dark){.mg-pop{box-shadow:0 18px 44px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.05)}}
.mg-row,.mg-chip,.mg-nav-item,.mg-more,.mg-seg button,.mg-star,.mg-trigger,.mg-icon-btn{transition:background-color 80ms linear,color 80ms linear,border-color 80ms linear}
@media (prefers-reduced-motion: no-preference){.mg-pop{animation:mg-in .12s cubic-bezier(.2,.8,.2,1)}}
@keyframes mg-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.mg-pop{animation:none}.mg-spin{animation:none}}
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

      const rootRef = useRef(null)
      const panelRef = useRef(null)
      const searchRef = useRef(null)

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
          for (const model of group.models || []) {
            list.push({
              key: rowKey(group.id, model.id),
              providerId: group.id,
              providerName,
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

      // The compact chip row is a compact-surface control. Expanding must not
      // keep a provider hidden behind a chip the expanded panel cannot show.
      const scoped = useMemo(() => {
        if (expanded || providerFilter === 'all') return rows
        return rows.filter((row) => row.providerId === providerFilter)
      }, [rows, expanded, providerFilter])
      const visible = useMemo(() => scoped.filter(matches), [scoped, matches])

      const providers = useMemo(() => {
        const seen = new Map()
        for (const group of groups) {
          if (!seen.has(group.id)) {
            seen.set(group.id, {
              id: group.id,
              name: group.id === 'deepseek-account' ? t('provider.account') : group.name,
              count: rows.filter((row) => row.providerId === group.id).length,
            })
          }
        }
        return Array.from(seen.values())
      }, [groups, rows, t])

      // Left navigation always answers from the full catalog; a navigation entry
      // that announces 29 models must be able to show those 29 rows.
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

      // The design always shows the search field in the compact popover: the
      // panel keeps one stable structure whether the catalog is short or long.
      const showSearch = true
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
        const width = Math.min(expanded ? 760 : 340, viewportWidth - 24)
        const gap = 8
        const roomAbove = rect.top - gap - 12
        const roomBelow = viewportHeight - rect.bottom - gap - 12
        const maxHeight = Math.max(160, Math.min(expanded ? 560 : 480, Math.max(roomAbove, roomBelow)))
        const measured = panel ? panel.getBoundingClientRect().height : 0
        const height = Math.min(measured > 0 ? measured : maxHeight, maxHeight)
        let left = rect.right - width
        left = Math.max(12, Math.min(left, viewportWidth - width - 12))
        let top = rect.top - gap - height
        if (top < 12) top = Math.min(rect.bottom + gap, viewportHeight - height - 12)
        top = Math.max(12, top)
        setPos((previous) => {
          if (previous && previous.left === left && previous.top === top && previous.width === width && previous.maxHeight === maxHeight) return previous
          return { left, top, width, maxHeight }
        })
      }, [expanded])

      useLayoutEffect(() => {
        if (!open) {
          setPos(null)
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

      // Focus: the search field when it exists, the panel otherwise, so the
      // keyboard handler is always reachable without a mouse.
      useEffect(() => {
        // Wait for the measured position: until `pos` exists the panel is
        // rendered hidden, and a hidden element cannot take focus.
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
            const next = (start + delta + keyboardRows.length) % keyboardRows.length
            return next
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

      const renderRow = (row, index, options) => {
        const selected = row.key === currentKey
        const favorited = favoriteSet.has(row.key)
        const showEffortTag = options.withEffort && selected && effortName
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
        h('span', { className: 'mg-check' }, selected ? iconCheck() : null),
        h('span', { className: 'mg-name', title: row.name }, row.name),
        options.withDescription && row.description ? h('span', { className: 'mg-desc' }, row.description) : null,
        options.withProvider ? h('span', { className: 'mg-prov' }, row.providerName) : null,
        showEffortTag ? h('span', { className: 'mg-tag' }, effortName) : null,
        h('button', {
          type: 'button',
          className: 'mg-star' + (favorited ? ' is-on' : ''),
          title: t('group.favorites'),
          'aria-label': t('group.favorites'),
          'aria-pressed': favorited ? 'true' : 'false',
          onClick: (event) => { event.stopPropagation(); toggleFavorite(row.key) },
        }, iconStar(favorited)))
      }

      const effortSeg = showEfforts
        ? h('span', { className: 'mg-seg', role: 'group', 'aria-label': t('effort.label') },
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
        const out = []
        // A model shown under 我的收藏 / 最近使用 must not be repeated again in
        // the full list below, otherwise the same row appears twice and both
        // copies look selected at the same time.
        const placed = new Set()
        if (providerFilter === 'all') {
          const favorites = favoriteRows.filter(matches)
          if (favoriteRows.length && favorites.length) {
            out.push(h('div', { key: 'sect-fav', className: 'mg-sect' },
              h('b', null, t('group.favorites')), h('span', { className: 'n' }, String(favoriteRows.length))))
            favorites.forEach((row) => {
              placed.add(row.key)
              out.push(renderRow(row, -1, { withProvider: true, suffix: ':fav' }))
            })
          }
          const recent = recentRows.filter(matches)
          if (recent.length) {
            out.push(h('div', { key: 'sect-recent', className: 'mg-sect' },
              h('b', null, t('group.recent')), h('span', { className: 'n' }, String(recent.length))))
            recent.forEach((row) => {
              placed.add(row.key)
              out.push(renderRow(row, -1, { withProvider: true, suffix: ':recent' }))
            })
          }
        }
        const rest = visible.filter((row) => !placed.has(row.key))
        out.push(h('div', { key: 'sect-all', className: 'mg-sect' },
          h('b', null, t('group.all')), h('span', { className: 'n' }, String(rest.length))))
        rest.forEach((row, index) => out.push(renderRow(row, index, { withProvider: true })))
        return out
      })()

      const compactBody = sections && sections.length
        ? sections
        : [h('div', { key: 'empty', className: 'mg-status' }, t('status.empty'))]

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
        h('div', { className: 'mg-top' },
          showSearch
            ? h('div', { className: 'mg-search' },
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
              }))
            : null,
          h('div', { className: 'mg-chips' },
            h('button', {
              type: 'button',
              className: 'mg-chip' + (providerFilter === 'all' ? ' is-on' : ''),
              onClick: () => { setProviderFilter('all'); setNavKey('all') },
            }, t('nav.all')),
            providers.map((provider) => h('button', {
              key: 'chip:' + provider.id,
              type: 'button',
              className: 'mg-chip' + (providerFilter === provider.id ? ' is-on' : ''),
              onClick: () => { setProviderFilter(provider.id); setNavKey('all') },
            }, provider.name)))),
        h('div', { className: 'mg-scroll' }, compactBody),
        h('div', { className: 'mg-sep' }),
        h('button', { type: 'button', className: 'mg-more', onClick: expandPanel },
          t('action.expand'), iconArrowRight()),
        h('div', { className: 'mg-foot' },
          h('span', { className: 'mg-foot-label' }, t('effort.label')),
          effortSeg,
          h('button', {
            type: 'button',
            className: 'mg-foot-more',
            title: t('action.expand'),
            'aria-label': t('action.expand'),
            onClick: expandPanel,
          }, iconExpand())),
        switchError ? h('div', { className: 'mg-foot-error', role: 'alert' }, switchError.message) : null)

      const navItem = (key, label, count) => h('button', {
        key: 'nav:' + key,
        type: 'button',
        className: 'mg-nav-item' + (navKey === key ? ' is-on' : ''),
        onClick: () => { setNavKey(key); setActiveIndex(-1); setKeysActive(false) },
      },
      h('span', { className: 'mg-nav-label' }, label),
      h('span', { className: 'mg-nav-count' }, String(count)))

      const paneBody = (() => {
        if (status === 'loading' && !paneRows.length) {
          return h('div', { className: 'mg-status' }, h('span', { className: 'mg-spin' }), ' ', t('status.loading'))
        }
        if (!paneRows.length) {
          const hasCatalog = rows.length > 0
          return h('div', { className: 'mg-status' }, hasCatalog ? t('status.empty') : t('status.emptyCatalog'))
        }
        const out = []
        let lastProvider = null
        for (const row of paneRows) {
          if (row.providerId !== lastProvider) {
            lastProvider = row.providerId
            out.push(h('div', { key: 'head:' + row.providerId, className: 'mg-group-head' },
              h('b', null, row.providerName)))
          }
          out.push(renderRow(row, -1, { withDescription: true, withProvider: true }))
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
        h('div', { className: 'mg-head' },
          h('span', { className: 'mg-head-title' }, t('nav.all')),
          h('span', { className: 'mg-head-actions' },
            h('button', { type: 'button', className: 'mg-icon-btn', title: t('action.collapse'), 'aria-label': t('action.collapse'), onClick: collapsePanel }, iconCollapse()),
            h('button', { type: 'button', className: 'mg-icon-btn', title: t('action.close'), 'aria-label': t('action.close'), onClick: () => { close() } }, iconClose()))),
        h('div', { className: 'mg-body' },
          h('div', { className: 'mg-nav' },
            navItem('all', t('nav.all'), rows.length),
            navItem('favorites', t('nav.favorites'), favoriteRows.length),
            navItem('recent', t('nav.recent'), recentRows.length),
            h('div', { key: 'nav-sep', className: 'mg-nav-sep' }),
            h('div', { key: 'nav-head', className: 'mg-nav-head' }, t('nav.providers')),
            providers.map((provider) => navItem('provider:' + provider.id, provider.name, provider.count))),
          h('div', { className: 'mg-list' },
            h('div', { className: 'mg-pane-search' },
              h('div', { className: 'mg-search' },
                iconSearch(),
                h('input', {
                  ref: searchRef,
                  className: 'mg-search-input',
                  type: 'search',
                  value: query,
                  placeholder: t('search.placeholderWide'),
                  'aria-label': t('search.placeholderWide'),
                  onChange: (event) => { setQuery(event.target.value); setActiveIndex(-1); setKeysActive(false) },
                }))),
            h('div', { className: 'mg-list-scroll' },
              status === 'error' && state && state.error
                ? h('div', { className: 'mg-error', role: 'alert' }, tidyDetail(state.error),
                  h('button', { type: 'button', onClick: () => load() }, t('action.retry')))
                : null,
              paneBody),
            h('div', { className: 'mg-foot' },
              currentRow
                ? h('span', { className: 'mg-foot-cur' }, t('current.label') + ' ', h('b', null, currentRow.name))
                : null,
              effortSeg ? h('span', { className: 'mg-foot-label is-right' }, t('effort.label')) : null,
              effortSeg,
              h('span', { className: 'mg-foot-note' }, t('effort.note'))),
            switchError ? h('div', { className: 'mg-foot-error', role: 'alert' }, switchError.message) : null)))

      const panel = h('div', {
        className: 'mg-panel-host',
        style: pos
          ? { position: 'fixed', left: pos.left, top: pos.top, width: pos.width, display: 'flex', flexDirection: 'column', zIndex: 2147483000 }
          : { position: 'fixed', left: -9999, top: 0, width: expanded ? 760 : 340, visibility: 'hidden' },
      }, expanded ? expandedPanel : compactPanel)

      const triggerContent = [
        h('span', { key: 'name', className: 'mg-trigger-name' }, triggerLabel),
        effortName && reasoning ? h('span', { key: 'effort', className: 'mg-trigger-effort' }, effortName) : null,
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
          title: currentRow ? currentRow.name + ' · ' + t('effort.label') + ' ' + (effortName || '—') : t('trigger.placeholder'),
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
