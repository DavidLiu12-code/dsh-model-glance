# Contributing

Thanks for wanting to help. ModelGlance is deliberately small: one hand-written client
file, no bundler, no runtime dependencies. Please keep it that way.

## Before you start

- Open an issue for anything larger than a typo or a one-line CSS fix, so we do not
  duplicate work.
- Read [`docs/DETAIL.md`](docs/DETAIL.md) and the **Safety** section of the README. The
  no-filesystem / no-shell / no-network rules are product constraints, not preferences.

## Ground rules

1. **No new capabilities.** The plugin must not gain filesystem, shell, process, network or
   telemetry access. A pull request that adds any of these will be declined regardless of
   features.
2. **Host tokens only.** Every colour comes from a `--dsw-alias-*` token or a `color-mix()`
   derived from one. Literal colours are only acceptable for the icon artwork.
3. **No host internals.** Do not patch, monkey-patch or override the host's own styles or
   DOM, and do not read another plugin's DOM to position yourself. Use the slot contract.
4. **No synthesized data.** If the catalog does not carry a field (context window, price,
   modalities), the UI does not show it. Do not invent reasoning levels.
5. **Locale, not literals.** User-visible strings go through the client locale dictionary
   (`modelGlance`), in both `zh` and `en`. Key parity is enforced by a test.
6. **Fail honestly.** A rejected switch must keep the previous selection and surface the
   host's error. No optimistic UI.
7. **Never fight another plugin.** If the slot is occupied, register nothing and warn.

## Working on the code

```sh
git clone https://github.com/<you>/dsh-model-glance.git
cd dsh-model-glance

node tests/smoke.mjs      # must pass before you open a pull request
```

`tests/smoke.mjs` runs fully offscreen with a fake host; it needs React and `react-dom` on
any module table it can find (see `tests/host.mjs`, or set `MG_HOST_MODULES`).

The browser suites need an isolated DSH profile — **never run them against your everyday
profile**:

```sh
# terminal 1
set DSH_HOME=D:\path\to\.test-home
dsh --profile modelglance-test --port 5199

# terminal 2
set MG_APP_URL=http://127.0.0.1:5199
node tests/e2e.mjs
node tests/failure.mjs
node tests/catalog.mjs
```

## Editing `client.js` safely

It is a single 52 KB file and it is easy to break. Use an editor that writes the file
atomically (or the `write`/`edit` tools). Do **not** rewrite it with line-array scripts —
a failed batch edit once truncated this file to zero bytes, and `node --check` happily
accepts an empty file.

After every change:

1. `node --check client.js`
2. check the file size is not suspiciously small
3. `node tests/smoke.mjs`
4. the browser suites, if the change touches behaviour

## Visual changes

`design/` contains the HTML reference (tokens, component CSS, six screens in light and
dark). Change the reference first, confirm it at 100 %/125 %/150 % and at a 720 px window,
then port the CSS to `client.js`. Keep the values in `design/tokens.css` and the plugin in
sync; the fixed columns (84 px provider, 30 px effort) and the 2 px selection bar are
load-bearing.

## Pull requests

Include in the description:

- what problem it solves, and what you changed;
- which suites you ran and their result counts;
- screenshots for visual changes (light and dark; hide provider names if they are private);
- anything you could **not** verify.

Commits: imperative mood, one logical change each. Keep the diff focused.

## Reporting bugs

Use the issue template. Useful details: DSH version, OS, whether the model picker is the
composer seat or `/model`, what you expected, what happened, and a console excerpt if the
browser devtools showed an error. Never paste API keys, base URLs or full config dumps.
