'use strict';

const { RedisStream } = require('../datastore/data_types');

function registerStreamCommands(registry) {
  registry.register('XADD', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'xadd' command");
    }

    const key = args[0];
    let idx = 1;
    let nomkstream = false;
    let maxLen = null;

    while (idx < args.length) {
      const opt = String(args[idx]).toUpperCase();
      if (opt === 'NOMKSTREAM') {
        nomkstream = true;
        idx++;
      } else if (opt === 'MAXLEN') {
        idx++;
        if (idx < args.length && (args[idx] === '~' || args[idx] === '=')) {
          idx++;
        }
        if (idx < args.length) {
          maxLen = parseInt(args[idx++], 10);
        }
      } else {
        break;
      }
    }

    if (idx >= args.length) {
      throw new Error("ERR wrong number of arguments for 'xadd' command");
    }

    const idPattern = args[idx++];
    const fieldArgs = args.slice(idx);

    if (fieldArgs.length === 0 || fieldArgs.length % 2 !== 0) {
      throw new Error("ERR wrong number of arguments for 'xadd' command");
    }

    const db = client.getDB();
    let entry = db.getEntry(key);

    if (!entry) {
      if (nomkstream) {
        return null;
      }
      const stream = new RedisStream();
      db.setEntry(key, 'stream', stream);
      entry = db.getEntry(key);
    } else if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const stream = entry.value;
    const generatedId = stream.add(idPattern, fieldArgs);

    if (maxLen !== null && !isNaN(maxLen)) {
      stream.trim(maxLen);
    }

    db.emit('key:modified', key);
    return generatedId;
  });

  registry.register('XRANGE', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'xrange' command");
    }
    const db = client.getDB();
    const key = args[0];
    const start = args[1];
    const end = args[2];
    let count = -1;

    for (let i = 3; i < args.length; i++) {
      if (args[i].toUpperCase() === 'COUNT' && i + 1 < args.length) {
        count = parseInt(args[++i], 10);
      }
    }

    const entry = db.getEntry(key);
    if (!entry) return [];
    if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    return entry.value.range(start, end, count);
  });

  registry.register('XREVRANGE', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'xrevrange' command");
    }
    const db = client.getDB();
    const key = args[0];
    const end = args[1];
    const start = args[2];
    let count = -1;

    for (let i = 3; i < args.length; i++) {
      if (args[i].toUpperCase() === 'COUNT' && i + 1 < args.length) {
        count = parseInt(args[++i], 10);
      }
    }

    const entry = db.getEntry(key);
    if (!entry) return [];
    if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    return entry.value.revRange(end, start, count);
  });

  registry.register('XLEN', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'xlen' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return 0;
    if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.len();
  });

  registry.register('XDEL', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'xdel' command");
    }
    const db = client.getDB();
    const key = args[0];
    const entry = db.getEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'stream') {
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

  registry.register('XTRIM', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'xtrim' command");
    }
    const db = client.getDB();
    const key = args[0];
    let idx = 1;
    let maxLen = null;

    if (args[idx].toUpperCase() === 'MAXLEN') {
      idx++;
      if (idx < args.length && (args[idx] === '~' || args[idx] === '=')) {
        idx++;
      }
      if (idx < args.length) {
        maxLen = parseInt(args[idx++], 10);
      }
    }

    if (maxLen === null || isNaN(maxLen)) {
      throw new Error("ERR syntax error in 'xtrim' command");
    }

    const entry = db.getEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const trimmed = entry.value.trim(maxLen);
    db.emit('key:modified', key);
    return trimmed;
  });
}

module.exports = registerStreamCommands;
