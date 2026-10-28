# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/).

## [Unreleased]

## [0.1.4] - 2026-10-29

### Added

- Releases carry SLSA build provenance from GitHub as well as npm's. The release workflow attests the tarball with `actions/attest`, verifies the bundle for this repository, workflow, tag and commit before publishing, and attaches the tarball and its `.sigstore.json` to the GitHub release. README.md and SECURITY.md show how to check a release with `npm audit signatures` and `gh attestation verify`.

## [0.1.3] - 2026-10-29

### Added

- The release workflow creates the GitHub release after publishing to npm, using the version's CHANGELOG section as the notes (`scripts/release-notes.sh`).

### Fixed

- `setMode` waits for the stick to answer again after writing the mode, typically 12 to 15 ms and at most 250 ms. A Nano or Square refuses transfers for that long while it stores the mode, and the call made straight after `setMode` (reading the mode back, writing an info block or name, or setting LEDs) used to fail, or reconnect, as if the stick had been unplugged. `setMode` reads report 4 every 5 ms, without retries or a reconnect, until it shows the new mode, and rejects with DISCONNECTED if it has not after 250 ms.

## [0.1.2] - 2026-10-29

Tagged but never published: the release workflow failed before reaching npm. Its changes ship in 0.1.3.

## [0.1.1] - 2026-10-26

### Changed

- `list({ names: true })` reports a stick whose name cannot be read as `busy`, instead of rejecting the whole listing.
- `open({ name })` rejecting with NOT_FOUND now says how many sticks were busy and could not be checked. Sticks whose name cannot be read count as busy too.
- `udev/60-blinkstick.rules` grants access to the hidraw node only, not the raw USB device. Linux users who installed the 0.1.0 rule should copy the new file over it, then reload the rules as the README describes.
- The `brightnessLimit` and `inverted` TypeError messages quote string values, as other argument errors do.
- `setName` uses `String.prototype.isWellFormed`, so it needs Node 22 (already the floor) or Chrome or Edge 111 or later.

### Security

- The release workflow builds and verifies the package without a publish credential. Only the publish job, which installs nothing, can mint one.

## [0.1.0] - 2026-10-26

### Added

- First release: BlinkStick Nano and Square from Node (`@bawdo/blinkstick/node`, using node-hid) and from the browser (`@bawdo/blinkstick/webhid`, using WebHID).
- `list`, `open` and, in the browser, `pair` and `fromHIDDevice`. Open the first stick, one by serial (Node), or one by stored name.
- `BlinkStick` with `setAll`, `off`, `setFrame`, `setLed`, `getFrame`, `getLed`, `brightnessLimit` and `inverted`.
- `blink`, `pulse` and `morph`, cancellable with an `AbortSignal`.
- `getInfoBlock`, `setInfoBlock`, `getName`, `setName`, `getMode` and `setMode` (the writes use EEPROM).
- Colour helpers: `parseColor`, `toHex`, `invert`, `colorNames`, `randomColor`, `randomVividColor`.
- Automatic reconnect after an unplug, repainting the last frame.
- `BlinkStickError` with stable codes.
- `await using` support.
- `udev/60-blinkstick.rules` for Linux.
