import { PRODUCT_ID, VENDOR_ID } from "../protocol.js";
import type { Backend } from "../transport.js";
import { nodeTransport } from "./transport.js";

type NodeHid = typeof import("node-hid");

/**
 * Imports node-hid through `importer`, unwrapping a CJS default export. A
 * missing package becomes an install hint, and any other error passes through.
 */
export async function importHid(
  importer: () => Promise<unknown> = () => import("node-hid"),
): Promise<NodeHid> {
  try {
    const mod = (await importer()) as NodeHid & { default?: NodeHid };
    return "default" in mod && mod.default ? mod.default : mod;
  } catch (cause) {
    const code = (cause as { code?: string } | null)?.code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      throw new Error(
        "@bawdo/blinkstick/node needs node-hid: npm install node-hid",
        { cause },
      );
    }
    throw cause;
  }
}

let loading: Promise<NodeHid> | undefined;

/** Loads node-hid on first use and caches it. A failed load is retried. */
function loadHid(): Promise<NodeHid> {
  loading ??= importHid().catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

/**
 * The node-hid backend. The handle is the device path. Enumeration is
 * filtered by vendor and product ID so other devices' strings are never read.
 */
export const hidBackend: Backend<string> = {
  async list() {
    const hid = await loadHid();
    const devices = await hid.devicesAsync(VENDOR_ID, PRODUCT_ID);
    return devices.flatMap((d) =>
      d.path === undefined
        ? []
        : [
            {
              handle: d.path,
              identity: {
                product: d.product ?? "",
                manufacturer: d.manufacturer ?? "",
                ...(d.serialNumber === undefined
                  ? {}
                  : { serial: d.serialNumber }),
                release: d.release,
              },
            },
          ],
    );
  },
  async open(path) {
    const hid = await loadHid();
    return nodeTransport(await hid.HIDAsync.open(path));
  },
};
