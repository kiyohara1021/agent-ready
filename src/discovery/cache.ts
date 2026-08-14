import type { RepositoryContext } from "../core/repository-context.js";

/**
 * Memoizes discovery work per {@link RepositoryContext}.
 *
 * Several detectors ask the same questions ("what documentation exists?",
 * "which scripts are defined?"). Discovery should do that work once per
 * analysis rather than once per detector. Keying on the context object means
 * the cache lives exactly as long as the analysis does, and two analyses of the
 * same repository never share state.
 */
export function perContext<T>(
  compute: (context: RepositoryContext) => Promise<T>,
): (context: RepositoryContext) => Promise<T> {
  const cache = new WeakMap<RepositoryContext, Promise<T>>();

  return (context) => {
    const cached = cache.get(context);
    if (cached !== undefined) return cached;

    const pending = compute(context);
    cache.set(context, pending);
    return pending;
  };
}
