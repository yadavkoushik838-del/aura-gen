
const CACHE_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

const cache = new Map();

function clone(value) {
  return structuredClone(value);
}

export function getCachedGeneration(key) {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  // Refresh insertion order for least-recently-used eviction.
  cache.delete(key);
  cache.set(key, entry);

  return clone(entry.value);
}

export function cacheSuccessfulGeneration(key, result) {
  // Never cache simulated responses or fallback results.
  if (
    !key ||
    !result ||
    result.generatedBy !== "ollama"
  ) {
    return false;
  }

  // Replace an existing entry before inserting.
  cache.delete(key);

  // Remove expired entries.
  const now = Date.now();

  for (const [existingKey, entry] of cache) {
    if (now >= entry.expiresAt) {
      cache.delete(existingKey);
    }
  }

  // Evict least-recently-used entries when full.
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    cache.delete(oldestKey);
  }

  cache.set(key, {
    value: clone(result),
    expiresAt: now + CACHE_TTL_MS,
  });

  return true;
}

export function clearGenerationCache() {
  cache.clear();
}
