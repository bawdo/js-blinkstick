import { readdir, readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "tsdown";

// The dts bundler drops triple-slash directives, even with preserve="true".
// Put back the ones the public declarations need: [Symbol.asyncDispose] needs
// the esnext.disposable lib (in whichever chunk declares it), and the WebHID
// entry needs @types/w3c-web-hid (in webhid.d.ts only, never a shared chunk).
// Throws if a directive finds no home, so a silent no-op cannot ship.
const LIB_DIRECTIVE =
  '/// <reference lib="esnext.disposable" preserve="true" />';
const WEBHID_DIRECTIVE =
  '/// <reference types="w3c-web-hid" preserve="true" />';

async function prepend(path: string, line: string): Promise<boolean> {
  const text = await readFile(path, "utf8");
  if (text.includes(line)) return true;
  await writeFile(path, `${line}\n${text}`);
  return true;
}

async function restoreDirectives(dir: string): Promise<void> {
  let libPlaced = 0;
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".d.ts")) continue;
    const path = `${dir}/${name}`;
    if ((await readFile(path, "utf8")).includes("Symbol.asyncDispose")) {
      await prepend(path, LIB_DIRECTIVE);
      libPlaced++;
    }
  }
  if (libPlaced === 0) {
    throw new Error(
      "no .d.ts declares Symbol.asyncDispose: lib directive not placed",
    );
  }
  const webhid = `${dir}/webhid.d.ts`;
  if (!(await readFile(webhid, "utf8").catch(() => "")).includes("HIDDevice")) {
    throw new Error(
      "dist/webhid.d.ts is missing or no longer mentions HIDDevice",
    );
  }
  await prepend(webhid, WEBHID_DIRECTIVE);
}

export default defineConfig({
  entry: ["src/index.ts", "src/webhid.ts", "src/node.ts"],
  format: "esm",
  platform: "neutral",
  dts: true,
  deps: { neverBundle: ["node-hid"] },
  clean: true,
  hooks: {
    "build:done": () => restoreDirectives("dist"),
  },
});
