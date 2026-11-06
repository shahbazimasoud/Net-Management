/**
 * Universal In-Memory & Stale-While-Revalidate (SWR) Data Cache Engine
 * Provides instant zero-delay data rendering, deduplication of concurrent in-flight requests,
 * and background revalidation for NetTopology views.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class UniversalDataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private defaultTtlMs = 60_000; // 1 minute default TTL

  /**
   * Retrieve cached data synchronously if available.
   * Does not check TTL - returns whatever is in cache for optimistic zero-delay UI rendering.
   */
  getOptimistic<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    return entry ? (entry.data as T) : undefined;
  }

  /**
   * Check if cache entry exists and is still strictly fresh within its TTL.
   */
  isFresh(key: string, ttlMs?: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    const maxAge = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    return Date.now() - entry.timestamp < maxAge;
  }

  /**
   * Directly write or update cache entry.
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Remove specific cache entry or prefix.
   */
  invalidate(keyOrPrefix: string): void {
    if (this.cache.has(keyOrPrefix)) {
      this.cache.delete(keyOrPrefix);
    } else {
      // Invalidate by prefix match
      for (const k of this.cache.keys()) {
        if (k.startsWith(keyOrPrefix)) {
          this.cache.delete(k);
        }
      }
    }
  }

  /**
   * Clear entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  /**
   * High-level query runner:
   * 1. Returns existing in-flight promise if a request for this key is already running (deduplication).
   * 2. If forceRefresh is false and cache is fresh, returns cached data immediately.
   * 3. Otherwise executes fetcher in background, updates cache, and cleans in-flight tracker.
   */
  async query<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: {
      ttlMs?: number;
      forceRefresh?: boolean;
    }
  ): Promise<T> {
    const ttlMs = options?.ttlMs !== undefined ? options.ttlMs : this.defaultTtlMs;
    const forceRefresh = Boolean(options?.forceRefresh);

    if (!forceRefresh && this.isFresh(key, ttlMs)) {
      return this.cache.get(key)!.data as T;
    }

    if (this.inFlight.has(key)) {
      return this.inFlight.get(key) as Promise<T>;
    }

    const promise = (async () => {
      try {
        const freshData = await fetcher();
        this.set(key, freshData);
        return freshData;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }
}

export const appDataCache = new UniversalDataCache();
