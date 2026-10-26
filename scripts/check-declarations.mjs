// Asserts the emitted declarations keep to their platform: `.` and `./node`
// (and every chunk they import) carry no WebHID/DOM-only types, `.` and
// `./webhid` carry no Node types, and the directives the build restores are
// present where they belong.
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(`dist/${name}`, "utf8");

function graph(entry) {
  const seen = new Map();
  const queue = [entry];
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    const text = read(name);
    seen.set(name, text);
    for (const m of text.matchAll(/from "\.\/([^"]+)\.js"/g)) {
      queue.push(`${m[1]}.d.ts`);
    }
  }
  return seen;
}

const webhidTypes = /w3c-web-hid|\bHID[A-Z]\w*/;
const nodeTypes = /node-hid|NodeJS|\bBuffer\b|reference types="node"/;
const failures = [];

function forbid(entry, pattern, label) {
  for (const [name, text] of graph(entry)) {
    const m = text.match(pattern);
    if (m) failures.push(`${entry}: ${name} has ${label} reference "${m[0]}"`);
  }
}

forbid("index.d.ts", webhidTypes, "WebHID");
forbid("node.d.ts", webhidTypes, "WebHID");
forbid("index.d.ts", nodeTypes, "Node");
forbid("webhid.d.ts", nodeTypes, "Node");

if (!read("webhid.d.ts").includes('<reference types="w3c-web-hid"')) {
  failures.push("webhid.d.ts is missing the w3c-web-hid directive");
}
const disposable = [...graph("index.d.ts")].filter(([, t]) =>
  t.includes("Symbol.asyncDispose"),
);
if (
  disposable.length === 0 ||
  disposable.some(([, t]) => !t.includes('<reference lib="esnext.disposable"'))
) {
  failures.push(
    "the chunk declaring Symbol.asyncDispose lacks the lib directive",
  );
}

if (failures.length > 0) {
  for (const f of failures) console.error(`check:declarations failed: ${f}`);
  process.exit(1);
}
console.log("check:declarations ok");
