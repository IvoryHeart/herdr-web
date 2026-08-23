# Pinned Foundation candidate

World consumes the checked-in `@herdr-world/foundation@0.1.0` tarball from the
immutable Foundation prerelease `v0.1.0-rc.1`. The package is intentionally a
file dependency for this migration tranche so a clean checkout remains
self-contained without a sibling Foundation checkout, registry access, Git
branch, or workstation path.

The pinned source and release are:

- source: `IvoryHeart/herdr-world-foundation`
- source commit: `a6104b683963651d60a061cfcbd91d9fdc5effde`
- release: <https://github.com/IvoryHeart/herdr-world-foundation/releases/tag/v0.1.0-rc.1>
- package SHA-256: `aaa33b18330cf2101dae754b3facc99b529c9d4196d6098cd74d57a84954e699`
- npm integrity: `sha512-OuCHH4Wfk5p2mflZdlBRFDYrHVNuIB1Ec2+C0BfkLD8a5EFsVF5LzFBoNDFpQRrg1UX2DxgZ/ewh8mQyuxPumg==`
- Foundation bridge `0.1.0` SHA-256: `a8041e7e6d888678185c0c934f5a0f9162cb43fe84b54e8c1f468aaa6431b7fa`

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
