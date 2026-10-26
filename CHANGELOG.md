# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/).

## [0.1.1] - 2026-10-26

### Changed

- `list({ names: true })` reports a stick whose name cannot be read as `busy`, instead of rejecting the whole listing.
- `open({ name })` rejecting with NOT_FOUND now says how many sticks were busy and could not be checked.
- `udev/60-blinkstick.rules` grants access to the hidraw node only, not the raw USB device.
- The `brightnessLimit` TypeError message quotes string values, as other argument errors do.

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
