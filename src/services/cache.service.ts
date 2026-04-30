import { createHash } from 'crypto';
import { config } from '../config';
import { logger } from '../middleware/logger';
import { buildItineraryCacheKey } from '../utils/cacheKey';

export const CACHE_TTL_SECONDS = {
  itinerary: 60 * 60 * 24,
  weather: 60 * 30,
  place: 60 * 60 * 24 * 30,
  route: 60 * 60 * 24 * 7,
  aiDeterministic: 60 * 60 * 24,
} as const;

interface CacheStore {
  readonly name: 'redis' | 'memory';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  isAvailable(): boolean;
}

class MemoryCacheStore implements CacheStore {
  readonly name = 'memory' as const;
  private readonly values = new Map<string, { value: string; expiresAt: number }>();
  private available = false;

  async connect(): Promise<void> {
    this.available = true;
    logger.info({ event: 'cache_store_connected', backend: this.name });
  }

  async disconnect(): Promise<void> {
    this.available = false;
    this.values.clear();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  isAvailable(): boolean {
    return this.available;
  }
}

class RedisReadyCacheStore implements CacheStore {
  readonly name = 'redis' as const;

  async connect(): Promise<void> {
    logger.warn({
      event: 'redis_backend_not_configured',
      message: 'Redis backend shape is present, but no Redis client dependency is installed. Falling back to degraded cache.',
    });
  }

  async disconnect(): Promise<void> {}

  async get(key: string): Promise<string | null> {
    logger.debug({ event: 'redis_get_skipped', key });
    return null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    logger.debug({ event: 'redis_set_skipped', key, valueBytes: value.length, ttlSeconds });
  }

  async del(key: string): Promise<void> {
    logger.debug({ event: 'redis_del_skipped', key });
  }

  isAvailable(): boolean {
    return false;
  }
}

class CacheService {
  private readonly store: CacheStore;

  constructor(store: CacheStore = config.CACHE_BACKEND === 'memory' ? new MemoryCacheStore() : new RedisReadyCacheStore()) {
    this.store = store;
  }

  async connect(): Promise<void> {
    await this.store.connect();
  }

  async disconnect(): Promise<void> {
    await this.store.disconnect();
  }

  buildKey(inputs: Parameters<typeof buildItineraryCacheKey>[0]): string {
    return buildItineraryCacheKey(inputs);
  }

  key(namespace: keyof typeof CACHE_TTL_SECONDS | string, parts: Record<string, unknown>): string {
    const digest = createHash('sha256').update(JSON.stringify(this.sortObject(parts))).digest('hex').slice(0, 24);
    return `${namespace}:${digest}`;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.store.isAvailable()) return null;

    try {
      const value = await this.store.get(key);
      if (!value) {
        logger.info({ event: 'cache_miss', key, backend: this.store.name });
        return null;
      }

      logger.info({ event: 'cache_hit', key, backend: this.store.name });
      return JSON.parse(value) as T;
    } catch (err) {
      logger.warn({ event: 'cache_get_failed', key, backend: this.store.name, message: String(err) });
      return null;
    }
  }

  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async set(key: string, value: unknown, ttlSeconds = CACHE_TTL_SECONDS.itinerary): Promise<void> {
    if (!this.store.isAvailable()) return;

    try {
      await this.store.set(key, JSON.stringify(value), ttlSeconds);
      logger.info({ event: 'cache_set', key, backend: this.store.name, ttlSeconds });
    } catch (err) {
      logger.warn({ event: 'cache_set_failed', key, backend: this.store.name, message: String(err) });
    }
  }

  async invalidate(key: string): Promise<void> {
    if (!this.store.isAvailable()) return;

    try {
      await this.store.del(key);
      logger.info({ event: 'cache_invalidated', key, backend: this.store.name });
    } catch (err) {
      logger.warn({ event: 'cache_invalidate_failed', key, backend: this.store.name, message: String(err) });
    }
  }

  isAvailable(): boolean {
    return this.store.isAvailable();
  }

  backend(): string {
    return this.store.name;
  }

  private sortObject(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortObject(item));
    if (!value || typeof value !== 'object') return value;

    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = this.sortObject((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
}

export const cacheService = new CacheService();
