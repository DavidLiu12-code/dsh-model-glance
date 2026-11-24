// Smoke test for the ModelGlance client half.
// Runs OUTSIDE the app, with a fake host: fake module table, fake slots,
// fake model directory, fake locale. No network, no profile, no real keys.
import { requireHost } from './host.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const React = requireHost('react')
const { renderToStaticMarkup } = requireHost('react-dom/server')

const here = path.dirname(fileURLToPath(import.meta.url))
const clientPath = path.join(here, '..', 'client.js')

// ---------------------------------------------------------------- fake host

const fakeDocument = {
  nodeType: 9,
  body: { appendChild() {}, removeChild() {}, contains() { return false } },
  createElement() { return { style: {}, setAttribute() {}, appendChild() {} } },
  head: { appendChild() {}, removeChild() {} },
  addEventListener() {},
  removeEventListener() {},
  activeElement: null,
}

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  innerWidth: 1280,
  innerHeight: 800,
  localStorage: (() => {
    const map = new Map()
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
    }
  })(),
  __ModuleLoader__: { load(definition) { globalThis.__captured = definition } },
}
globalThis.document = fakeDocument
globalThis.console.warn = (...args) => { globalThis.__warnings = (globalThis.__warnings || []).concat([args.join(' ')]) }

const requireStub = (name) => {
  if (name === 'react') return React
  if (name === 'react-dom') {
    return { createPortal: (children) => children }
  }
  if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
  throw new Error('unexpected require: ' + name)
}

// ------------------------------------------------------------------- load

const source = readFileSync(clientPath, 'utf8')
// The file is a classic script that registers itself on the loader; evaluating
// it directly keeps the same code path the host uses.
new Function('window', 'document', 'require', source)(globalThis.window, fakeDocument, requireStub)

const definition = globalThis.__captured
assert(definition, 'client.js did not call __ModuleLoader__.load')
assert(definition.id === 'dsh-model-glance', 'loader id must be the package name, got ' + definition.id)

const moduleExports = definition.factory(requireStub)
assert(Array.isArray(moduleExports.inject), 'module must declare inject')
assert(moduleExports.inject.includes('slots'), 'module must inject slots')
assert(typeof moduleExports.apply === 'function', 'module must export apply')

// ------------------------------------------------------------- fake context

const groups = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', description: 'Fast general model', reasoning: { defaultEffort: 'high', efforts: [{ id: 'low', name: '低' }, { id: 'medium', name: '中' }, { id: 'high', name: '高' }] } },
      { id: 'deepseek-v4.1', name: 'DeepSeek V4.1', description: 'Deeper reasoning', reasoning: { defaultEffort: 'medium', efforts: [{ id: 'low', name: '低' }, { id: 'medium', name: '中' }, { id: 'high', name: '高' }] } },
      { id: 'deepseek-r1', name: 'DeepSeek R1', description: 'Reasoning first' },
    ],
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    models: [
      { id: 'glm-4.6', name: 'GLM-4.6', description: 'Chinese optimized' },
      { id: 'glm-4.5-air', name: 'GLM-4.5-Air', description: 'Lightweight' },
    ],
  },
]

const state = {
  current: { provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
  routable: true,
  groups,
  failures: [],
  status: 'ready',
  pending: null,
  error: null,
}

let selectCalls = []
let selectResult = { ok: true }

const subscribers = new Set()
const directory = {
  store: {
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn) },
    getSnapshot() { return state },
  },
  load() {},
  select(selection) { selectCalls.push(selection); return Promise.resolve(selectResult) },
}

const captured = { locale: [], injections: [], registered: [] }

const ctx = {
  effect(fn) { const dispose = fn(); return () => { if (typeof dispose === 'function') dispose() } },
  locale: {
    register(namespace, dictionaries) { captured.locale.push({ namespace, dictionaries }); return () => {} },
    resolveText: (text) => text,
  },
  inject(dependencies, callback) {
    captured.injections.push(dependencies)
    const scope = {
      slots: {
        entries: () => [{ module: '@deepseek-ai/dsh-client-ui-model-selection', registrant: 'model-selection' }],
        inject(key, factoryFn) { captured.injectedKey = key; captured.factory = factoryFn; return () => {} },
        register(options, component) {
          captured.registered.push({ options, component })
          return () => {}
        },
      },
      modelDirectories: { directoryFor(sessionId) { return directory } },
      sessions: { subagentAddress: () => undefined },
    }
    return callback(scope)
  },
}

moduleExports.apply(ctx)

assert(captured.locale.length === 1, 'expected exactly one locale registration')
assert(captured.locale[0].namespace === 'modelGlance', 'locale namespace must be modelGlance')
const dictionaries = captured.locale[0].dictionaries
assert(dictionaries.zh && dictionaries.en, 'both zh and en dictionaries must be registered')
for (const key of Object.keys(dictionaries.zh)) {
  assert(key in dictionaries.en, 'missing en translation for ' + key)
}
assert(captured.injections.length === 1, 'expected one ctx.inject call')
assert(String(captured.injectedKey) === 'conversation.input.model', 'must register into the model seat, got ' + captured.injectedKey)
// slots.inject() takes a lazy factory: the host calls it when the slot is declared.
assert(typeof captured.factory === 'function', 'seat injection must be lazy (factory)')
captured.factory()
const registration = captured.registered[0].options
assert(registration.name === 'conversation.input.model', 'slot name mismatch')
assert(registration.locale === 'modelGlance', 'slot must bind its locale namespace')
assert(typeof registration.inject === 'function', 'seat needs an inject face')

const seat = registration.inject('session-1')
assert(seat.available === true, 'seat should be available in a normal session')
assert(typeof seat.load === 'function' && typeof seat.select === 'function', 'seat face incomplete')
assert(seat.directory && typeof seat.directory.getSnapshot === 'function', 'seat must expose the directory store')

// --------------------------------------------------------------- rendering

const Component = captured.registered[0].component
const t = (key, vars) => {
  const template = dictionaries.zh[key] !== undefined ? dictionaries.zh[key] : key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] === undefined ? '{' + name + '}' : String(vars[name])))
}

const markup = renderToStaticMarkup(
  React.createElement(Component, { locked: false, ...seat, t, renderSlot: () => null }),
)
assert(markup.includes('DeepSeek V4.1 Flash'), 'trigger should show the current model name')
assert(markup.includes('高'), 'trigger should show the current effort name')
assert(markup.includes('mg-trigger'), 'trigger class missing')

// no reasoning metadata -> no effort pill, no effort row
const stateNoReasoning = {
  ...state,
  current: { provider: 'glm', model: 'glm-4.6' },
}
const directoryNoReasoning = {
  store: { subscribe: () => () => {}, getSnapshot: () => stateNoReasoning },
  load() {},
  select() { return Promise.resolve({ ok: true }) },
}
const registration2 = captured.registered[0].options
const seat2 = registration2.inject('session-2')
const markup2 = renderToStaticMarkup(React.createElement(Component, {
  locked: false,
  ...seat2,
  directory: directoryNoReasoning.store,
  t,
  renderSlot: () => null,
}))
assert(markup2.includes('GLM-4.6'), 'trigger should show GLM-4.6')
assert(!markup2.includes('class="mg-trigger-effort"'), 'a model without reasoning must not show an effort pill')

// empty catalog
const emptyDirectory = {
  store: { subscribe: () => () => {}, getSnapshot: () => ({ ...state, groups: [], current: null }) },
  load() {},
  select() { return Promise.resolve({ ok: true }) },
}
const markup3 = renderToStaticMarkup(React.createElement(Component, {
  locked: false,
  ...registration2.inject('session-3'),
  directory: emptyDirectory.store,
  t,
  renderSlot: () => null,
}))
assert(markup3.includes('选择模型'), 'empty catalog should show the placeholder label')

// --------------------------------------------------------------- conflict

const conflictCaptured = { injected: false }
captured.injectedKey = undefined
const ctxConflict = {
  effect(fn) { fn(); return () => {} },
  locale: { register: () => () => {}, resolveText: (text) => text },
  inject(dependencies, callback) {
    return callback({
      slots: {
        entries: () => [{ module: 'some-other-model-picker' }],
        inject() { conflictCaptured.injected = true },
        register() { conflictCaptured.injected = true },
      },
      modelDirectories: { directoryFor: () => directory },
      sessions: { subagentAddress: () => undefined },
    })
  },
}
moduleExports.apply(ctxConflict)
assert(conflictCaptured.injected === false, 'must not take the seat when another plugin occupies it')
assert((globalThis.__warnings || []).some((line) => line.includes('occupied')), 'should warn once about the conflict')

// ------------------------------------------------------------------ report

console.log('OK locales:', Object.keys(dictionaries).join(','), '| keys:', Object.keys(dictionaries.zh).length)
console.log('OK slot:', registration.name, '| checks:', markup.includes('mg-trigger-name'))
console.log('OK render: trigger/effort/no-effort/empty paths')
console.log('OK conflict: seat not taken, warning emitted')
console.log('NOTE: this is a static/host-fake smoke test; it does not prove the in-app visual result.')

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message)
    process.exit(1)
  }
}
