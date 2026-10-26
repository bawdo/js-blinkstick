/**
 * The slice of a HID device the driver needs. Report IDs are passed
 * separately, and `data` never includes the leading report ID.
 */
export interface Transport {
  sendFeatureReport(reportId: number, data: Uint8Array): Promise<void>;
  receiveFeatureReport(reportId: number, length: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** What a backend can tell about a device without opening it. */
export interface Identity {
  product: string;
  manufacturer: string;
  serial?: string;
  release?: number;
  featureReportIds?: readonly number[];
}

/** A device a backend found, with the handle needed to open it. */
export interface Candidate<H> {
  handle: H;
  identity: Identity;
}

/** Finds and opens BlinkSticks. One implementation per platform. */
export interface Backend<H> {
  list(): Promise<Candidate<H>[]>;
  open(handle: H): Promise<Transport>;
}

/**
 * Normalises a received report to data without the report ID. Some HID stacks
 * return the ID as byte 0, others do not.
 */
export function stripReportId(
  reportId: number,
  length: number,
  bytes: Uint8Array,
): Uint8Array {
  if (bytes.length === length + 1 && bytes[0] === reportId) {
    return bytes.subarray(1);
  }
  if (bytes.length === length) return bytes;
  throw new Error(
    `blinkstick: report ${reportId} expected ${length} bytes, got ${bytes.length}`,
  );
}
