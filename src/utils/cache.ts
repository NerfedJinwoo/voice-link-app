// Cache utility for storing and retrieving data with TTL support

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const CACHE_PREFIX = 'voicelink_cache_';

export const cache = {
  set<T>(key: string, data: T, ttlMinutes: number = 30): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlMinutes * 60 * 1000,
    };
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch (e) {
      console.warn('Cache storage failed:', e);
    }
  },

  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(CACHE_PREFIX + key);
      if (!item) return null;

      const entry: CacheEntry<T> = JSON.parse(item);
      const isExpired = Date.now() - entry.timestamp > entry.ttl;

      if (isExpired) {
        this.remove(key);
        return null;
      }

      return entry.data;
    } catch (e) {
      console.warn('Cache retrieval failed:', e);
      return null;
    }
  },

  remove(key: string): void {
    localStorage.removeItem(CACHE_PREFIX + key);
  },

  clear(): void {
    Object.keys(localStorage)
      .filter(key => key.startsWith(CACHE_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  },

  // Get cache key for user-specific data
  userKey(userId: string, type: string): string {
    return `${userId}_${type}`;
  }
};

// Specific cache keys
export const CACHE_KEYS = {
  PROFILE: 'profile',
  CHAT_ROOMS: 'chat_rooms',
  FRIENDS: 'friends',
  MESSAGES: 'messages',
} as const;
