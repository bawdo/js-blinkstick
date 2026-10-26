# Manual hardware test results

Date: 2026-10-26
Tester: Keith Bawden
Library commit: 7d348b1
Chrome version: 155.0.0.0 (macOS); Linux version not recorded
Devices (serials): Nano BS072777-3.0 (release 0x0202), Square BS073788-3.1 (release 0x0201)

Nothing here writes EEPROM: no check calls `setInfoBlock`, `setName` or `setMode`.

Mark each cell PASS, FAIL or SKIP, with a short note for anything other than PASS. Leave a cell
empty if it was not run.

## Browser test page (Chrome)

Run with `npm run build && npm run test:browser`, then open `http://localhost:5173`.

| #   | Check                                | macOS Nano       | macOS Square | Linux Nano | Linux Square |
| --- | ------------------------------------ | ---------------- | ------------ | ---------- | ------------ |
| 1   | Descriptor                           | PASS             | PASS         | PASS       | PASS         |
| 2   | Pair                                 | PASS             | PASS         | PASS       | PASS         |
| 3   | Raw report framing                   | PASS             | PASS         | PASS       | PASS         |
| 4   | Identity                             | PASS             |              | PASS       |              |
| 5   | LEDs                                 | PASS, see note 3 |              | PASS       |              |
| 6   | Brightness limit and inverted        | PASS             |              | PASS       |              |
| 7   | Effects (blink, pulse, morph, abort) | PASS             |              | PASS       |              |
| 8   | Read only (name, mode, info block 2) | PASS, see note 4 |              | PASS       |              |
| 9   | Two sticks (needs both named)        | PASS             | PASS         | PASS       | PASS         |
| 10  | Reconnect                            | PASS             |              | PASS       |              |

## Node hardware tests

Run with `npm run test:hardware`, with both sticks attached. The reconnect test needs
`BLINKSTICK_RECONNECT=1 npm run test:hardware` on one stick.

| Test                                        | macOS Nano       | macOS Square | Linux Nano | Linux Square |
| ------------------------------------------- | ---------------- | ------------ | ---------- | ------------ |
| Info has serial, version, release and model | PASS             | PASS         | PASS       | PASS         |
| Concurrent list and open (no crash or hang) | PASS             | PASS         | PASS       | PASS         |
| Frame round trip                            | PASS             | PASS         | PASS       | PASS         |
| Square: eight distinct colours              | n/a              | PASS         | n/a        | PASS         |
| setLed and getLed                           | PASS             | PASS         | PASS       | PASS         |
| Brightness limit                            | PASS             | PASS         | PASS       | PASS         |
| Inverted                                    | PASS             | PASS         | PASS       | PASS         |
| Effects                                     | PASS             | PASS         | PASS       | PASS         |
| Aborting a blink                            | PASS             | PASS         | PASS       | PASS         |
| Info blocks, name and mode, read only       | PASS             | PASS         | PASS       | PASS         |
| Names in `list` and `open({ name })`        | PASS             | PASS         | PASS       | PASS         |
| Report 10 probe (raw read, logged only)     | n/a              | PASS         | n/a        | PASS         |
| Two sticks at once (needs two attached)     | PASS             | PASS         | PASS       | PASS         |
| Reconnect (`BLINKSTICK_RECONNECT=1`)        | PASS, see note 2 |              | PASS       |              |

## Raw descriptor output

From check 1 on the test page. Paste the log for each machine.

### macOS

```
Both sticks: one top-level collection, usagePage 0xff00, usage 0x1.
Feature report sizes (data bytes, ID excluded):
  1=3, 2=32, 3=32, 4=1, 5=5, 6=25, 7=49, 8=97, 9=193
  10=2 (Square only; the Nano declares 1..9)
```

### Linux

```
Check 1 passed on both sticks. The raw log was not kept.
```

## Raw framing output

### WebHID (check 3: `receiveFeatureReport(6)`)

```
macOS, both sticks: 26 bytes, first byte 6 (ID + 25).
macOS Nano, DevTools reads of the other reports:
  report 2: 34 bytes  02 6e 61 6e 6f 00 ...  (ID + 33, name "nano")
  report 3: 34 bytes  03 00 ...              (ID + 33)
  report 4:  2 bytes  04 02
  report 6: 26 bytes  06 00 ...
Linux: check 3 passed on both sticks. The raw log was not kept.
```

### node-hid (`getFeatureReport` for reports 2, 4 and 6, logged at the start of `npm run test:hardware`)

```
macOS, asked for length + 1:
  Square report 2:  33 bytes  02 73 71 75 61 72 65 00 ...  ("square")
  Square report 4:   2 bytes  04 02
  Square report 6:  26 bytes  06 00 ...
  Square report 10:  3 bytes  0a 00 00
  Nano report 2:    33 bytes  02 6e 61 6e 6f 00 ...  ("nano")
  Nano report 4:     2 bytes  04 02
  Nano report 6:    26 bytes  06 00 ...
  Nano report 10:    0 bytes
Linux: all Node hardware tests passed. The raw log was not kept.
```

## Smoke pack hardware run

`SMOKE_HARDWARE=1 sh scripts/smoke-pack.sh` on macOS with both sticks attached.

```
imports ok
hardware ok
Tarball: 12 files, 20.6 kB. node-hid loaded from its prebuild, even with npm 11.20 skipping its install script.
```

## Notes

1. Browser checks 4 to 8 and 10 drive the first paired stick, which was the Nano on both machines.
   Check 9 drives both sticks.
2. Reconnect was run on the Nano. On macOS, about one replug in four left the Nano missing at the
   OS level: neither the open process nor a fresh one listed it. That is not a library fault, and
   a clean replug passed. The browser reconnect showed the last frame as off, not orange, because
   the blink was mid-cycle when the stick was pulled.
3. The first macOS run of check 5 failed falsely. The page compared colours with
   `JSON.stringify`, and `getFrame` returned `{g, r, b}`. Both were fixed in a810c0a, and the
   rerun passed.
4. The first macOS run of check 8 failed with "report 2 expected 32 bytes, got 34". Chrome
   returns one byte more than the descriptor declares for reports 2 and 3 (see the raw framing
   above). node-hid hides this because it sizes the buffer at length + 1. The framing rule was
   widened in 7d348b1: when a report starts with its ID and runs longer than its length, the
   `length` bytes after the ID are taken. The rerun passed.
5. On macOS the first Node run failed with "exclusive access and device already open" on the
   Nano, because Chrome (the Blinky extension) was holding it. With Chrome quit, everything passed.
6. On Linux the Square at first didn't show up in the browser chooser. The cause was a faulty
   cable. With the cable replaced, every Node and browser check passed on both sticks.
7. Nothing in these runs wrote EEPROM.
