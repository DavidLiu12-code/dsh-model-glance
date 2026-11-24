# Test suites

Two layers: one offscreen suite that needs no running app, and three browser suites that
drive an **isolated** DSH profile.

Nothing here touches your everyday profile, your credentials or your conversations. The
browser suites are pointed at a local URL you start yourself (`MG_APP_URL`).

## Shared resolution — `host.mjs`

The tests borrow React and Playwright from a host module table rather than shipping them.
`requireHost(name)` walks a list of candidates (repo `node_modules`, `DSH_PROFILE_DIR`,
`$DSH_HOME/profiles`, the Desktop profile) and returns the first that can resolve the name.
Override with `MG_HOST_MODULES=/absolute/path/to/node_modules`.

`APP_URL` defaults to `http://127.0.0.1:5199`; override with `MG_APP_URL`.

## `smoke.mjs` — offscreen (4 checks)

Fake module loader, fake DOM, fake `localStorage`, fake slots and locale; the real
`client.js` source is executed with `new Function`, and the component is rendered with
React's server renderer.

Proves: the loader contract (`window.__ModuleLoader__.load`), exactly one locale
registration and one injection, the slot name and seat surface, the rendered trigger in
four cases (current model with effort, no effort, empty catalog, no reasoning), and that a
foreign occupant makes the plugin register **nothing** while warning once.

```sh
node tests/smoke.mjs
```

It does not prove the in-app visual result — that is what the browser suites are for.

## Browser suites

Start an isolated profile first:

```sh
set DSH_HOME=D:\path\to\.test-home
dsh --profile modelglance-test --port 5199
```

`e2e.mjs` (30 checks) covers behaviour and layout: compact switch closes, expanded switch
stays open, effort switching, search and its empty state, Esc with focus return, `↑`/`↓` +
`Enter`, favourite persistence across reload, click-outside close, dark theme, and the panel
fitting at 1024×640 / 853×533 / 720×800 with no horizontal overflow.

`failure.mjs` (8 checks) aborts and rejects `session.selectModel` at the transport level:
the previous model survives, the panel stays open, an error line appears, exactly one row
is still marked selected, and an IME `Enter` (`isComposing` + `keyCode 229`) neither
switches nor closes.

`catalog.mjs` (14 checks) intercepts the catalog response and injects 30 models across two
providers, a very long name and a model without reasoning: rows render, long names truncate
with a full-name tooltip, no effort control appears for the reasoning-less model, the list
scrolls, group headers and provider navigation list what they count, and a provider chosen
via a compact chip does **not** filter the expanded panel.

```sh
node tests/e2e.mjs
node tests/failure.mjs
node tests/catalog.mjs
```

They launch the system Chrome (`chromium.launch({ channel: 'chrome' })`) because the pinned
Playwright build may not have its own browser downloaded.

## Screenshots

The browser suites write to `tests/shots/`, which is git-ignored. Do not commit them —
they can contain your workspace names and conversation snippets.
