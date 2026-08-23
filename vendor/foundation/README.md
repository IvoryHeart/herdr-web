# Pinned Foundation candidate

World consumes the checked-in `@herdr-world/foundation@0.1.0` tarball from the
immutable Foundation prerelease `v0.1.0-rc.5`. The package is intentionally a
file dependency for this migration tranche so a clean checkout remains
self-contained without a sibling Foundation checkout, registry access, Git
branch, or workstation path.

The pinned source and release are:

- source: `IvoryHeart/herdr-world-foundation`
- source commit: `182c483bb9cf97f20201ffe916240aa5b48f4127`
- release: <https://github.com/IvoryHeart/herdr-world-foundation/releases/tag/v0.1.0-rc.5>
- package SHA-256: `43450ccde2ab925f932fbfaa29ab8ccb097f3f650a5007b63facb7e33e98e751`
- npm integrity: `sha512-8JbRaIhc8cT554mnHPirldl03D7OtOLTnuhvdZSOHPkCn/pK1HbEiBpTNv4ATouV8/z7MEkPSJL5rXzeMM9gGA==`
- Foundation bridge `0.1.0` SHA-256: `8748cd78a06a10842a190c4af9f040c0e2b8f2c67b772abb6a0ac65fb267b029`

`manifest.json`, the detached checksums, the candidate archive, and its full
`SHA256SUMS` ledger are kept beside the package. Run the root verification
command after cloning or updating the pin:

```bash
npm run foundation:verify
npm ci --prefix web
```

To update this pin, obtain a newly owner-approved immutable Foundation release,
download its candidate archive and package, independently verify the source,
manifest, package SRI, bridge, inventories, notices, provenance, and complete
member ledger, then update the package files, `provenance/compatibility.json`,
and `provenance/assembly-manifest.json` together. Do not replace an existing
tag or asset, publish to npm, or use a mutable release alias.
