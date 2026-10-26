# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/).

## [0.1.0] - Unreleased

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
