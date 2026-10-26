#!/bin/sh
# Packs the library, installs the tarball into a scratch project and imports
# every entry. Set SMOKE_HARDWARE=1 to also blink attached sticks green.
# npm honours npm_config_cache if set.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/blinkstick-smoke.XXXXXX")
trap 'rm -rf "$work"' EXIT

mkdir "$work/pack" "$work/project"
(cd "$root" && npm pack --pack-destination "$work/pack" >/dev/null)
tarball=$(ls "$work"/pack/*.tgz)

cd "$work/project"
npm init -y >/dev/null
npm i "$tarball" node-hid
node --input-type=module -e "await import('@bawdo/blinkstick'); await import('@bawdo/blinkstick/node'); await import('@bawdo/blinkstick/webhid'); console.log('smoke: imports ok')"

if [ "${SMOKE_HARDWARE:-}" = "1" ]; then
  node --input-type=module -e "
const { list, open } = await import('@bawdo/blinkstick/node');
for (const i of await list()) {
  const s = await open({ serial: i.serial });
  await s.blink({ r: 0, g: 255, b: 0 }, { period: 400, iterations: 2 });
  await s.close();
}
console.log('smoke: hardware ok');
"
fi
