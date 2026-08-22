# Provenance and release evidence

`components.json` is the file-level source, license, notice, and attribution
inventory. It deliberately distinguishes copied, adapted, original, generated,
and reference-only work. `assembly-manifest.json` defines the source and
desktop release boundaries. `compatibility.json` records the current Herdr
protocol-20 relationship and non-blocking upstream ledger.

Run the fail-closed checker from a clean dependency install:

```bash
npm run release:compliance
npm run test:release-compliance
```

Release packaging generates exact source/artifact manifests, npm and Cargo
SBOMs from the lockfiles, and SHA-256 records. It refuses missing notices,
missing or incorrect hashes, unresolved included dependency license metadata,
undeclared members, secrets, browser-local state, credentials, workstation
paths, sibling checkouts, and unrelated workspace files.

The Office geometry/renderer evidence is owner-attested in
`office-owner-attestation.md`. The original intermediate directory was
untracked, so its historical commit is unavailable; the attestation preserves
the approval and integration references and source hashes. The twelve sprites
are separately attributable to Claw-Empire. Pixel Agents is reference-only and
is not a distributed source or license attribution.
