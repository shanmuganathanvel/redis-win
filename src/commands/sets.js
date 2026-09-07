'use strict';

const { RedisSet } = require('../datastore/data_types');

function registerSetCommands(registry) {
  registry.register('SADD', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'sadd' command");
    }
    const db = client.getDB();
    const key = args[0];
    let entry = db.getEntry(key);

    if (!entry) {
      const set = new RedisSet();
      db.setEntry(key, 'set', set);
      entry = db.getEntry(key);
    } else if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const added = entry.value.add(...args.slice(1));
    db.emit('key:modified', key);
    return added;
  });

  registry.register('SREM', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'srem' command");
    }
    const db = client.getDB();
    const key = args[0];
    const entry = db.getEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const removed = entry.value.rem(...args.slice(1));
    if (entry.value.size() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return removed;
  });

  registry.register('SMEMBERS', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'smembers' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return [];
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.getAll();
  });

  registry.register('SISMEMBER', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'sismember' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return 0;
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.has(args[1]) ? 1 : 0;
  });

  registry.register('SMISMEMBER', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'smismember' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return args.slice(1).map(() => 0);
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const set = entry.value;
    return args.slice(1).map((m) => (set.has(m) ? 1 : 0));
  });

  registry.register('SCARD', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'scard' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return 0;
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.size();
  });

  registry.register('SPOP', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'spop' command");
    }
    const db = client.getDB();
    const key = args[0];
    const count = args.length > 1 ? parseInt(args[1], 10) : 1;
    if (isNaN(count) || count < 0) throw new Error('ERR value is not an integer or out of range');

    const entry = db.getEntry(key);
    if (!entry) return args.length > 1 ? [] : null;
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const popped = entry.value.pop(count);
    if (entry.value.size() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return popped;
  });

  registry.register('SRANDMEMBER', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'srandmember' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return args.length > 1 ? [] : null;
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const count = args.length > 1 ? parseInt(args[1], 10) : 1;
    return entry.value.randomMember(count);
  });

  registry.register('SSCAN', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'sscan' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return ['0', []];
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return ['0', entry.value.getAll()];
  });
}

module.exports = registerSetCommands;
