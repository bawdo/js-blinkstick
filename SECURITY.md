# Security policy

## Supported versions

Only the latest release of `@bawdo/blinkstick` gets security fixes. While the
package is at 0.x, a fix ships as a new patch or minor release.

## Reporting a vulnerability

Please report privately through GitHub:
[Report a vulnerability](https://github.com/bawdo/js-blinkstick/security/advisories/new).
Do not open a public issue.

Include what you found, how to reproduce it, and the version, platform (Node or
browser) and operating system you used. You can expect an acknowledgement
within a week. Once a fix is released, the advisory is published with credit
to you, unless you would rather stay anonymous.

## Scope

In scope: this package's code, its published npm tarball, and its release
workflow. Examples are a way for a page to drive a stick it was not granted,
a write to EEPROM from a call that is documented as read only, or a problem
in how releases are built and published.

Out of scope: BlinkStick firmware and hardware, node-hid, and browser WebHID
implementations. Report those upstream.

Releases are published from GitHub Actions through npm trusted publishing,
with provenance from 0.1.1 onward. A version without provenance, other than
0.1.0, did not come from this repository's workflow.
