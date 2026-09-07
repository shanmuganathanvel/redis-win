'use strict';

const { OK } = require('../protocol/serializer');

function registerStringCommands(registry) {
  registry.register('GET', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'get' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return null;
    if (entry.type !== 'string') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value;
  });

  registry.register('SET', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'set' command");
    }
    const key = args[0];
    const value = args[1];
    const db = client.getDB();

    let ttlMs = null;
    let keepTtl = false;
    let nx = false;
    let xx = false;
    let returnOld = false;

    for (let i = 2; i < args.length; i++) {
      const opt = args[i].toUpperCase();
      if (opt === 'EX' && i + 1 < args.length) {
        ttlMs = parseInt(args[++i], 10) * 1000;
        if (isNaN(ttlMs) || ttlMs <= 0) throw new Error('ERR invalid expire time in set');
      } else if (opt === 'PX' && i + 1 < args.length) {
        ttlMs = parseInt(args[++i], 10);
        if (isNaN(ttlMs) || ttlMs <= 0) throw new Error('ERR invalid expire time in set');
      } else if (opt === 'EXAT' && i + 1 < args.length) {
        const sec = parseInt(args[++i], 10);
        ttlMs = sec * 1000 - Date.now();
      } else if (opt === 'PXAT' && i + 1 < args.length) {
        const ms = parseInt(args[++i], 10);
        ttlMs = ms - Date.now();
      } else if (opt === 'KEEPTTL') {
        keepTtl = true;
      } else if (opt === 'NX') {
        nx = true;
      } else if (opt === 'XX') {
        xx = true;
      } else if (opt === 'GET') {
        returnOld = true;
      }
    }

    if (nx && xx) {
      throw new Error("ERR syntax error, cannot specify both NX and XX");
    }

    const currentEntry = db.getEntry(key);
    const exists = currentEntry !== null;

    if (nx && exists) return null;
    if (xx && !exists) return null;

    let oldVal = null;
    if (returnOld) {
      if (currentEntry) {
        if (currentEntry.type !== 'string') {
          throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
        }
        oldVal = currentEntry.value;
      }
    }

    if (keepTtl && exists) {
      const currentExp = db.expirations.get(key);
      ttlMs = currentExp !== undefined ? Math.max(0, currentExp - Date.now()) : null;
    }

    db.setEntry(key, 'string', String(value), ttlMs);

    return returnOld ? oldVal : OK;
  });

  registry.register('SETNX', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'setnx' command");
    }
    const db = client.getDB();
    if (db.hasKey(args[0])) {
      return 0;
    }
    db.setEntry(args[0], 'string', String(args[1]));
    return 1;
  });

  registry.register('SETEX', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'setex' command");
    }
    const sec = parseInt(args[1], 10);
    if (isNaN(sec) || sec <= 0) throw new Error('ERR invalid expire time in setex');
    client.getDB().setEntry(args[0], 'string', String(args[2]), sec * 1000);
    return OK;
  });

  registry.register('PSETEX', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'psetex' command");
    }
    const ms = parseInt(args[1], 10);
    if (isNaN(ms) || ms <= 0) throw new Error('ERR invalid expire time in psetex');
    client.getDB().setEntry(args[0], 'string', String(args[2]), ms);
    return OK;
  });

  registry.register('MGET', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'mget' command");
    }
    const db = client.getDB();
    const result = [];
    for (const key of args) {
      const entry = db.getEntry(key);
      if (!entry || entry.type !== 'string') {
        result.push(null);
      } else {
        result.push(entry.value);
      }
    }
    return result;
  });

  registry.register('MSET', (client, args) => {
    if (args.length < 2 || args.length % 2 !== 0) {
      throw new Error("ERR wrong number of arguments for 'mset' command");
    }
    const db = client.getDB();
    for (let i = 0; i < args.length; i += 2) {
      db.setEntry(args[i], 'string', String(args[i + 1]));
    }
    return OK;
  });

  registry.register('MSETNX', (client, args) => {
    if (args.length < 2 || args.length % 2 !== 0) {
      throw new Error("ERR wrong number of arguments for 'msetnx' command");
    }
    const db = client.getDB();
    for (let i = 0; i < args.length; i += 2) {
      if (db.hasKey(args[i])) {
        return 0;
      }
    }
    for (let i = 0; i < args.length; i += 2) {
      db.setEntry(args[i], 'string', String(args[i + 1]));
    }
    return 1;
  });

  registry.register('INCR', (client, args) => {
    return registry.execute(client, ['INCRBY', args[0], '1']);
  });

  registry.register('DECR', (client, args) => {
    return registry.execute(client, ['INCRBY', args[0], '-1']);
  });

  registry.register('INCRBY', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'incrby' command");
    }
    const db = client.getDB();
    const key = args[0];
    const amount = parseInt(args[1], 10);
    if (isNaN(amount)) throw new Error('ERR value is not an integer or out of range');

    const entry = db.getEntry(key);
    let val = 0;
    if (entry) {
      if (entry.type !== 'string') {
        throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
      }
      val = parseInt(entry.value, 10);
      if (isNaN(val)) throw new Error('ERR value is not an integer or out of range');
    }

    val += amount;
    const currentExp = db.expirations.get(key);
    const ttlMs = currentExp !== undefined ? Math.max(0, currentExp - Date.now()) : null;
    db.setEntry(key, 'string', String(val), ttlMs);
    return val;
  });

  registry.register('DECRBY', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'decrby' command");
    }
    const amount = parseInt(args[1], 10);
    if (isNaN(amount)) throw new Error('ERR value is not an integer or out of range');
    return registry.execute(client, ['INCRBY', args[0], String(-amount)]);
  });

  registry.register('INCRBYFLOAT', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'incrbyfloat' command");
    }
    const db = client.getDB();
    const key = args[0];
    const amount = parseFloat(args[1]);
    if (isNaN(amount)) throw new Error('ERR value is not a valid float');

    const entry = db.getEntry(key);
    let val = 0;
    if (entry) {
      if (entry.type !== 'string') {
        throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
      }
      val = parseFloat(entry.value);
      if (isNaN(val)) throw new Error('ERR value is not a valid float');
    }

    val += amount;
    const strVal = String(val);
    const currentExp = db.expirations.get(key);
    const ttlMs = currentExp !== undefined ? Math.max(0, currentExp - Date.now()) : null;
    db.setEntry(key, 'string', strVal, ttlMs);
    return strVal;
  });

  registry.register('APPEND', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'append' command");
    }
    const db = client.getDB();
    const key = args[0];
    const valToAppend = String(args[1]);
    const entry = db.getEntry(key);

    let currentVal = '';
    if (entry) {
      if (entry.type !== 'string') {
        throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
      }
      currentVal = entry.value;
    }

    const newVal = currentVal + valToAppend;
    const currentExp = db.expirations.get(key);
    const ttlMs = currentExp !== undefined ? Math.max(0, currentExp - Date.now()) : null;
    db.setEntry(key, 'string', newVal, ttlMs);
    return newVal.length;
  });

  registry.register('STRLEN', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'strlen' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return 0;
    if (entry.type !== 'string') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.length;
  });

  registry.register('GETSET', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'getset' command");
    }
    return registry.execute(client, ['SET', args[0], args[1], 'GET']);
  });
}

module.exports = registerStringCommands;
