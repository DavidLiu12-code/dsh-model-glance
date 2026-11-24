# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-11-24

First public release. Verified against DSH `0.2.3-alpha.2` only.

### Added

- Composer model seat (`conversation.input.model`, registered at `priority: -1`) rendered
  by ModelGlance: name, effort badge, spinner while a switch is pending.
- Compact popover: search, provider chips, favourites, recents, and a single text row to
  expand. Closes after a successful switch.
- Expanded panel: 184 px provider sidebar (all models / favourites / recents / per
  provider), search, continuous centred rows with description and provider columns, and a
  footer showing the current model plus the effort segmented control. Stays open after a
  successful switch.
- Real reasoning efforts only. The row is absent entirely when the host advertises no
  reasoning metadata; `Default` is offered when a model advertises efforts but no
  selection.
- Search matching on name, id and description; provider navigation that always lists the
  models it counts.
- Favourites and recents in `localStorage`, keyed by `<provider>/<model>`. The model in use
  seeds recents. Recents deduplicate and cap at 8.
- Keyboard: `↑`/`↓`, `Enter`, `Esc` (with focus return), `→`/`←` to cross between modes.
  No global shortcuts.
- Failure handling: a rejected switch keeps the previous model, keeps the panel open, and
  shows a single-line reason. IME composition `Enter` never switches.
- Light and dark themes derived exclusively from host `--dsw-alias-*` tokens.
  `prefers-reduced-motion` disables the 120 ms entrance animation.
- Conflict guard: when another plugin already occupies the slot, ModelGlance registers
  nothing and logs one warning instead of fighting for the seat.
- Test suites: offscreen `smoke`, plus browser `e2e` (30), `failure` (8) and `catalog` (14)
  checks against an isolated profile.

### Known limitations

- Only the composer seat is skinned; `/model` is untouched.
- No context window, input modalities or pricing — the browser-side catalog does not carry
  them, and adding a network route to fetch them is out of scope by design.
- Third-party `…input.model.label` badges are not rendered.
- Not yet tested with very large catalogs, multiple monitors, or alongside other plugins
  that decorate the composer.
