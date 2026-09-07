'use strict';

const EventEmitter = require('events');

/**
 * Converts a Redis glob pattern to a JavaScript RegExp.
 * Supports *, ?, [abc], [a-z], \x
 */
function globToRegex(pattern) {
  let regex = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      regex += '.*';
    } else if (c === '?') {
      regex += '.';
    } else if (c === '[') {
      let j = i + 1;
      let charClass = '[';
      if (j < pattern.length && pattern[j] === '!') {
        charClass += '^';
        j++;
      }
      while (j < pattern.length && pattern[j] !== ']') {
        charClass += pattern[j];
        j++;
      }
      charClass += ']';
      regex += charClass;
      i = j;
    } else if ('\\.+^$()|{}'.includes(c)) {
      regex += '\\' + c;
    } else {
      regex += c;
    }
    i++;
  }
  regex += '$';
  return new RegExp(regex);
}

class SingleDB extends EventEmitter {
  constructor(index = 0) {
    super();
    this.index = index;
    this.entries = new Map(); // key -> { type: string, value: any }
    this.expirations = new Map(); // key -> expiry timestamp (ms)
  }

  isExpired(key) {
    const expiresAt = this.expirations.get(key);
    if (expiresAt === undefined) {
      return false;
    }
    if (Date.now() >= expiresAt) {
      this.deleteKey(key, false);
      return true;
    }
    return false;
  }

  getEntry(key) {
    if (this.isExpired(key)) {
      return null;
    }
    return this.entries.get(key) || null;
  }

  setEntry(key, type, value, ttlMs = null) {
    this.entries.set(key, { type, value });
    if (ttlMs !== null && ttlMs !== undefined) {
      this.expirations.set(key, Date.now() + ttlMs);
    } else {
      this.expirations.delete(key);
    }
    this.emit('key:modified', key);
  }

  deleteKey(key, emitEvent = true) {
    this.expirations.delete(key);
    const existed = this.entries.delete(key);
    if (existed && emitEvent) {
      this.emit('key:modified', key);
    }
    return existed ? 1 : 0;
  }

  hasKey(key) {
    if (this.isExpired(key)) {
      return false;
    }
    return this.entries.has(key);
  }

  getType(key) {
    const entry = this.getEntry(key);
    return entry ? entry.type : 'none';
  }

  getTTL(key) {
    if (!this.hasKey(key)) return -2;
    const expiresAt = this.expirations.get(key);
    if (expiresAt === undefined) return -1;
    const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
    return remaining >= 0 ? remaining : -2;
  }

  getPTTL(key) {
    if (!this.hasKey(key)) return -2;
    const expiresAt = this.expirations.get(key);
    if (expiresAt === undefined) return -1;
    const remaining = expiresAt - Date.now();
    return remaining >= 0 ? remaining : -2;
  }

  setExpire(key, ttlMs) {
    if (!this.hasKey(key)) return 0;
    this.expirations.set(key, Date.now() + ttlMs);
    return 1;
  }

  setExpireAt(key, timestampMs) {
    if (!this.hasKey(key)) return 0;
    this.expirations.set(key, timestampMs);
    return 1;
  }

  persist(key) {
    if (!this.hasKey(key)) return 0;
    if (this.expirations.has(key)) {
      this.expirations.delete(key);
      return 1;
    }
    return 0;
  }

  rename(oldKey, newKey) {
    const entry = this.getEntry(oldKey);
    if (!entry) {
      throw new Error('ERR no such key');
    }
    const expiresAt = this.expirations.get(oldKey);
    this.deleteKey(oldKey);

    this.entries.set(newKey, entry);
    if (expiresAt !== undefined) {
      this.expirations.set(newKey, expiresAt);
    }
    this.emit('key:modified', newKey);
  }

  keys(pattern = '*') {
    const regex = globToRegex(pattern);
    const matched = [];
    for (const key of this.entries.keys()) {
      if (!this.isExpired(key) && regex.test(key)) {
        matched.push(key);
      }
    }
    return matched;
  }

  dbsize() {
    let count = 0;
    for (const key of this.entries.keys()) {
      if (!this.isExpired(key)) {
        count++;
      }
    }
    return count;
  }

  flush() {
    this.entries.clear();
    this.expirations.clear();
    this.emit('flush');
  }

  activeExpireCycle(sampleLimit = 20) {
    if (this.expirations.size === 0) return;
    const now = Date.now();
    let sampled = 0;
    let expired = 0;

    for (const [key, expiresAt] of this.expirations.entries()) {
      sampled++;
      if (now >= expiresAt) {
        this.deleteKey(key, true);
        expired++;
      }
      if (sampled >= sampleLimit) break;
    }

    // If more than 25% sampled were expired, repeat immediately
    if (sampled > 0 && expired / sampled > 0.25) {
      this.activeExpireCycle(sampleLimit);
    }
  }

  dump() {
    const data = {};
    const now = Date.now();
    for (const [k, entry] of this.entries.entries()) {
      if (this.isExpired(k)) continue;
      const exp = this.expirations.get(k);
      const remainingMs = exp ? Math.max(0, exp - now) : null;
      let serializedVal = entry.value;

      if (entry.type === 'list') {
        serializedVal = entry.value.items;
      } else if (entry.type === 'set') {
        serializedVal = Array.from(entry.value.members);
      } else if (entry.type === 'hash') {
        serializedVal = Object.fromEntries(entry.value.fields);
      } else if (entry.type === 'zset') {
        serializedVal = entry.value.sorted;
      } else if (entry.type === 'stream') {
        serializedVal = entry.value.entries;
      }

      data[k] = {
        type: entry.type,
        value: serializedVal,
        ttl: remainingMs,
      };
    }
    return data;
  }
}

class Datastore {
  constructor(numDbs = 16) {
    this.dbs = new Map();
    for (let i = 0; i < numDbs; i++) {
      this.dbs.set(i, new SingleDB(i));
    }
  }

  getDB(index = 0) {
    const idx = parseInt(index, 10);
    if (isNaN(idx) || idx < 0 || idx >= this.dbs.size) {
      throw new Error('ERR DB index is out of range');
    }
    return this.dbs.get(idx);
  }

  flushAll() {
    for (const db of this.dbs.values()) {
      db.flush();
    }
  }

  activeExpireCycle() {
    for (const db of this.dbs.values()) {
      db.activeExpireCycle();
    }
  }
}

module.exports = {
  SingleDB,
  Datastore,
  globToRegex,
};
