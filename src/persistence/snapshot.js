'use strict';

const fs = require('fs');
const path = require('path');
const { RedisList, RedisSet, RedisHash, RedisSortedSet } = require('../datastore/data_types');

class PersistenceManager {
  constructor(datastore, filePath) {
    this.datastore = datastore;
    this.filePath = filePath ? path.resolve(filePath) : null;
    this.lastSaveTime = Math.floor(Date.now() / 1000);
  }

  load() {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(content);

      for (const [dbIndexStr, dbData] of Object.entries(data)) {
        const dbIndex = parseInt(dbIndexStr, 10);
        const db = this.datastore.getDB(dbIndex);

        for (const [key, item] of Object.entries(dbData)) {
          let value;
          if (item.type === 'string') {
            value = String(item.value);
          } else if (item.type === 'list') {
            value = new RedisList(item.value);
          } else if (item.type === 'set') {
            value = new RedisSet(item.value);
          } else if (item.type === 'hash') {
            const hash = new RedisHash();
            for (const [f, v] of Object.entries(item.value)) {
              hash.set(f, v);
            }
            value = hash;
          } else if (item.type === 'zset') {
            const zset = new RedisSortedSet();
            for (const zItem of item.value) {
              zset.add(zItem.score, zItem.member);
            }
            value = zset;
          }

          if (value !== undefined) {
            db.setEntry(key, item.type, value, item.ttl);
          }
        }
      }
    } catch (err) {
      console.error(`[Persistence] Error loading snapshot from ${this.filePath}:`, err.message);
    }
  }

  save(fallbackPath = './redis-dump.json') {
    if (!this.filePath) {
      this.filePath = path.resolve(fallbackPath);
    }

    try {
      const dump = {};
      for (const [dbIndex, db] of this.datastore.dbs.entries()) {
        const dbDump = db.dump();
        if (Object.keys(dbDump).length > 0) {
          dump[dbIndex] = dbDump;
        }
      }

      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(dump, null, 2), 'utf8');
      fs.renameSync(tempPath, this.filePath);
      this.lastSaveTime = Math.floor(Date.now() / 1000);
    } catch (err) {
      console.error(`[Persistence] Error saving snapshot to ${this.filePath}:`, err.message);
    }
  }
}

module.exports = PersistenceManager;
