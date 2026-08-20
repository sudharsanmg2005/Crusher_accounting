const locks = new Map();

/**
 * Ensures that async operations for a given entity key (e.g. "customer:123" or "buyer:456")
 * execute sequentially to avoid race conditions during balance recalculations.
 *
 * @param {string} key - Unique key representing the entity (e.g., customerId or buyerId)
 * @param {Function} fn - Async function to execute
 * @returns {Promise<any>}
 */
export const withEntityLock = async (key, fn) => {
  if (!key) {
    return fn();
  }

  const stringKey = String(key);
  const existingPromise = locks.get(stringKey) || Promise.resolve();

  let resolveNext;
  const nextPromise = new Promise((resolve) => {
    resolveNext = resolve;
  });

  // Chain the new task after the existing queue for this key
  locks.set(stringKey, existingPromise.then(() => nextPromise));

  try {
    const result = await fn();
    return result;
  } finally {
    resolveNext();
    // Cleanup key from map if queue is clear
    if (locks.get(stringKey) === nextPromise) {
      locks.delete(stringKey);
    }
  }
};
