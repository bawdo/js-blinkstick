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
 * Normalises a received report to exactly `length` data bytes, without the
 * report ID. Three shapes are accepted:
 *
 * - exactly `length` bytes: the stack stripped the ID, returned unchanged
 *   (checked first, so a buffer of `length` bytes whose first byte happens to
 *   equal the ID is still "no ID");
 * - longer than `length` with the ID as byte 0: the ID is dropped and the
 *   next `length` bytes are returned, ignoring any trailing bytes. Some
 *   devices return more than the descriptor declares (seen on reports 2 and 3
 *   in Chrome on macOS, which return ID plus 33 bytes against a declared 32);
 * - anything else (shorter than `length`, or longer with a first byte that is
 *   not the ID) throws.
 *
 * One case is ambiguous: a report that arrives without its ID, longer than
 * `length`, whose first data byte equals the ID, is mis-stripped. It has never
 * been seen, and the older rule (which took only `length + 1` bytes) had the
 * same ambiguity at that length.
 */
export function stripReportId(
  reportId: number,
  length: number,
  bytes: Uint8Array,
): Uint8Array {
  if (bytes.length === length) return bytes;
  if (bytes.length > length && bytes[0] === reportId) {
    return bytes.subarray(1, length + 1);
  }
  throw new Error(
    `blinkstick: report ${reportId} expected ${length} bytes, got ${bytes.length}`,
  );
}
