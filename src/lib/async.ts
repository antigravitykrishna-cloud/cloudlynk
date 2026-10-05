/**
 * Races a thenable against a timeout so a stalled network/auth call can never
 * hang the UI indefinitely. Rejects with `message` if `ms` elapses first.
 */
export function withTimeout<T>(thenable: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(thenable).then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
