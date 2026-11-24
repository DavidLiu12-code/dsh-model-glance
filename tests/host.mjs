// Resolves the modules the tests borrow — React for the offscreen render,
// Playwright for the browser runs — without hard-coding anybody's machine.
//
// Two libraries normally live in different places (React ships with the DSH
// profile runtime, Playwright with the Desktop profile), so we keep a list of
// candidate module tables and pick the first one that can resolve the name.
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = process.env.HOME || process.env.USERPROFILE || ''
const dshHome = process.env.DSH_HOME || (home ? path.join(home, '.dsh') : '')

const nodeModulesDirs = [
  // A checkout that installed its own dev dependencies.
  path.join(here, '..', 'node_modules'),
  // The DSH profile running this checkout.
  process.env.DSH_PROFILE_DIR ? path.join(process.env.DSH_PROFILE_DIR, 'node_modules') : '',
  // The profile runtime that carries React.
  dshHome ? path.join(dshHome, 'profiles', 'node_modules') : '',
  // The installed Desktop application's own dependencies.
  dshHome ? path.join(dshHome, 'profiles', 'desktop', 'node_modules') : '',
  // Explicit override, last so a repo-local install still wins.
  process.env.MG_HOST_MODULES || '',
].filter(Boolean)

const tables = nodeModulesDirs.map((dir) => path.join(dir, 'index.js'))

/** Borrow a module (react, react-dom/server, playwright, ...) from the host. */
export function requireHost(name) {
  for (const table of tables) {
    try {
      const req = createRequire(table)
      req.resolve(name)
      return req(name)
    } catch {
      // try the next candidate
    }
  }
  console.error(`Cannot resolve "${name}" from any known module table.`)
  console.error('Tried:')
  for (const table of tables) console.error('  ' + table)
  console.error('Set MG_HOST_MODULES=/absolute/path/to/node_modules to override.')
  process.exit(2)
}

/** Where the isolated DSH web UI is listening; e2e/failure/catalog drive it. */
export const APP_URL = process.env.MG_APP_URL || 'http://127.0.0.1:5199'

/** True when a path exists (used for optional local assets). */
export function pathExists(target) {
  try {
    return existsSync(target)
  } catch {
    return false
  }
}
