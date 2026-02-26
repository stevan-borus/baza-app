/**
 * Result type for async operations without throwing.
 * Use with {@link tryCatch} for consistent error handling per the throwing rule.
 */

/** Successful result: holds data, error is null. */
export type Success<T> = {
  data: T;
  error: null;
};

/** Failed result: holds error, data is null. */
export type Failure<E> = {
  data: null;
  error: E;
};

/** Discriminated union: either {@link Success} or {@link Failure}. */
export type Result<T, E = Error> = Success<T> | Failure<E>;

/**
 * Wraps a promise and returns a {@link Result} instead of throwing.
 * Check `result.error` to handle failures; then `result.data` is the value.
 */
export async function tryCatch<T, E = Error>(
  promise: Promise<T>,
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as E };
  }
}
