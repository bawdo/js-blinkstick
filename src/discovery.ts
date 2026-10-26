import type { BlinkStickInfo } from "./blinkstick.js";
import { BlinkStick } from "./blinkstick.js";
import { BlinkStickError } from "./errors.js";
import type { Model } from "./models.js";
import type { Backend, Candidate, Identity, Transport } from "./transport.js";

/**
 * What a platform entry gives the shared discovery code: a backend, its model
 * detection rule and, where the platform has one, a stable key for reconnect.
 */
export interface Platform<H, I extends BlinkStickInfo> {
  backend: Backend<H>;
  /** Runs model detection. Throws UNSUPPORTED_MODEL when `hint` conflicts. */
  toInfo(identity: Identity, hint?: Model): I;
  /** Stable identity for reconnect: the serial in Node, absent in the browser. */
  key?(identity: Identity): string | undefined;
}

/** A stick's info with the name stored on it. */
export type NamedInfo<I> = I & {
  /** "" if none is set, or if `busy`. */
  name: string;
  /** The stick could not be opened, for example because another process holds it. */
  busy: boolean;
};

export interface OpenOptions {
  /** Opens the one stick whose stored name is exactly this. */
  name?: string;
  /** Opens the first stick whose identity this accepts. */
  match?: (identity: Identity) => boolean;
  /** The model to assume when detection says 'unknown'. */
  hint?: Model;
}

/** What reconnect remembers about the stick it lost. */
export interface Previous<H> {
  handle: H;
  key?: string;
  knownName?: string;
  model: Model;
  /** The hint the stick was opened with, so a hinted model can match again. */
  hint?: Model;
}

const HINTS: readonly Model[] = ["nano", "square"];

/**
 * The model hint rule, shared by every platform's `toInfo`. A hint is used
 * only when detection says 'unknown'. When detection succeeds and a hint
 * disagrees, this throws UNSUPPORTED_MODEL naming both.
 */
export function applyModelHint(detected: Model, hint?: Model): Model {
  if (hint === undefined) return detected;
  if (!HINTS.includes(hint)) {
    throw new TypeError(
      `blinkstick: unknown model hint ${String(hint)}, expected nano or square`,
    );
  }
  if (detected === "unknown") return hint;
  if (detected !== hint) {
    throw new BlinkStickError(
      "UNSUPPORTED_MODEL",
      `blinkstick: detected model ${detected} but the hint says ${hint}`,
    );
  }
  return detected;
}

/** Every attached stick, including unsupported models. */
export async function list<H, I extends BlinkStickInfo>(
  p: Platform<H, I>,
): Promise<I[]> {
  const candidates = await p.backend.list();
  return candidates.map((c) => p.toInfo(c.identity));
}

/**
 * Every attached stick with its name. Opens each stick in turn to read the
 * name and closes it again, so it is slower than `list`. Sticks it cannot
 * open, including any this process already has open, are listed as busy.
 */
export async function listNamed<H, I extends BlinkStickInfo>(
  p: Platform<H, I>,
): Promise<NamedInfo<I>[]> {
  const candidates = await p.backend.list();
  const named: NamedInfo<I>[] = [];
  for (const c of candidates) {
    const info = p.toInfo(c.identity);
    let transport: Transport;
    try {
      transport = await p.backend.open(c.handle);
    } catch {
      named.push({ ...info, name: "", busy: true });
      continue;
    }
    let name: string;
    try {
      name = await readName(transport, info);
    } catch (error) {
      throw new Error(`blinkstick: reading name of ${describe(c.identity)}`, {
        cause: error,
      });
    }
    named.push({ ...info, name, busy: false });
  }
  return named;
}

/**
 * Opens one stick: the first found, the first `match` accepts, or the one
 * named `name`. Refuses an unsupported model with UNSUPPORTED_MODEL, closing
 * what it opened. Reads no name unless `name` is given.
 */
export async function openStick<H, I extends BlinkStickInfo>(
  p: Platform<H, I>,
  options: OpenOptions = {},
): Promise<BlinkStick<I>> {
  const { name, match, hint } = options;
  if (name !== undefined && match !== undefined) {
    throw new TypeError("blinkstick: pass a name or a match, not both");
  }
  if (name !== undefined) return openByName(p, name, hint);
  const candidates = await p.backend.list();
  const found = match
    ? candidates.find((c) => match(c.identity))
    : candidates[0];
  if (!found) {
    throw new BlinkStickError("NOT_FOUND", "blinkstick: device not found");
  }
  return wrapHandle(p, found.handle, found.identity, hint);
}

/**
 * Opens `handle` and builds a stick from the identity the caller already has.
 * Refuses an unsupported model with UNSUPPORTED_MODEL before opening, so a
 * handle the caller had open is left as it was.
 */
export async function wrapHandle<H, I extends BlinkStickInfo>(
  p: Platform<H, I>,
  handle: H,
  identity: Identity,
  hint?: Model,
): Promise<BlinkStick<I>> {
  const info = p.toInfo(identity, hint);
  if (info.model === "unknown") throw unsupported(identity);
  const transport = await p.backend.open(handle);
  return build(p, handle, identity, info, transport, undefined, hint);
}

/**
 * Picks the candidate that replaces a lost stick, or undefined if none does.
 * With a platform key it matches by key only. Without one it tries the same
 * handle, then, if a name is known, the one stick of the same model with that
 * name and nothing else. Only with no known name does it fall back to the one
 * stick of the same model. Names are read only when a name is known.
 */
export async function findReplacement<H>(
  candidates: Candidate<H>[],
  previous: Previous<H>,
  p: Platform<H, BlinkStickInfo>,
  readName: (h: H) => Promise<string | undefined>,
): Promise<H | undefined> {
  if (p.key) {
    const { key } = previous;
    if (key === undefined) return undefined;
    return candidates.find((c) => p.key?.(c.identity) === key)?.handle;
  }
  const same = candidates.find((c) => c.handle === previous.handle);
  if (same) return same.handle;
  const sameModel = candidates.filter((c) =>
    isModel(p, c.identity, previous.model, previous.hint),
  );
  const { knownName } = previous;
  if (knownName !== undefined && knownName !== "") {
    const named: H[] = [];
    for (const c of sameModel) {
      if ((await readName(c.handle)) === knownName) named.push(c.handle);
    }
    return named.length === 1 ? named[0] : undefined;
  }
  return sameModel.length === 1 ? sameModel[0]?.handle : undefined;
}

/** Whether `identity` detects as `model`, with `hint` applied as on open. */
function isModel<H>(
  p: Platform<H, BlinkStickInfo>,
  identity: Identity,
  model: Model,
  hint: Model | undefined,
): boolean {
  try {
    return p.toInfo(identity, hint).model === model;
  } catch (error) {
    // A hint that conflicts with detection means another model.
    if (
      error instanceof BlinkStickError &&
      error.code === "UNSUPPORTED_MODEL"
    ) {
      return false;
    }
    throw error;
  }
}

/** Go's OpenName loop: reads every openable stick's name, keeps the match. */
async function openByName<H, I extends BlinkStickInfo>(
  p: Platform<H, I>,
  name: string,
  hint: Model | undefined,
): Promise<BlinkStick<I>> {
  if (name === "") {
    throw new BlinkStickError("NOT_FOUND", "blinkstick: empty name");
  }
  const candidates = await p.backend.list();
  const matches: { candidate: Candidate<H>; transport: Transport }[] = [];
  const readErrors: Error[] = [];
  for (const c of candidates) {
    let transport: Transport;
    try {
      transport = await p.backend.open(c.handle);
    } catch {
      continue;
    }
    let got: string;
    try {
      got = await readName(transport, p.toInfo(c.identity), true);
    } catch (error) {
      readErrors.push(
        new Error(`blinkstick: reading name of ${describe(c.identity)}`, {
          cause: error,
        }),
      );
      continue;
    }
    if (got === name) {
      matches.push({ candidate: c, transport });
    } else {
      await closeQuietly(transport);
    }
  }
  const [only] = matches;
  if (only === undefined) {
    const cause =
      readErrors.length === 0
        ? undefined
        : readErrors.length === 1
          ? readErrors[0]
          : new AggregateError(readErrors, "blinkstick: some names unreadable");
    throw new BlinkStickError(
      "NOT_FOUND",
      `blinkstick: no stick is named ${JSON.stringify(name)}`,
      cause === undefined ? undefined : { cause },
    );
  }
  if (matches.length > 1) {
    for (const m of matches) await closeQuietly(m.transport);
    const where = matches.map((m) => describe(m.candidate.identity));
    throw new BlinkStickError(
      "DUPLICATE_NAME",
      `blinkstick: ${JSON.stringify(name)} is on ${where.join(", ")}`,
    );
  }
  const { candidate, transport } = only;
  let info: I;
  try {
    info = p.toInfo(candidate.identity, hint);
  } catch (error) {
    await closeQuietly(transport);
    throw error;
  }
  return build(
    p,
    candidate.handle,
    candidate.identity,
    info,
    transport,
    name,
    hint,
  );
}

/**
 * Makes the stick a discovery call returns, with a reopen built from
 * findReplacement. Refuses an unknown model, closing the transport.
 */
async function build<H, I extends BlinkStickInfo>(
  p: Platform<H, I>,
  handle: H,
  identity: Identity,
  info: I,
  transport: Transport,
  knownName: string | undefined,
  hint: Model | undefined,
): Promise<BlinkStick<I>> {
  if (info.model === "unknown") {
    await closeQuietly(transport);
    throw unsupported(identity);
  }
  const key = p.key?.(identity);
  let current = handle;
  const reopen = async (name: string | undefined): Promise<Transport> => {
    const candidates = await p.backend.list();
    const found = await findReplacement(
      candidates,
      {
        handle: current,
        ...(key === undefined ? {} : { key }),
        ...(name === undefined ? {} : { knownName: name }),
        model: info.model,
        ...(hint === undefined ? {} : { hint }),
      },
      p,
      (h) => readNameOf(p, candidates, h),
    );
    if (found === undefined) {
      throw new BlinkStickError(
        "NOT_FOUND",
        "blinkstick: no replacement stick found",
      );
    }
    const next = await p.backend.open(found);
    current = found;
    return next;
  };
  return new BlinkStick({
    transport,
    info,
    reopen,
    ...(knownName === undefined ? {} : { knownName }),
  });
}

/** Opens a candidate to read its name, or undefined if it cannot. */
async function readNameOf<H, I extends BlinkStickInfo>(
  p: Platform<H, I>,
  candidates: Candidate<H>[],
  handle: H,
): Promise<string | undefined> {
  const c = candidates.find((x) => x.handle === handle);
  if (!c) return undefined;
  try {
    const transport = await p.backend.open(handle);
    return await readName(transport, p.toInfo(c.identity));
  } catch {
    return undefined;
  }
}

/**
 * Reads a stick's name through the core, on a temporary stick that cannot
 * reconnect. Closes the transport afterwards unless `keepOpen` is set and the
 * read succeeded.
 */
async function readName(
  transport: Transport,
  info: BlinkStickInfo,
  keepOpen = false,
): Promise<string> {
  const stick = new BlinkStick({ transport, info });
  try {
    const name = await stick.getName();
    if (!keepOpen) await closeQuietly(transport);
    return name;
  } catch (error) {
    await closeQuietly(transport);
    throw error;
  }
}

async function closeQuietly(transport: Transport): Promise<void> {
  try {
    await transport.close();
  } catch {
    // The transport is being dropped, so a failed close changes nothing.
  }
}

function unsupported(identity: Identity): BlinkStickError {
  return new BlinkStickError(
    "UNSUPPORTED_MODEL",
    `blinkstick: unsupported model: ${describe(identity)}${releaseText(identity)}`,
  );
}

function describe(identity: Identity): string {
  return identity.serial || identity.product;
}

function releaseText(identity: Identity): string {
  const { release } = identity;
  return release === undefined
    ? ""
    : ` (release 0x${release.toString(16).padStart(4, "0")})`;
}
