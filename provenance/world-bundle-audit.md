# World v0.1.0 Foundation cutover bundle audit

The production build is rooted at `web/src/main.tsx`. It imports
`mountFoundationBrowser`, `@herdr-world/foundation/styles.css`, and the
World-only `web/src/world/world.css`; it does not
import `AppShell`, the local `surfaceRegistry`, the local `hostRegistry`, or
the local `TerminalView` as a runtime entrypoint. The World product assembly is
`web/src/world/worldAssembly.tsx`, and its Office registration loads
`worldFoundationSurface.tsx` through the public `@herdr-world/foundation/surfaces`
contract.

The selected World-side production path is:

```text
web/src/main.tsx
  -> @herdr-world/foundation (installed vendor tarball)
  -> web/src/world/worldAssembly.tsx
    -> @herdr-world/foundation/surfaces
    -> web/src/world/worldFoundationSurface.tsx
      -> web/src/world/WorldSurface.tsx
        -> web/src/world/PixelOfficeCanvas.tsx
          -> web/src/world/officeRenderer.ts
```

The checked build (`npm run build --prefix web`) produced the Foundation host
and World assembly in `web/dist/assets/main-CkJwiBQh.js` (910,700 bytes), the
Foundation terminal chunk in `ghostty-web-0K3DfDqq-CdDHdjG2.js` (636,569
bytes), and the combined stylesheet in `main-B0RgYzSQ.css` (171,605 bytes).
It emits both `web/dist/index.html` and `web/dist/world/index.html`; the latter
is required because the released bridge canonicalizes `/world` to `/world/`
on a hard refresh. This keeps the Office deep link self-contained without a
bridge or Foundation source change.
The Vite large-chunk warning is retained as a follow-up optimization item;
this tranche does not split or redesign the Foundation runtime.

The following pre-cutover generic or compatibility files remain in the tree
but are not selected by the production entrypoint. They are explicit removal
candidates for the immediately following rename/removal tranche:

- `web/src/App.tsx`
- `web/src/AppShell.tsx`
- `web/src/CoreNavigation.tsx`
- `web/src/hostRegistry.tsx`
- `web/src/surfaceRegistry.tsx`
- `web/src/bridge.ts`
- `web/src/bridgeApi.ts`
- `web/src/runtimeClient.ts`
- `web/src/runtimeConnection.ts`
- `web/src/federatedRuntime.tsx`
- `web/src/TerminalView.tsx`
- `web/src/world/herdrOfficeHandoff.ts`
- `web/src/world/worldRuntime.ts`
- `web/src/world/WorldSettingsDialog.tsx`
- `web/src/styles.css` and the remaining generic shell/terminal selectors
  (the file is retained only as a removal candidate and is not imported by the
  selected entrypoint)

`worldFoundationHandoff.ts` is the cutover-safe request adapter used by the
selected Office path. It contains no bridge owner, terminal owner, renderer
owner, or Foundation-private imports. The selected CSS contributes only
World-prefixed rules plus the Office canvas descendant rules; generic shell and
terminal styling comes from the installed Foundation stylesheet. The old
handoff/settings files remain only for deferred removal and legacy tests; they
are not imported by the selected Foundation assembly.
