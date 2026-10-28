# Capabilities

What the BlinkStick Nano and Square can do, and what this package supports. Back to the
[README](README.md).

This file is updated whenever a feature lands. Browser cells come from the hardware runs in
[docs/manual-test-results.md](docs/manual-test-results.md), on Chrome 155 on macOS and Chrome on
Linux (version not recorded). The browser checks for LEDs, effects and
reconnect were run on the Nano; the Square was covered by the descriptor, pairing, framing and
two-stick checks, and by the same code paths.

Key: **yes** supported, **no** not supported, **n/a** not possible on that device or platform,
with the reason.

## Device features

Features built into the BlinkStick firmware.

| Feature                                   | Nano Node                    | Nano Browser                         | Square Node                   | Square Browser                       | Since | Notes                                                                                                                                                 |
| ----------------------------------------- | ---------------------------- | ------------------------------------ | ----------------------------- | ------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| List attached sticks                      | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `list`. Browser lists paired sticks only; `pair` adds them                                                                                            |
| Open the first stick                      | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `open`                                                                                                                                                |
| Open by serial                            | yes                          | n/a (WebHID exposes no serial)       | yes                           | n/a (WebHID exposes no serial)       | 0.1.0 | `open({ serial })`, Node only                                                                                                                         |
| Name a stick and open it by name          | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `setName`, `getName`, `open({ name })`, `list({ names: true })`. Stored in info block 1. The write was not run on hardware (no EEPROM writes by rule) |
| Several sticks open at once               | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 |                                                                                                                                                       |
| Serial, firmware version and release      | yes                          | n/a (WebHID exposes no serial)       | yes                           | n/a (WebHID exposes no serial)       | 0.1.0 | `info.serial`, `info.version`, `info.release`                                                                                                         |
| Product string                            | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `info.product`                                                                                                                                        |
| Manufacturer string                       | yes                          | n/a (WebHID exposes no manufacturer) | yes                           | n/a (WebHID exposes no manufacturer) | 0.1.0 | `info.manufacturer`, "" in the browser                                                                                                                |
| Model detection                           | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `info.model`. Node: serial and release. Browser: product string plus descriptor (report 10 = Square), else the `model` hint if detection says unknown |
| Set all LEDs                              | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `setAll`, `off`                                                                                                                                       |
| Set one LED                               | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `setLed`. One report 5                                                                                                                                |
| Set every LED at once                     | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `setFrame`. Report 6                                                                                                                                  |
| Read LED values back                      | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `getFrame`, `getLed`                                                                                                                                  |
| Info blocks 1 and 2                       | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `getInfoBlock`, `setInfoBlock`. 32 bytes each, stored in EEPROM. The write was not run on hardware (no EEPROM writes by rule)                         |
| Read device mode                          | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `getMode`                                                                                                                                             |
| Set device mode                           | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | `setMode`. Writes EEPROM, skipped when unchanged. Waits for the stick to answer again (typically 12 to 15 ms, at most 250 ms). Not run on hardware    |
| Mode 2, WS2812                            | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | The mode both sticks are in                                                                                                                           |
| Mode 3, WS2812 mirror                     | yes                          | yes                                  | yes                           | yes                                  | 0.1.0 | Report 1's colour goes to every LED. The write was not run on hardware (no EEPROM writes by rule)                                                     |
| Modes 0 and 1, rgb and rgb-inverse        | n/a (BlinkStick Pro outputs) | n/a (BlinkStick Pro outputs)         | n/a (BlinkStick Pro outputs)  | n/a (BlinkStick Pro outputs)         | n/a   | `setMode` rejects them with `UNSUPPORTED_MODE`. A Nano in mode 1 goes dark until replugged                                                            |
| Report 10                                 | n/a (Nano does not have it)  | n/a (Nano does not have it)          | n/a (undocumented, read only) | n/a (undocumented, read only)        | n/a   | Square only, 2 bytes. Read and logged on hardware, not used. Undocumented                                                                             |
| LED count setting (report 0x81)           | n/a (BlinkStick Flex only)   | n/a (BlinkStick Flex only)           | n/a (BlinkStick Flex only)    | n/a (BlinkStick Flex only)           | n/a   |                                                                                                                                                       |
| 16, 32 and 64 LED frames (reports 7 to 9) | n/a (longer strips only)     | n/a (longer strips only)             | n/a (longer strips only)      | n/a (longer strips only)             | n/a   |                                                                                                                                                       |

## Host features

Features this package adds in software. They work the same on both devices and both platforms.

| Feature                              | Since | Notes                                                                               |
| ------------------------------------ | ----- | ----------------------------------------------------------------------------------- |
| Colour from hex, `r,g,b` or CSS name | 0.1.0 | `parseColor`. All 148 CSS Color Level 4 names                                       |
| List CSS colour names                | 0.1.0 | `colorNames`, sorted                                                                |
| Colour as hex                        | 0.1.0 | `toHex`, lower case `#rrggbb`                                                       |
| Random colour                        | 0.1.0 | `randomColor`, `randomVividColor`                                                   |
| Inverse colours                      | 0.1.0 | `invert`, and the `inverted` property for LEDs wired so 255 is off                  |
| Brightness limit                     | 0.1.0 | `brightnessLimit`                                                                   |
| Blink, pulse and morph               | 0.1.0 | Cancellable with an `AbortSignal`                                                   |
| Reconnect after unplug               | 0.1.0 | Automatic, repaints the last frame. `DISCONNECTED` if it fails. Node needs a serial |
| `await using`                        | 0.1.0 | Where the runtime defines `Symbol.asyncDispose`                                     |

## Platforms

| Platform                         | Since               |
| -------------------------------- | ------------------- |
| Node on macOS                    | 0.1.0               |
| Node on Linux                    | 0.1.0               |
| Chrome or Edge on macOS (WebHID) | 0.1.0               |
| Chrome or Edge on Linux (WebHID) | 0.1.0               |
| Windows                          | n/a (not supported) |
| Firefox and Safari               | n/a (no WebHID)     |
