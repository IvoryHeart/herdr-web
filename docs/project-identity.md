# Herdr World project identity

Herdr World is the downstream product and future canonical repository identity
for this work. The approved repository model is:

```text
herdrdev/herdr (upstream runtime, Apache-2.0)
  -> IvoryHeart/herdr-world-foundation (generic browser/bridge dependency)
  -> IvoryHeart/herdr-world (World product, Office, branding, and releases)
```

The current checkout still contains the pre-extraction Herdr Web-derived tree;
physical repository extraction, operational-name migration, and GitHub rename
are delegated to Spec 016. Existing `herdr-web` package, executable, data-key,
and path names therefore remain compatibility identifiers until that approved
migration. They do not change the ownership boundary described here.

## Public description

Herdr World is an independent downstream project compatible with Herdr and
derived in part from Herdr Web. It is not affiliated with, sponsored by,
endorsed by, or maintained by the Herdr or Herdr Web projects.

## Licensing boundary

- Original World code is Apache-2.0, Copyright (c) 2026 Yaswanth Narvaneni for
  pre-existing and Yaswanth-authored work.
- Contributions keep their authors' copyright and attribution. DCO sign-off
  grants permission to submit under the applicable project license; it is not a
  copyright assignment.
- The inherited Herdr Web MIT notice remains in `LICENSE` and
  `LICENSES/MIT-Herdr-Web.txt`.
- The vendored Herdr compatibility slice remains Apache-2.0, with its exact
  source paths, revisions, hashes, and local adaptations in the vendor
  manifest.
- Claw-Empire sprites remain Apache-2.0 with their original copyright notice;
  PixiJS remains MIT; and the bundled Geist font remains OFL-1.1.

No repository-level notice relicenses a dependency. Read `NOTICE` and
`provenance/components.json` together with the relevant license file for a
file-level decision.

## Ownership lanes

Herdr owns its runtime and public APIs. Foundation owns generic bridge/runtime
behavior when the extraction specified by Specs 011 and 016 is delivered.
World owns Office, World surfaces, branding, downstream providers, and World
release policy. Herdr and Herdr Web maintainers do not support this product by
virtue of its compatibility relationship.
