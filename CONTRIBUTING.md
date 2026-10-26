# Contributing

Thanks for helping. Bug reports, fixes and support for more BlinkStick
models are all welcome.

## Before you start

For anything bigger than a small fix, open an issue or a discussion first,
so we can agree on the approach before you spend time on it. Report
security problems privately, as [SECURITY.md](SECURITY.md) describes.

## Setting up

You need Node 22 or later.

```sh
npm ci
npm test               # unit tests, no hardware
npm run lint
npm run typecheck
npm run build
npm run check:package
npm run check:bundle
npm run check:types
```

CI runs all of these on macOS and Linux with Node 22 and 24, and a pull
request needs them to pass before it can merge.

## Hardware

`npm run test:hardware` drives real sticks, and `npm run test:browser`
serves a page for manual WebHID checks. Neither is needed for most changes.

Automated tests must never write EEPROM on a real stick: no `setName`,
`setInfoBlock` or `setMode` against hardware. EEPROM wears out, and a
contributor's stick is theirs.

## Changes

- Keep a change to one concern, with tests for new behaviour. The core is
  tested against an in-memory fake, so most tests need no hardware.
- Keep protocol knowledge in the core. The Node and WebHID adapters only
  send and receive feature reports.
- Update `CHANGELOG.md` under a heading for the next version, and README or
  CAPABILITIES.md if behaviour changes.
- Write commit subjects and pull request titles in the past tense, 60
  characters or fewer, for example "Added Strip support". Pull requests are
  squash merged, so the title becomes the commit on `main`.

## Licence

By contributing, you agree that your contribution is licensed under the MIT
licence in [LICENSE](LICENSE).
