# Security policy

Herdr World is an independent downstream project. Do not report World issues
to Herdr or Herdr Web maintainers and do not put secrets, credentials,
terminal content, note content, or private paths in a public issue.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Include the affected version, a minimal reproduction, impact, and a safe
   contact method. Redact credentials and user data.

If private reporting is unavailable, contact the project owner, Yaswanth
Narvaneni, through the private contact method listed in the repository's GitHub
Security settings or the private contact option on the
[`IvoryHeart GitHub profile`](https://github.com/IvoryHeart). This is the
documented fallback before release; the contact is intentionally not written
into source or release logs. Never open a public issue first for a suspected
vulnerability.

## Supported versions

The latest stable Herdr World release is supported on a best-effort basis.
Security fixes may be backported to the immediately preceding stable release
when the fix is safe and maintainable. Development snapshots, old releases,
unmodified upstream Herdr, Herdr Web, and third-party dependencies are outside
this project's support promise; report their issues to their respective
upstream security channels.

The supported Herdr/Foundation compatibility range for a release is recorded
in its assembly and compatibility manifests. A protocol or dependency
mismatch is not silently supported.

## Scope and handling

The bridge is loopback-only by default. Non-loopback binding, uploads, and
cross-origin access are explicit operator choices. Provider credentials remain
server-side and outside browser surface contexts. Release validation scans for
secrets, local state, absolute workstation paths, and undeclared files, and
fails closed on missing notices, hashes, or provenance.
