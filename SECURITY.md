# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | yes |
| < 0.1 | no |

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Use GitHub's private
vulnerability reporting (**Security → Report a vulnerability**) on this repository, or
contact the maintainer directly if that is unavailable.

Include: what you did, what happened, the DSH version and OS, and what you think the
impact is. A proof of concept helps; a weaponised exploit does not.

We aim to acknowledge within a few days and to ship a fix before disclosing details.

## What this plugin is allowed to do

ModelGlance is a UI skin. By design it has **no** host capabilities beyond rendering the
composer model slot:

- no filesystem access, no shell, no child processes;
- no network requests (no `fetch`, no XHR, no WebSocket, no image or font loading from the
  network), no telemetry, no auto-update, no remote code;
- no access to credentials, API keys, base URLs, provider configuration or request bodies;
- no writes to host state. The only persistence is favourites and recents in the host
  page's `localStorage`, holding `<provider>/<model>` identifiers only.

If you find code in this repository that does any of the above, that is a vulnerability by
definition — please report it.

## Things we consider in scope

- Any path by which the plugin could read or transmit credentials or conversation content.
- Any way a malicious catalog entry (model name, description, provider name) could execute
  script. Text is rendered as React text nodes, never as HTML; a regression there is in
  scope.
- Slot interaction that could break or shadow another plugin against its will.
- Unbounded growth of stored state (favourites/recents) that could bloat `localStorage`.

## Things that are out of scope

- DSH itself, the host's own `/model` dialog, or other plugins.
- The plugin making the host switch models — that is its function; the host validates the
  request.
- Cosmetic disagreements, including our refusal to display fields the catalog does not
  carry.
- Someone with local write access to your machine editing the plugin source.

## Install-time risk, stated plainly

Installing a DSH plugin writes to your profile directory (a dependency line, a link, and
possibly a lockfile entry) and links this package into it. That is a real, if small, change
to your environment, and no README can promise otherwise. Prefer `dsh plugin add` /
`dsh plugin remove` over hand-editing the profile, back up the profile if you hand-edit it,
and audit the source before installing — it is one readable file.
