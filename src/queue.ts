/**
 * Returns a function that runs tasks one at a time, in call order. A task that
 * rejects does not stop the ones queued behind it.
 */
export function createQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}
