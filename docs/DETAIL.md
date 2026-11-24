# ModelGlance

A refined, lightweight model picker for the DeepSeek Harness composer.

ModelGlance replaces the composer's model button with a small popover: search, provider filters,
favorites, recent models, and the reasoning efforts the selected model actually advertises. It
reads the session's own model directory and submits selections through the session API — it does
not add providers, keys, routing, billing or telemetry of any kind.

## What it does

- **Compact popover** anchored above the composer model button (340 px, right-edge aligned, 8 px
  from the trigger, 12 px inside the viewport).
- **Expanded panel** with a narrow left navigation (all models, favorites, recent, per provider)
  and a continuous row list on the right (760 × 560). The compact popover reaches it from a text row
  ("browse all models") *and* from a single 24 px icon button in the footer, so the same phrase is
  never printed twice in one view.
- **Search** across model name, model id, provider name and description.
- **Provider filter** as a chip row; providers come from the live catalog, never invented.
- **Favorites and recent** stored as `<providerId>/<modelId>` keys in `localStorage`. No keys,
  URLs, messages or usage data are stored. Recent is seeded with the model the session is
  currently using, then ordered by successful switches. Past usage from before installation
  cannot be reconstructed: the host exposes no history endpoint.
- **Reasoning effort** row appears only when the selected model's own metadata advertises
  efforts, and only lists those efforts. A model without reasoning metadata shows no effort row.
- **Follows the host theme.** Every colour is a host `--dsw-alias-*` token, so light and dark
  switch with the app appearance setting (Settings → General → Appearance) and no separate
  toggle is added.

## Visual design

A quiet, low-saturation surface built from host tokens: one raised layer (10 px radius, hairline
border, soft two-step shadow), a tinted header band that separates the search field and provider
chips from the list, and rows that are lines rather than cards. The selected row carries a 2 px
accent bar at its left edge, a 6 % tint and a half-step heavier name, so the current model stays
readable whichever accent the host theme supplies. The right side of every row is a fixed grid
(84 px provider, 30 px effort tag, 24 px star) so the column edges line up down the list. In the
compact popover the footer keeps only the label and the effort segment; the explanatory sentence
appears once, in the expanded panel. The surface fades in over 120 ms and respects
`prefers-reduced-motion`.

A model that is shown under Favorites or Recent is not repeated again in the full list below, so a
row never appears twice in the compact popover.

## Behaviour

| Event | Result |
| --- | --- |
| Switch succeeds in the compact popover | Popover closes |
| Switch succeeds in the expanded panel | Panel stays open |
| Switch fails | Previous model kept, panel stays open, error line shows the host's message |

While a switch is in flight the trigger shows a spinner instead of the chevron and the affected row
shows a spinner instead of the check mark. There is never more than one request in flight.

## Keyboard

Arrow Up / Down move the highlight, Enter selects, Escape closes. In the compact popover, Arrow
Right opens the expanded panel and Arrow Left goes back to the compact one (when focus is not in a
non-empty search field, so the caret keys still work while typing). Keys are only handled while the
popover is open, and never during an IME composition, so typing Chinese and pressing Enter to commit
a candidate never switches a model. ModelGlance registers no global shortcuts. The popover always
opens in the compact view; expanding is a step you take each time rather than a sticky mode.

## Safety

- No file system, no shell, no process spawning, no network requests, no telemetry.
- No access to other plugins, the profile, credentials or the user's home directory.
- If `conversation.input.model` is already occupied by another plugin, ModelGlance does not
  register, does not evict the other plugin, and logs a single warning. It registers at
  `priority: -1` so it shadows the shipped entry deterministically instead of competing at 0.
- Closing the popover never writes anything: only a confirmed host selection touches session
  state, and the local model shown on the trigger is never updated optimistically.

## Compatibility

Requires DSH `0.2.3-alpha.2` (declared through `engines.dsh`). Only that build has been exercised;
other versions, other profiles and non-Desktop installations have not been verified.

## Known limitations

- The composer seat only. It does not add the `/model` command, a settings section or a sidebar
  entry, and it does not render third-party `conversation.input.model.label` badges.
- The shipped seat's own tooltip wording, "model unavailable" copy and other plugin-contributed
  menu rows (`conversation.input.model.options`) are not reproduced.
- Reasoning effort names come from the adapter's advertised list; when an adapter advertises none,
  no effort row is rendered at all.
- Verified against a two-model catalog and, through request interception in an isolated profile,
  against a synthetic 30-model / two-provider catalog with an over-long name and a model without
  reasoning metadata. Real accounts with very large catalogs have not been exercised.

## Uninstall

Disable or remove the plugin through the DSH plugin manager. Nothing outside the plugin package
directory is modified, apart from the two `localStorage` lists described above.
