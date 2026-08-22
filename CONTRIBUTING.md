# Contributing to Herdr World

Herdr World is an independent downstream project compatible with Herdr and
derived in part from Herdr Web. It is not affiliated with, sponsored by,
endorsed by, or maintained by the Herdr or Herdr Web projects.

## Before opening work

Read `AGENTS.md`, `docs/specs/README.md`, and the approved specification that
governs the change. Approved specifications are immutable. Do not edit their
requirements, scenarios, status, or approval metadata; record a genuine
contract contradiction and stop for owner direction instead.

Keep changes focused. Product, release, security, protocol, and user-visible
changes need a numbered approved specification. Do not add a generic plugin
registry, second bridge manager, browser marketplace, or alternative terminal
transport. Do not commit generated builds, screenshots from a private session,
browser storage, notes, uploads, credentials, or machine-specific paths.

## Contribution lanes

| Need | Correct lane | This repository's role |
| --- | --- | --- |
| Herdr runtime, public API, plugin, hook, or terminal protocol | Herdr | File a focused proposal in Herdr's current process; do not imply Herdr support. |
| Generic Herdr Web browser/bridge behavior | Herdr Web / Foundation | Preserve upstream ancestry and make the smallest independently useful patch. |
| Herdr World surface, Office, branding, or product policy | World | Use the approved World specification and Apache-2.0 scope. |
| Historical, aggregate, or external-domain data absent upstream | World provider | Record the evidence gap and keep credentials server-side. |

Upstream review is welcome but is not a release dependency. A generic fix may
ship downstream after review; if it is suitable upstream, reconstruct one
focused branch from the current upstream head containing only the concern,
tests, minimal documentation, and required changelog entry.

## Code and documentation

Run the narrowest relevant checks while working and the complete applicable
suite before requesting review:

```bash
npm ci
npm ci --prefix web
npm run check
npm run release:compliance
npm run test:release-compliance
git diff --check
```

Use `git commit -s` for every commit. Explain provenance and license scope for
copied, adapted, generated, or third-party files. `provenance/components.json`
is fail-closed: a missing source revision, notice, destination hash, or
modification record blocks release packaging.

## Pull requests

Describe the user-visible result, scope, tests, provenance, security checks,
and any deviation or evidence limitation. Keep one focused concern per pull
request. Do not ask Herdr or Herdr Web maintainers to support the downstream
product or imply that a downstream pull request is an upstream release.
