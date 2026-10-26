// Fails if a browser bundle of the WebHID entry pulls in node-hid.
import { build } from "esbuild";

const result = await build({
  stdin: {
    contents: "import { open } from './dist/webhid.js'; console.log(open);",
    resolveDir: process.cwd(),
    loader: "js",
  },
  platform: "browser",
  bundle: true,
  write: false,
  external: ["node-hid"], // left as an import so the check below sees it
  format: "esm",
  logLevel: "silent",
});

const output = result.outputFiles.map((f) => f.text).join("\n");
if (output.includes("node-hid")) {
  console.error("check:bundle failed: the browser bundle references node-hid");
  process.exit(1);
}
console.log("check:bundle ok: no node-hid in the browser bundle");
