# Office owner attestation

I, Yaswanth Narvaneni, attest that the historical Office reference
implementation used for the Herdr World integration was created by me or
under my authority in my personal `ai-observability` / `ai-palace` work. I
intentionally approved its adaptation into this downstream project. This
attestation covers the geometry and renderer implementation identified below;
it does not change the license or ownership of any third-party asset.

Evidence and boundaries:

- Extension 001 approval reference: `7be916e3c4713582c72665cd787ef0300658ea26`.
- Initial World integration commit:
  `c69defe64687882158af30ae2f8375dde165dba4`.
- Historical source hashes at port time:
  - `office-geometry.js`:
    `6ab54a94369e8695c3bac2cf94ac76bab62613563382e4a712944ff0ff70e028`.
  - `office-drawing.js`:
    `56edfdd364ace64663e4a98c931d15d2ef5bfcb725acee8d8791e88f974fd210`.
  - the rendering portions of `office-scene.js`:
    `f4975a6e840506a003f39153dfa6e32830d311624402980a1884ecb5351a1e3f`.
- The corresponding adapted destinations are
  `web/src/world/officeGeometry.ts`, `web/src/world/officeRenderer.ts`, and
  `web/src/world/PixelOfficeCanvas.tsx`; later bounded layout work is recorded
  separately in the immutable Office layout specifications and history.
- The twelve character sprites are not covered by this attestation. They are
  byte-identical Claw-Empire files and are licensed and attributed separately
  in `provenance/components.json` and
  `LICENSES/Apache-2.0-Claw-Empire.txt`.

The source directory used for the original port was untracked at the time, so
its original path and Git commit cannot be recovered from this repository. The
historical SHA-256 values above, the immutable integration commit, the approval
reference, and this owner attestation are the evidence available. The clean
baseline does not contain the object for the approval reference; its value is
retained as the historical record and is not silently replaced with a different
commit. No unsupported remainder is claimed: any future material that cannot
be attested to or mapped to a compatible third-party source must be replaced or
clean-room rewritten before a releasable artifact claims it.
