// G4 behaviour + G5 visual checks against the running isolated DSH web UI.
// Every step prints PASS/FAIL; screenshots land in test/shots/.
import { requireHost, APP_URL } from './host.mjs'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { chromium } = requireHost('playwright')
const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots') + path.sep
mkdirSync(shots, { recursive: true })

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  -> ' + detail : ''))
}

const browser = await chromium.launch({ channel: 'chrome' })

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)))
  page.on('console', (message) => {
    if (message.type() === 'error' && /glance/i.test(message.text())) errors.push(message.text().slice(0, 200))
  })
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(3500)
  const skip = page.locator('button:has-text("稍后配置")').first()
  if (await skip.count()) { await skip.click().catch(() => {}); await page.waitForTimeout(700) }
  return { context, page, errors }
}

const triggerText = (page) => page.locator('.mg-trigger').first().innerText()
const openPanel = async (page) => { await page.locator('.mg-trigger').first().click(); await page.waitForTimeout(600) }
const panelBox = (page) => page.locator('.mg-pop').first().boundingBox().catch(() => null)
// The panel closes the moment the switch resolves; the host publishes the new
// selection a frame or two later, so the trigger text is not updated yet.
const waitTriggerChange = async (page, previous) => {
  await page.waitForFunction((prev) => {
    const node = document.querySelector('.mg-trigger')
    return node !== null && node.innerText.replace(/\s+/g, ' ').trim() !== prev
  }, previous, { timeout: 6000 }).catch(() => {})
}

// ---------------------------------------------------------------- light run
{
  const { context, page, errors } = await newPage()
  const startText = (await triggerText(page)).replace(/\s+/g, ' ')
  console.log('trigger at start:', JSON.stringify(startText))

  // 1. compact: open, pick the second model, panel must close.
  await openPanel(page)
  check('compact opens on click', (await page.locator('.mg-pop').count()) === 1)
  const rows = page.locator('.mg-pop .mg-row')
  const rowCount = await rows.count()
  check('compact lists models', rowCount >= 2, rowCount + ' rows')
  // The list starts with the current model, so a fixed index is not stable:
  // pick the other model explicitly and assert it is what we asked for.
  const startModel = /Pro/.test(startText) ? 'Pro' : 'Flash'
  const target = startModel === 'Pro' ? 'Flash' : 'Pro'
  const targetName = target === 'Pro' ? 'DeepSeek-V4-Pro' : 'DeepSeek-V4-Flash'
  await page.locator('.mg-pop .mg-row', { hasText: targetName }).first().click()
  // The host writes the selection asynchronously; wait for the panel to close
  // instead of assuming a fixed latency.
  await page.locator('.mg-pop').first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
  const closedAfterCompact = (await page.locator('.mg-pop').count()) === 0
  await waitTriggerChange(page, startText)
  const afterCompact = (await triggerText(page)).replace(/\s+/g, ' ')
  check('compact closes after successful switch', closedAfterCompact)
  check('trigger shows the new model', afterCompact.includes(targetName) && !afterCompact.includes(startModel === 'Pro' ? 'DeepSeek-V4-Pro' : 'DeepSeek-V4-Flash'), startText + ' -> ' + afterCompact)
  await page.screenshot({ path: shots + 'g4-1-compact-switched.png' })

  // 2. expanded: open, expand, pick the first model, panel must stay open.
  await openPanel(page)
  await page.locator('.mg-more').first().click()
  await page.waitForTimeout(700)
  check('expanded opens from compact', (await page.locator('.mg-pane').count()) === 1)
  const beforeExpanded = (await triggerText(page)).replace(/\s+/g, ' ')
  const otherName = beforeExpanded.includes('DeepSeek-V4-Pro') ? 'DeepSeek-V4-Flash' : 'DeepSeek-V4-Pro'
  await page.locator('.mg-pane .mg-row', { hasText: otherName }).first().click()
  await page.waitForFunction((prev) => {
    const trigger = document.querySelector('.mg-trigger')
    return trigger !== null && !trigger.hasAttribute('aria-busy') && trigger.innerText.replace(/\s+/g, ' ').trim() !== prev
  }, beforeExpanded, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(400)
  const stillOpen = (await page.locator('.mg-pane').count()) === 1
  const afterExpanded = (await triggerText(page)).replace(/\s+/g, ' ')
  check('expanded stays open after successful switch', stillOpen)
  check('expanded switch updated the model', beforeExpanded !== afterExpanded && afterExpanded.includes(otherName), beforeExpanded + ' -> ' + afterExpanded)
  const checkedCount = await page.locator('.mg-pane .mg-row[aria-selected="true"]').count()
  check('exactly one row is marked selected', checkedCount === 1, String(checkedCount))

  // 3. effort switch inside the expanded panel.
  const maxButton = page.locator('.mg-foot .mg-seg button', { hasText: 'Max' }).first()
  if (await maxButton.count()) {
    await maxButton.click()
    await page.waitForFunction(() => {
      const trigger = document.querySelector('.mg-trigger')
      return trigger !== null && !trigger.hasAttribute('aria-busy')
    }, undefined, { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(400)
    const withMax = (await triggerText(page)).replace(/\s+/g, ' ')
    check('effort switch reaches the trigger', /Max/.test(withMax), withMax)
    const pressed = await page.locator('.mg-foot .mg-seg button[aria-pressed="true"]').innerText()
    check('effort button reflects the new state', /Max/.test(pressed), pressed)
  }

  // 4. search narrows the list.
  const search = page.locator('.mg-pane .mg-search-input').first()
  await search.fill('pro')
  await page.waitForTimeout(500)
  const filtered = await page.locator('.mg-pane .mg-row').count()
  check('search filters the list', filtered === 1, filtered + ' rows for "pro"')
  await search.fill('zzzz')
  await page.waitForTimeout(400)
  check('search empty state appears', (await page.locator('.mg-status').count()) >= 1)
  await page.screenshot({ path: shots + 'g4-2-search-empty.png' })
  await search.fill('')
  await page.waitForTimeout(400)

  // 5. Esc closes and returns focus to the trigger.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  check('Escape closes the panel', (await page.locator('.mg-pop').count()) === 0)
  const focused = await page.evaluate(() => (document.activeElement && document.activeElement.className) || '')
  check('focus returns to the trigger', /mg-trigger/.test(focused), focused)

  // 6. keyboard: arrow + Enter switches without the mouse.
  // The expanded layout persists across Escape, so force the compact view first:
  // in expanded mode a successful switch is *supposed* to keep the panel open.
  await openPanel(page)
  if ((await page.locator('.mg-pane').count()) > 0) {
    await page.locator('.mg-pane .mg-head-actions .mg-icon-btn').first().click()
    await page.waitForTimeout(500)
  }
  check('compact layout before keyboard test', (await page.locator('.mg-pane').count()) === 0)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  check('keyboard highlight appears after ArrowDown', (await page.locator('.mg-pop .mg-row.is-active').count()) === 1)
  const beforeKey = (await triggerText(page)).replace(/\s+/g, ' ')
  await page.keyboard.press('Enter')
  await page.locator('.mg-pop').first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
  await waitTriggerChange(page, beforeKey)
  const afterKey = (await triggerText(page)).replace(/\s+/g, ' ')
  check('keyboard Enter switches the model', beforeKey !== afterKey && (await page.locator('.mg-pop').count()) === 0, beforeKey + ' -> ' + afterKey)

  // 7. favourite persists across a reload.
  await openPanel(page)
  await page.locator('.mg-pop .mg-row').first().hover()
  await page.waitForTimeout(200)
  await page.locator('.mg-pop .mg-row').first().locator('.mg-star').click()
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
  const skip2 = page.locator('button:has-text("稍后配置")').first()
  if (await skip2.count()) { await skip2.click().catch(() => {}); await page.waitForTimeout(700) }
  await openPanel(page)
  const favSections = await page.locator('.mg-sect').allInnerTexts()
  check('favourite survives a reload', favSections.some((text) => /收藏/.test(text)), JSON.stringify(favSections))
  await page.screenshot({ path: shots + 'g4-3-favourites.png' })
  await page.keyboard.press('Escape')

  // 8. click outside closes.
  await openPanel(page)
  await page.mouse.click(300, 700)
  await page.waitForTimeout(500)
  check('click outside closes the panel', (await page.locator('.mg-pop').count()) === 0)

  check('no page errors in the light run', errors.length === 0, errors.join(' | ').slice(0, 200))
  await context.close()
}

// ---------------------------------------------------------------- dark run
{
  const { context, page } = await newPage({ colorScheme: 'dark' })
  await openPanel(page)
  const bg = await page.locator('.mg-pop').first().evaluate((node) => getComputedStyle(node).backgroundColor)
  const text = await page.locator('.mg-pop .mg-row').first().evaluate((node) => getComputedStyle(node).color)
  console.log('dark panel bg:', bg, 'row text:', text)
  check('dark panel is not light', !/0\.98|1, 1, 1|255, 255, 255/.test(bg), bg)
  await page.screenshot({ path: shots + 'g5-dark-compact.png' })
  await page.locator('.mg-more').first().click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: shots + 'g5-dark-expanded.png' })
  await context.close()
}

// -------------------------------------------------- zoomed and narrow runs
for (const [name, viewport] of [
  ['g5-zoom125', { width: 1024, height: 640 }],
  ['g5-zoom150', { width: 853, height: 533 }],
  ['g5-narrow', { width: 720, height: 800 }],
]) {
  const { context, page } = await newPage({ viewport })
  await openPanel(page)
  const box = await panelBox(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  console.log(name, 'panel:', JSON.stringify(box), 'overflowX:', overflow)
  check(name + ': panel fits inside the viewport', box && box.x >= 0 && box.x + box.width <= viewport.width + 1, JSON.stringify(box))
  check(name + ': page has no horizontal overflow', overflow <= 1, String(overflow))
  await page.screenshot({ path: shots + name + '-compact.png' })
  await page.locator('.mg-more').first().click()
  await page.waitForTimeout(700)
  const wide = await panelBox(page)
  check(name + ': expanded panel fits inside the viewport', wide && wide.x >= 0 && wide.x + wide.width <= viewport.width + 1, JSON.stringify(wide))
  await page.screenshot({ path: shots + name + '-expanded.png' })
  await context.close()
}

await browser.close()

const failed = results.filter((item) => !item.ok)
console.log('\n' + results.length + ' checks, ' + failed.length + ' failed')
if (failed.length) console.log('failed: ' + failed.map((item) => item.name).join(' | '))
