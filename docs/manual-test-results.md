# Manual hardware test results

Date:
Tester:
Library commit:
Chrome version:
Devices (serials):

Nothing here writes EEPROM: no check calls `setInfoBlock`, `setName` or `setMode`.

Mark each cell PASS, FAIL or SKIP, with a short note for anything other than PASS. Leave a cell
empty if it was not run.

## Browser test page (Chrome)

Run with `npm run build && npm run test:browser`, then open `http://localhost:5173`.

| #   | Check                                | macOS Nano | macOS Square | Linux Nano | Linux Square |
| --- | ------------------------------------ | ---------- | ------------ | ---------- | ------------ |
| 1   | Descriptor                           |            |              |            |              |
| 2   | Pair                                 |            |              |            |              |
| 3   | Raw report framing                   |            |              |            |              |
| 4   | Identity                             |            |              |            |              |
| 5   | LEDs                                 |            |              |            |              |
| 6   | Brightness limit and inverted        |            |              |            |              |
| 7   | Effects (blink, pulse, morph, abort) |            |              |            |              |
| 8   | Read only (name, mode, info block 2) |            |              |            |              |
| 9   | Two sticks (needs both named)        |            |              |            |              |
| 10  | Reconnect                            |            |              |            |              |

## Node hardware tests

Run with `npm run test:hardware`, with both sticks attached. The reconnect test needs
`BLINKSTICK_RECONNECT=1 npm run test:hardware` on one stick.

| Test                                        | macOS Nano | macOS Square | Linux Nano | Linux Square |
| ------------------------------------------- | ---------- | ------------ | ---------- | ------------ |
| Info has serial, version, release and model |            |              |            |              |
| Concurrent list and open (no crash or hang) |            |              |            |              |
| Frame round trip                            |            |              |            |              |
| Square: eight distinct colours              | n/a        |              | n/a        |              |
| setLed and getLed                           |            |              |            |              |
| Brightness limit                            |            |              |            |              |
| Inverted                                    |            |              |            |              |
| Effects                                     |            |              |            |              |
| Aborting a blink                            |            |              |            |              |
| Info blocks, name and mode, read only       |            |              |            |              |
| Names in `list` and `open({ name })`        |            |              |            |              |
| Report 10 probe (raw read, logged only)     | n/a        |              | n/a        |              |
| Two sticks at once (needs two attached)     |            |              |            |              |
| Reconnect (`BLINKSTICK_RECONNECT=1`)        |            |              |            |              |

## Raw descriptor output

From check 1 on the test page. Paste the log for each machine.

### macOS

```
```

### Linux

```
```

## Raw framing output

### WebHID (check 3: `receiveFeatureReport(6)`)

```
```

### node-hid (`getFeatureReport` for reports 2, 4 and 6, logged at the start of `npm run test:hardware`)

```
```

## Smoke pack hardware run

`SMOKE_HARDWARE=1 sh scripts/smoke-pack.sh` on macOS with both sticks attached.

```
```

## Notes
