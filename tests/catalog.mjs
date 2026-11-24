// Rich-catalog checks: long names, many models, a model without reasoning,
// providers, scrolling — injected by rewriting the host's session.models reply.
import { requireHost, APP_URL } from './host.mjs'

const { chromium } = requireHost('playwright')
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  -> ' + detail : ''))
}

const LONG = 'DeepSeek-Very-Long-Model-Name-That-Must-Be-Truncated-With-Ellipsis-2026-Edition'
const NO_REASONING = 'deepseek-v4-lite'

function findCatalog(node, path = '', depth = 0) {
  if (node === null || typeof node !== 'object' || depth > 6) return null
  if (Array.isArray(node.groups)) return { node, path }
  for (const key of Object.keys(node)) {
    const found = findCatalog(node[key], path + '.' + key, depth + 1)
    if (found) return found
  }
  return null
}

function enrich(json) {
  const found = findCatalog(json)
  if (!found) return null
  const catalog = found.node
  if (!Array.isArray(catalog.groups) || catalog.groups.length === 0) return null
  const groups = catalog.groups
  const first = groups[0]
  const template = first.models[0]
  const copy = (overrides) => ({ ...JSON.parse(JSON.stringify(template)), ...overrides })
  first.models.push(copy({ id: NO_REASONING, name: 'DeepSeek V4 Lite', reasoning: undefined, badge: undefined }))
  first.models.push(copy({
    id: 'deepseek-long',
    name: LONG,
    description: 'A deliberately long description used to check that the expanded row truncates instead of pushing the provider column out of the panel.',
  }))
  for (let index = 0; index < 24; index += 1) {
    first.models.push(copy({ id: 'deepseek-bulk-' + index, name: 'DeepSeek Bulk ' + String(index + 1).padStart(2, '0') }))
  }
  groups.push({ id: 'second-provider', name: 'Second Provider', models: [copy({ id: 'second-one', name: 'Second One' }), copy({ id: 'second-two', name: 'Second Two' })] })
  return found.path
}

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)))

let intercepted = 0
await page.route('**/api/session.models', async (route) => {
  intercepted += 1
  const response = await route.fetch()
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch (error) { return route.fulfill({ response }) }
  const where = enrich(json)
  if (intercepted === 1) console.log('catalog reply path:', where || 'not found', '| bytes:', text.length)
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) })
})

await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(3200)
const skip = page.locator('button:has-text("稍后配置")').first()
if (await skip.count()) { await skip.click().catch(() => {}); await page.waitForTimeout(700) }
console.log('session.models replies rewritten:', intercepted)

const triggerText = () => page.locator('.mg-trigger').first().innerText().then((text) => text.replace(/\s+/g, ' '))
const openPanel = async () => { await page.locator('.mg-trigger').first().click(); await page.waitForTimeout(700) }

await openPanel()
const total = await page.locator('.mg-pop .mg-row').count()
check('injected catalog reaches the popover', total >= 25, total + ' rows')
if (total < 25) {
  await page.screenshot({ path: 'test/shots/g4-9-catalog-not-injected.png' })
  await context.close(); await browser.close()
  const failedEarly = results.filter((item) => !item.ok)
  console.log('\n' + results.length + ' checks, ' + failedEarly.length + ' failed')
  process.exit(0)
}

const longRow = page.locator('.mg-pop .mg-row[data-model-id="deepseek-long"]').first()
const longOk = await longRow.evaluate((row) => {
  const name = row.querySelector('.mg-name')
  const panel = row.closest('.mg-pop')
  const nameBox = name.getBoundingClientRect()
  const panelBox = panel.getBoundingClientRect()
  return { truncated: name.scrollWidth > name.clientWidth, insidePanel: nameBox.right <= panelBox.right + 0.5, title: name.getAttribute('title') || '' }
})
check('long model name truncates instead of overflowing', longOk.truncated && longOk.insidePanel, JSON.stringify(longOk))
check('truncated name keeps the full text in a tooltip', longOk.title === LONG, longOk.title.slice(0, 40))

await page.locator('.mg-pop .mg-row[data-model-id="' + NO_REASONING + '"]').first().click()
await page.locator('.mg-pop').first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
await page.waitForTimeout(600)
check('model without reasoning switches cleanly', /Lite/.test(await triggerText()), await triggerText())
await openPanel()
check('model without reasoning shows no effort control', (await page.locator('.mg-pop .mg-seg').count()) === 0)

await page.locator('.mg-more').first().click()
await page.waitForTimeout(800)
const scroll = await page.locator('.mg-pane .mg-list-scroll').first().evaluate((node) => ({ scroll: node.scrollHeight, client: node.clientHeight, overflowY: getComputedStyle(node).overflowY }))
check('expanded list scrolls when the catalog is long', scroll.scroll > scroll.client && scroll.overflowY !== 'visible', JSON.stringify(scroll))
const heads = await page.locator('.mg-pane .mg-group-head').allInnerTexts()
check('every provider gets a group header', heads.length >= 2, JSON.stringify(heads))
const navItems = await page.locator('.mg-pane .mg-nav-item').allInnerTexts()
check('left navigation lists the injected provider', navItems.some((text) => /Second Provider/.test(text)), JSON.stringify(navItems))
const descText = await page.locator('.mg-pane .mg-row[data-model-id="deepseek-long"] .mg-desc').first().innerText()
check('expanded rows show the catalog description', descText.length > 20, descText.slice(0, 40))
const rowOverflow = await page.locator('.mg-pane .mg-row[data-model-id="deepseek-long"]').first().evaluate((row) => {
  const panel = row.closest('.mg-pop')
  return row.getBoundingClientRect().right <= panel.getBoundingClientRect().right + 0.5
})
check('expanded row stays inside the panel', rowOverflow)
await page.screenshot({ path: 'test/shots/g4-5-rich-catalog-expanded.png' })

await page.locator('.mg-pane .mg-nav-item:has-text("Second Provider")').first().click()
await page.waitForTimeout(400)
check('provider navigation filters the rows', (await page.locator('.mg-pane .mg-row').count()) === 2)
await page.screenshot({ path: 'test/shots/g4-6-provider-filter.png' })

// Regression: a provider picked in the compact chip row used to stay active behind the
// expanded panel, so its left navigation claimed a provider it then refused to show.
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await openPanel()
await page.locator('.mg-pop .mg-chip').nth(1).click()
await page.waitForTimeout(400)
await page.locator('.mg-pop .mg-more').first().click()
await page.waitForTimeout(800)
await page.locator('.mg-pane .mg-nav-item:has-text("Second Provider")').first().click()
await page.waitForTimeout(500)
const afterChipLeak = await page.locator('.mg-pane .mg-row').count()
check('provider chip does not hide another provider in the expanded panel', afterChipLeak === 2, afterChipLeak + ' rows')
await page.screenshot({ path: 'test/shots/g4-7-chip-then-provider-nav.png' })

// And the two filters stay in sync: choosing a provider in the nav clears the chip.
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await openPanel()
const chipOn = await page.locator('.mg-pop .mg-chip.is-on').allInnerTexts()
const collapsedRows = await page.locator('.mg-pop .mg-row').count()
check('provider navigation clears the compact chip filter', chipOn.length === 1 && collapsedRows > 2, JSON.stringify({ chipOn, collapsedRows }))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

check('no page errors with a rich catalog', errors.length === 0, errors.join(' | ').slice(0, 160))
await context.close()
await browser.close()

const failed = results.filter((item) => !item.ok)
console.log('\n' + results.length + ' checks, ' + failed.length + ' failed')
if (failed.length) console.log('failed: ' + failed.map((item) => item.name).join(' | '))
