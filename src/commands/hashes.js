'use strict';

const { OK } = require('../protocol/serializer');
const { RedisHash } = require('../datastore/data_types');

function registerHashCommands(registry) {
  registry.register('HSET', (client, args) => {
    if (args.length < 3 || (args.length - 1) % 2 !== 0) {
      throw new Error("ERR wrong number of arguments for 'hset' command");
    }
    const db = client.getDB();
    const key = args[0];
    let entry = db.getEntry(key);

    if (!entry) {
      const hash = new RedisHash();
      db.setEntry(key, 'hash', hash);
      entry = db.getEntry(key);
    } else if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const hash = entry.value;
    let addedCount = 0;
    for (let i = 1; i < args.length; i += 2) {
      addedCount += hash.set(args[i], args[i + 1]);
    }
    db.emit('key:modified', key);
    return addedCount;
  });

  registry.register('HSETNX', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'hsetnx' command");
    }
    const db = client.getDB();
    const key = args[0];
    const field = args[1];
    const value = args[2];
    let entry = db.getEntry(key);

    if (!entry) {
      const hash = new RedisHash();
      hash.set(field, value);
      db.setEntry(key, 'hash', hash);
      return 1;
    }
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    if (entry.value.has(field)) {
      return 0;
    }
    entry.value.set(field, value);
    db.emit('key:modified', key);
    return 1;
  });

  registry.register('HGET', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'hget' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return null;
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.get(args[1]);
  });

  registry.register('HMSET', (client, args) => {
    if (args.length < 3 || (args.length - 1) % 2 !== 0) {
      throw new Error("ERR wrong number of arguments for 'hmset' command");
    }
    registry.execute(client, ['HSET', ...args]);
    return OK;
  });

  registry.register('HMGET', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'hmget' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) {
      return args.slice(1).map(() => null);
    }
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const hash = entry.value;
    return args.slice(1).map((f) => hash.get(f));
  });

  registry.register('HDEL', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'hdel' command");
    }
    const db = client.getDB();
    const key = args[0];
    const entry = db.getEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const deleted = entry.value.del(...args.slice(1));
    if (entry.value.len() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return deleted;
  });

  registry.register('HEXISTS', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'hexists' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return 0;
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.has(args[1]) ? 1 : 0;
  });

  registry.register('HGETALL', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'hgetall' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return [];
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.getAll();
  });

  registry.register('HKEYS', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'hkeys' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return [];
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.keys();
  });

  registry.register('HVALS', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'hvals' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return [];
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.values();
  });

  registry.register('HLEN', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'hlen' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return 0;
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.len();
  });

  registry.register('HINCRBY', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'hincrby' command");
    }
    const db = client.getDB();
    const key = args[0];
    const field = args[1];
    const amount = parseInt(args[2], 10);
    if (isNaN(amount)) throw new Error('ERR value is not an integer or out of range');

    let entry = db.getEntry(key);
    if (!entry) {
      const hash = new RedisHash();
      db.setEntry(key, 'hash', hash);
      entry = db.getEntry(key);
    } else if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const hash = entry.value;
    let current = hash.get(field);
    let val = current !== null ? parseInt(current, 10) : 0;
    if (isNaN(val)) throw new Error('ERR hash value is not an integer');

    val += amount;
    hash.set(field, String(val));
    db.emit('key:modified', key);
    return val;
  });

  registry.register('HINCRBYFLOAT', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'hincrbyfloat' command");
    }
    const db = client.getDB();
    const key = args[0];
    const field = args[1];
    const amount = parseFloat(args[2]);
    if (isNaN(amount)) throw new Error('ERR value is not a valid float');

    let entry = db.getEntry(key);
    if (!entry) {
      const hash = new RedisHash();
      db.setEntry(key, 'hash', hash);
      entry = db.getEntry(key);
    } else if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const hash = entry.value;
    let current = hash.get(field);
    let val = current !== null ? parseFloat(current) : 0;
    if (isNaN(val)) throw new Error('ERR hash value is not a float');

    val += amount;
    const strVal = String(val);
    hash.set(field, strVal);
    db.emit('key:modified', key);
    return strVal;
  });

  registry.register('HSCAN', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'hscan' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return ['0', []];
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return ['0', entry.value.getAll()];
  });
}

module.exports = registerHashCommands;
