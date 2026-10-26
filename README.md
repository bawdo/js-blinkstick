# @bawdo/blinkstick

[![CI](https://github.com/bawdo/js-blinkstick/actions/workflows/ci.yml/badge.svg)](https://github.com/bawdo/js-blinkstick/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@bawdo/blinkstick)](https://www.npmjs.com/package/@bawdo/blinkstick)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/bawdo/js-blinkstick/badge)](https://scorecard.dev/viewer/?uri=github.com/bawdo/js-blinkstick)

Drive BlinkStick Nano and Square USB LEDs from the browser (WebHID) and from Node (node-hid).

This package is unofficial. It is not made by, or affiliated with, Agile Innovative, the makers
of BlinkStick. See [CAPABILITIES.md](CAPABILITIES.md) for what it supports.

## Install

```sh
# Node (node-hid is an optional peer dependency)
npm i @bawdo/blinkstick node-hid

# Browser (Chrome or Edge, no node-hid)
npm i @bawdo/blinkstick
```

Node 22 or later. Import from `@bawdo/blinkstick/node` or `@bawdo/blinkstick/webhid`.

## Quick start: Node

```js
import { open } from "@bawdo/blinkstick/node";

const stick = await open();
try {
  await stick.setAll({ r: 255, g: 0, b: 0 });
  await stick.pulse({ r: 0, g: 255, b: 0 }, { duration: 1000, iterations: 2 });
} finally {
  await stick.close();
}
```

`await using stick = await open();` also works on Node 24+ or in TypeScript.

## Quick start: browser

Pair from a click, then open. Pairing persists, so later visits can skip `pair()`.

```js
import { open, pair, parseColor } from "@bawdo/blinkstick/webhid";

button.onclick = async () => {
  await pair();
  const stick = await open();
  await stick.blink(parseColor("orange"), { iterations: 3 });
  await stick.close();
};
```

Colours are `{ r, g, b }`. `parseColor` takes hex, `r,g,b` or a CSS name.

## More than one stick

```js
import { list, open } from "@bawdo/blinkstick/node";

for (const info of await list()) console.log(info.serial, info.model);

const desk = await open({ serial: "BS072777-3.0" });
```

Give a stick a name once with `setName("desk")`, then `open({ name: "desk" })`. In the browser
there are no serials, so names are how you tell sticks apart. `list({ names: true })` adds each
name, and marks sticks something else holds as `busy`.

## Good to know

- `setInfoBlock`, `setName` and `setMode` write the stick's EEPROM, which wears out. Call them
  rarely. Nothing else writes it.
- macOS opens sticks exclusively. If another app (for example Chrome with the Blinky extension)
  holds a stick, `open` fails with "exclusive access".
- npm 11 may warn that node-hid's install script was skipped. That is harmless: node-hid loads
  its shipped prebuild.
- The types reference `esnext.disposable` (for `await using`), which adds the disposable globals
  to your type checking.
- In the browser `manufacturer` is always "", because WebHID exposes no manufacturer string.
  Detection uses the product string and descriptor, so pass `model: "nano"` or `"square"` to
  `open` if a stick comes up unknown.
- A Node stick with no serial cannot be reconnected.
- On macOS a replugged stick occasionally fails to re-enumerate at the OS level. Replug it again.
- In an MV3 service worker, open the stick, use it, and close it within the same event. Do not
  hold it open across events. Pair from a page, not the worker.
- If a stick is unplugged, the next call reopens it and repaints the last colours. If it is still
  missing you get `BlinkStickError` with code `DISCONNECTED`.
- Set `stick.brightnessLimit` (0 to 255) to cap brightness. A Square at full white draws about
  500 mA.

## Linux

Sticks are owned by root by default, so opening one needs a udev rule. Install the one shipped in
the package:

```sh
sudo cp node_modules/@bawdo/blinkstick/udev/60-blinkstick.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
```

Then unplug and replug the stick (or reboot). This grants access to whoever is logged in at the
desktop (via systemd-logind's `uaccess`), so no group membership is needed. It covers the browser
too.

## Development

```sh
npm test               # unit tests, no hardware
npm run lint
npm run typecheck
npm run build
npm run test:hardware  # needs real sticks; never writes EEPROM
npm run test:browser   # local page for manual WebHID checks
```

Automated tests must never write EEPROM on a real stick.

## Versioning

Releases follow [semantic versioning](https://semver.org/). Until 1.0.0 the API may change
between minor releases. See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT. See [LICENSE](LICENSE).
