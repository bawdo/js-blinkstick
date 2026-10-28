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

## Verifying a release

npm makes the provenance when the release workflow publishes, and records it
on the registry. To check every package installed in a project, this one
included:

```sh
npm audit signatures
```

The package page on npmjs.com also shows it, linked to the workflow run and
commit that built the version.

Releases after 0.1.3 also carry SLSA build provenance from GitHub, made and
verified by the release workflow before anything is published. It is
attached to the GitHub release as `<tarball>.sigstore.json`, beside the
tarball itself. The tarball on the release is the one npm serves, so the
same check works on either download:

```sh
npm pack @bawdo/blinkstick@0.1.4
gh attestation verify bawdo-blinkstick-0.1.4.tgz --repo bawdo/js-blinkstick \
  --signer-workflow bawdo/js-blinkstick/.github/workflows/release.yml
```

Swap in the version you are checking. `--repo` alone accepts an attestation
from any workflow in this repository. `--signer-workflow` narrows that to the
release workflow, which is the only one that should ever attest a tarball.

The npm trusted publisher must keep naming the `npm` environment. The job
that makes the GitHub attestation can request an OIDC token but has no
environment, so that name is what stops it publishing to npm. A publisher
recreated without an environment would undo that.
