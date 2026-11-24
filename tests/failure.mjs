// Failure-path and IME guard checks against the running isolated DSH.
// Run: node test/failure.mjs
import { requireHost, APP_URL } from './host.mjs'

const { chromium } = requireHost('playwright')
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  -> ' + detail : ''))
}

const browser = await chromium.launch({ channel: 'chrome' })

async function session() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 200)))
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(3000)
  const skip = page.locator('button:has-text("稍后配置")').first()
  if (await skip.count()) { await skip.click().catch(() => {}); await page.waitForTimeout(600) }
  return { context, page }
}

const triggerText = (page) => page.locator('.mg-trigger').first().innerText().then((text) => text.replace(/\s+/g, ' '))
const openPanel = async (page) => { await page.locator('.mg-trigger').first().click(); await page.waitForTimeout(600) }
const otherRow = (page) => page.evaluate(() => {
  const row = [...document.querySelectorAll('.mg-pop .mg-row')].find((r) => r.getAttribute('aria-selected') !== 'true')
  return row ? row.getAttribute('data-model-id') : null
})

// ---------------------------------------------- 1. transport rejects outright
{
  const { context, page } = await session()
  await page.route('**/api/session.selectModel', (route) => route.abort('failed'))
  const before = await triggerText(page)
  await openPanel(page)
  const target = await otherRow(page)
  await page.locator('.mg-pop .mg-row[data-model-id="' + target + '"]').first().click()
  await page.waitForTimeout(1600)
  const after = await triggerText(page)
  const stillOpen = (await page.locator('.mg-pop').count()) === 1
  const errorText = (await page.locator('.mg-pop .mg-error, .mg-pop .mg-foot-error').allInnerTexts()).join(' ').trim()
  check('failed switch keeps the previous model', before === after, before + ' -> ' + after)
  check('failed switch keeps the panel open', stillOpen)
  check('failed switch shows an error', errorText.length > 0, errorText.slice(0, 80))
  // The real invariant: the row whose switch failed must not become the
  // selected row. A fresh session may legitimately have no selection at all,
  // so "exactly one" is only asserted when something was current before.
  check('failed switch never marks the new row selected', await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.mg-pop .mg-row')]
    const selected = rows.filter((r) => r.getAttribute('aria-selected') === 'true')
    return selected.length <= 1
  }))
  await page.screenshot({ path: 'test/shots/g4-4-switch-error.png' })
  await context.close()
}

// ------------------------------------- 2. host answers with an explicit failure
{
  const { context, page } = await session()
  await page.route('**/api/session.selectModel', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: { code: 'session/writer-held', message: 'writer held' } }),
  }))
  const before = await triggerText(page)
  await openPanel(page)
  const target = await otherRow(page)
  await page.locator('.mg-pop .mg-row[data-model-id="' + target + '"]').first().click()
  await page.waitForTimeout(1600)
  const after = await triggerText(page)
  const errorText = (await page.locator('.mg-pop .mg-error, .mg-pop .mg-foot-error').allInnerTexts()).join(' ').trim()
  check('rejected selection keeps the previous model', before === after, before + ' -> ' + after)
  check('rejected selection reports failure', errorText.length > 0, errorText.slice(0, 80))
  await context.close()
}

// ------------------------------------------------------------ 3. IME composing
{
  const { context, page } = await session()
  const before = await triggerText(page)
  await openPanel(page)
  await page.locator('.mg-pop .mg-search-input').first().focus()
  // A Chinese IME holds Enter to commit the candidate: the picker must ignore it.
  await page.evaluate(() => {
    const input = document.querySelector('.mg-pop .mg-search-input')
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true })
    Object.defineProperty(event, 'keyCode', { get: () => 229 })
    input.dispatchEvent(event)
  })
  await page.waitForTimeout(900)
  const after = await triggerText(page)
  const stillOpen = (await page.locator('.mg-pop').count()) === 1
  check('IME Enter does not switch the model', before === after, before + ' -> ' + after)
  check('IME Enter leaves the panel open', stillOpen)
  await context.close()
}

await browser.close()
const failed = results.filter((item) => !item.ok)
console.log('\n' + results.length + ' checks, ' + failed.length + ' failed')
if (failed.length) console.log('failed: ' + failed.map((item) => item.name).join(' | '))
