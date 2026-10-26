// Manual hardware checks for the WebHID entry. Serve with
// `npm run build && npm run test:browser`, then open http://localhost:5173 in Chrome.
//
// EEPROM RULE: nothing here calls setInfoBlock, setName or setMode, because
// EEPROM wears with use. Reading names, modes and info blocks is fine. LED
// values live in RAM and cause no wear.
//
// No check holds a device open once it finishes: every check that opens a
// stick closes it at the end, so the next check (or another tab) can open it.

import { list, open, pair } from "../dist/webhid.js";

const RED = { r: 255, g: 0, b: 0 };
const GREEN = { r: 0, g: 255, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };
const WHITE = { r: 255, g: 255, b: 255 };
const OFF = { r: 0, g: 0, b: 0 };

const logEl = document.getElementById("log");
const buttons = [...document.querySelectorAll("button[data-check]")];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message) {
  const stamp = new Date().toISOString().slice(11, 23);
  const line = `${stamp} ${message}`;
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
  console.log(line);
}

function describeError(error) {
  const code = error?.code ? `${error.code}: ` : "";
  return `${error?.name ?? "Error"} ${code}${error?.message ?? String(error)}`;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Failures in the check now running. */
let failures = 0;

/** Logs PASS or FAIL for one expectation, and returns whether it held. */
function expect(label, actual, wanted) {
  const ok = same(actual, wanted);
  if (!ok) failures++;
  log(
    ok
      ? `PASS ${label}`
      : `FAIL ${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`,
  );
  return ok;
}

function filled(stick, color) {
  return Array.from({ length: stick.ledCount }, () => color);
}

function hexOf(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

/** Opens a stick, runs `fn`, then always turns it off and closes it. */
async function withStick(fn, options) {
  const stick = await open(options);
  try {
    return await fn(stick);
  } finally {
    await stick.off().catch(() => undefined);
    await stick.close().catch(() => undefined);
  }
}

/** Opens a stick, runs `fn` and closes it, without touching the LEDs. */
async function readOnly(fn, options) {
  const stick = await open(options);
  try {
    return await fn(stick);
  } finally {
    await stick.close().catch(() => undefined);
  }
}

function reportBytes(report) {
  const bits = (report.items ?? []).reduce(
    (sum, item) => sum + (item.reportSize ?? 0) * (item.reportCount ?? 0),
    0,
  );
  return bits / 8;
}

function logCollection(collection, depth) {
  const pad = "  ".repeat(depth + 1);
  log(
    `${pad}collection depth ${depth}: usagePage 0x${(collection.usagePage ?? 0).toString(16)} usage 0x${(collection.usage ?? 0).toString(16)}`,
  );
  for (const report of collection.featureReports ?? []) {
    log(
      `${pad}  feature report ${report.reportId}: ${reportBytes(report)} bytes (depth ${depth})`,
    );
  }
  for (const child of collection.children ?? []) {
    logCollection(child, depth + 1);
  }
}

async function pairedDevices() {
  return navigator.hid.getDevices();
}

const checks = {
  async descriptor() {
    const devices = await pairedDevices();
    log(`paired devices: ${devices.length}`);
    if (devices.length === 0) log("pair a stick first (check 2), then rerun");
    for (const device of devices) {
      log(`productName: ${device.productName}`);
      for (const collection of device.collections) logCollection(collection, 0);
    }
  },

  async pair() {
    const infos = await pair();
    log(`pair() returned ${infos.length} stick(s)`);
    for (const info of infos) log(`  ${JSON.stringify(info)}`);
  },

  async framing() {
    const devices = await pairedDevices();
    if (devices.length === 0) log("no paired devices: pair one first");
    for (const device of devices) {
      const wasOpen = device.opened;
      if (!wasOpen) await device.open();
      try {
        const view = await device.receiveFeatureReport(6);
        log(
          `${device.productName}: receiveFeatureReport(6) byteLength ${view.byteLength}, first byte ${view.byteLength > 0 ? view.getUint8(0) : "none"}`,
        );
        log(
          `  bytes: ${hexOf(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))}`,
        );
      } finally {
        if (!wasOpen) await device.close();
      }
    }
  },

  async identity() {
    await readOnly(async (stick) => {
      log(`info: ${JSON.stringify(stick.info)}`);
      log(`ledCount: ${stick.ledCount}`);
    });
  },

  async leds() {
    await withStick(async (stick) => {
      await stick.setAll(RED);
      log("watch: all LEDs red");
      await sleep(1500);
      expect(
        "getFrame matches red",
        await stick.getFrame(),
        filled(stick, RED),
      );
      await stick.setLed(1, BLUE);
      log("watch: LED 1 blue, the rest red");
      await sleep(1500);
      const frame = await stick.getFrame();
      const want = filled(stick, RED);
      want[1] = BLUE;
      expect("getFrame after setLed(1, blue)", frame, want);
      await stick.off();
      expect("getFrame after off", await stick.getFrame(), filled(stick, OFF));
    });
  },

  async brightness() {
    await withStick(async (stick) => {
      stick.brightnessLimit = 64;
      await stick.setAll(WHITE);
      log("watch: all LEDs dim white (limit 64)");
      await sleep(1500);
      expect(
        "limited frame",
        await stick.getFrame(),
        filled(stick, { r: 64, g: 64, b: 64 }),
      );
      stick.brightnessLimit = 255;
      try {
        stick.inverted = true;
        await stick.setAll(RED);
        log("watch: all LEDs cyan (red inverted)");
        await sleep(1500);
        expect(
          "inverted frame reads back as red",
          await stick.getFrame(),
          filled(stick, RED),
        );
      } finally {
        // While inverted, off() would write 255 and light the LEDs white.
        stick.inverted = false;
      }
    });
  },

  async effects() {
    await withStick(async (stick) => {
      log("watch: two white blinks");
      await stick.blink(WHITE, { period: 800, iterations: 2 });
      log("watch: one green pulse");
      await stick.pulse(GREEN, { duration: 2000 });
      log("watch: fade to blue");
      await stick.morph(BLUE, { duration: 2000 });
      expect("frame after morph", await stick.getFrame(), filled(stick, BLUE));
      await sleep(1000);

      log("watch: red blinking, aborted after 2.5 seconds");
      const controller = new AbortController();
      const blinking = stick
        .blink(RED, { period: 1000, iterations: 20, signal: controller.signal })
        .then(
          () => "resolved",
          (error) =>
            error === controller.signal.reason
              ? "aborted"
              : describeError(error),
        );
      await sleep(2500);
      controller.abort();
      expect("blink outcome after abort", await blinking, "aborted");
      await stick.setAll(GREEN);
      expect("stick still usable after abort", await stick.getLed(0), GREEN);
    });
  },

  async readOnlyChecks() {
    await readOnly(async (stick) => {
      log(`getName: ${JSON.stringify(await stick.getName())}`);
      log(`getMode: ${JSON.stringify(await stick.getMode())}`);
      const block = await stick.getInfoBlock(2);
      log(
        `getInfoBlock(2): ${hexOf(block)} (${JSON.stringify(new TextDecoder().decode(block))})`,
      );
    });
  },

  async twoSticks() {
    const named = await list({ names: true });
    for (const n of named) log(`  ${JSON.stringify(n)}`);
    const counts = new Map();
    for (const n of named) counts.set(n.name, (counts.get(n.name) ?? 0) + 1);
    const usable = named.filter(
      (n) => n.name !== "" && counts.get(n.name) === 1 && !n.busy,
    );
    if (usable.length < 2) {
      log(
        "needs two sticks with different stored names. This page never writes a name: set them with another tool, then rerun",
      );
      return;
    }
    const sticks = [];
    try {
      for (const n of usable) {
        const stick = await open({ name: n.name });
        sticks.push(stick);
        log(`opened ${JSON.stringify(n.name)}: ${JSON.stringify(stick.info)}`);
      }
      log("watch: both sticks red then blue, five times");
      for (let i = 0; i < 10; i++) {
        await Promise.all(
          sticks.map((s) => s.setAll(i % 2 === 0 ? RED : BLUE)),
        );
        await sleep(400);
      }
      const [first, ...rest] = sticks;
      await first.off();
      await first.close();
      sticks.shift();
      for (const s of rest) await s.setAll(GREEN);
      log("watch: the first stick is closed and dark, the rest are green");
      await sleep(1500);
      for (const s of rest) {
        expect("remaining stick frame", await s.getFrame(), filled(s, GREEN));
      }
    } finally {
      for (const s of sticks) {
        await s.off().catch(() => undefined);
        await s.close().catch(() => undefined);
      }
    }
  },

  async reconnect() {
    await withStick(async (stick) => {
      const orange = { r: 255, g: 80, b: 0 };
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error("gave up after 120 s")),
        120000,
      );
      log(
        `blinking orange. UNPLUG the stick now: ${stick.info.model}. Keep it out for a few seconds`,
      );
      let rejection;
      try {
        await stick.blink(orange, {
          period: 1000,
          iterations: 100,
          signal: controller.signal,
        });
        log(
          "OUTCOME: blink resolved (it ran to the end, so nothing was unplugged)",
        );
        failures++;
        return;
      } catch (error) {
        rejection = error;
        log(
          `OUTCOME: blink rejected, code ${error?.code ?? "none"}, message ${error?.message}`,
        );
      } finally {
        clearTimeout(timer);
      }
      if (rejection?.code !== "DISCONNECTED") {
        failures++;
        return;
      }
      log("PLUG IT BACK IN now (60 s)");
      let frame;
      let last;
      for (const end = Date.now() + 60000; Date.now() < end; ) {
        try {
          frame = await stick.getFrame();
          break;
        } catch (error) {
          last = error;
          await sleep(200);
        }
      }
      if (frame === undefined) {
        failures++;
        log(`OUTCOME: never recovered, last error ${describeError(last)}`);
        return;
      }
      log("OUTCOME: recovered, getFrame works again");
      // The blink was mid-cycle, so the last painted frame is orange or off.
      const matches =
        same(frame, filled(stick, orange)) || same(frame, filled(stick, OFF));
      log(
        `last frame read ${JSON.stringify(frame[0])}: ${matches ? "matches the last painted colour (orange or off)" : "does not match orange or off"}`,
      );
      if (!matches) failures++;
    });
  },
};

const labels = {
  descriptor: "1. Descriptor",
  pair: "2. Pair",
  framing: "3. Raw framing",
  identity: "4. Identity",
  leds: "5. LEDs",
  brightness: "6. Brightness and inverted",
  effects: "7. Effects",
  readOnlyChecks: "8. Read only",
  twoSticks: "9. Two sticks",
  reconnect: "10. Reconnect",
};

async function run(name) {
  for (const b of buttons) b.disabled = true;
  const label = labels[name] ?? name;
  log(`--- ${label} ---`);
  failures = 0;
  try {
    await checks[name]();
  } catch (error) {
    failures++;
    log(`error in ${label}: ${describeError(error)}`);
  } finally {
    log(failures === 0 ? `PASS ${label}` : `FAIL ${label} (${failures})`);
    for (const b of buttons) b.disabled = false;
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => run(button.dataset.check));
}

document.getElementById("copy").addEventListener("click", async () => {
  const text = `${navigator.userAgent}\n${logEl.textContent}`;
  try {
    await navigator.clipboard.writeText(text);
    log("results copied to the clipboard");
  } catch (error) {
    log(`copy failed (${describeError(error)}): select the log text by hand`);
  }
});

document.getElementById("clear").addEventListener("click", () => {
  logEl.textContent = "";
});

if (!("hid" in navigator)) {
  log("WebHID is unavailable: use Chrome or Edge on http://localhost");
}
