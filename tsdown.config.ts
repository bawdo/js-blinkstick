import { readdir, readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "tsdown";

// The dts bundler drops triple-slash directives, even with preserve="true".
// Put back the ones the public declarations need: [Symbol.asyncDispose] needs
// the esnext.disposable lib, and the WebHID API needs @types/w3c-web-hid.
const directives: { marker: string; line: string }[] = [
  {
    marker: "Symbol.asyncDispose",
    line: '/// <reference lib="esnext.disposable" preserve="true" />',
  },
  {
    marker: "HIDDevice",
    line: '/// <reference types="w3c-web-hid" preserve="true" />',
  },
];

async function restoreDirectives(dir: string): Promise<void> {
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".d.ts")) continue;
    const path = `${dir}/${name}`;
    const text = await readFile(path, "utf8");
    const lines = directives
      .filter((d) => text.includes(d.marker) && !text.includes(d.line))
      .map((d) => d.line);
    if (lines.length > 0) await writeFile(path, `${lines.join("\n")}\n${text}`);
  }
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
