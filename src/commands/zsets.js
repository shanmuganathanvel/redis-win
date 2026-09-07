'use strict';

const { NULL_ARRAY } = require('../protocol/serializer');
const { RedisSortedSet } = require('../datastore/data_types');

function registerZSetCommands(registry) {
  registry.register('ZADD', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'zadd' command");
    }
    const db = client.getDB();
    const key = args[0];

    const options = {
      nx: false,
      xx: false,
      gt: false,
      lt: false,
      ch: false,
    };

    let idx = 1;
    while (idx < args.length) {
      const opt = String(args[idx]).toUpperCase();
      if (opt === 'NX') {
        options.nx = true;
        idx++;
      } else if (opt === 'XX') {
        options.xx = true;
        idx++;
      } else if (opt === 'GT') {
        options.gt = true;
        idx++;
      } else if (opt === 'LT') {
        options.lt = true;
        idx++;
      } else if (opt === 'CH') {
        options.ch = true;
        idx++;
      } else {
        break;
      }
    }

    const remaining = args.slice(idx);
    if (remaining.length < 2 || remaining.length % 2 !== 0) {
      throw new Error("ERR wrong number of arguments for 'zadd' command");
    }

    let entry = db.getEntry(key);
    if (!entry) {
      const zset = new RedisSortedSet();
      db.setEntry(key, 'zset', zset);
      entry = db.getEntry(key);
    } else if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const zset = entry.value;
    let count = 0;
    for (let i = 0; i < remaining.length; i += 2) {
      const score = remaining[i];
      const member = remaining[i + 1];
      count += zset.add(score, member, options);
    }
    db.emit('key:modified', key);
    if (client.server && typeof client.server.checkBlockedZSetClients === 'function') {
      client.server.checkBlockedZSetClients(db.index, key);
    }
    return count;
  });

  registry.register('ZREM', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'zrem' command");
    }
    const db = client.getDB();
    const key = args[0];
    const entry = db.getEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const removed = entry.value.rem(...args.slice(1));
    if (entry.value.card() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return removed;
  });

  registry.register('ZSCORE', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'zscore' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return null;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.score(args[1]);
  });

  registry.register('ZRANK', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'zrank' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return null;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.rank(args[1], false);
  });

  registry.register('ZREVRANK', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'zrevrank' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return null;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.rank(args[1], true);
  });

  registry.register('ZCARD', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'zcard' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return 0;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.card();
  });

  registry.register('ZCOUNT', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'zcount' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return 0;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.count(args[1], args[2]);
  });

  registry.register('ZINCRBY', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'zincrby' command");
    }
    const db = client.getDB();
    const key = args[0];
    const increment = args[1];
    const member = args[2];

    let entry = db.getEntry(key);
    if (!entry) {
      const zset = new RedisSortedSet();
      db.setEntry(key, 'zset', zset);
      entry = db.getEntry(key);
    } else if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const res = entry.value.incrby(increment, member);
    db.emit('key:modified', key);
    if (client.server && typeof client.server.checkBlockedZSetClients === 'function') {
      client.server.checkBlockedZSetClients(db.index, key);
    }
    return res;
  });

  registry.register('ZRANGE', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'zrange' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return [];
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    let byScore = false;
    let rev = false;
    let withScores = false;
    let offset = 0;
    let count = -1;

    for (let i = 3; i < args.length; i++) {
      const opt = args[i].toUpperCase();
      if (opt === 'BYSCORE') {
        byScore = true;
      } else if (opt === 'REV') {
        rev = true;
      } else if (opt === 'WITHSCORES') {
        withScores = true;
      } else if (opt === 'LIMIT' && i + 2 < args.length) {
        offset = parseInt(args[++i], 10) || 0;
        count = parseInt(args[++i], 10) || -1;
      }
    }

    if (byScore) {
      const min = rev ? args[2] : args[1];
      const max = rev ? args[1] : args[2];
      return entry.value.rangeByScore(min, max, { rev, withScores, offset, count });
    }

    const start = parseInt(args[1], 10);
    const stop = parseInt(args[2], 10);
    return entry.value.range(start, stop, { rev, withScores });
  });

  registry.register('ZREVRANGE', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'zrevrange' command");
    }
    const extra = ['REV'];
    if (args.length > 3 && args[3].toUpperCase() === 'WITHSCORES') {
      extra.push('WITHSCORES');
    }
    return registry.execute(client, ['ZRANGE', args[0], args[1], args[2], ...extra]);
  });

  registry.register('ZRANGEBYSCORE', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'zrangebyscore' command");
    }
    return registry.execute(client, ['ZRANGE', args[0], args[1], args[2], 'BYSCORE', ...args.slice(3)]);
  });

  registry.register('ZREVRANGEBYSCORE', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'zrevrangebyscore' command");
    }
    return registry.execute(client, ['ZRANGE', args[0], args[2], args[1], 'BYSCORE', 'REV', ...args.slice(3)]);
  });

  registry.register('ZREMRANGEBYRANK', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'zremrangebyrank' command");
    }
    const start = parseInt(args[1], 10);
    const stop = parseInt(args[2], 10);
    if (isNaN(start) || isNaN(stop)) {
      throw new Error('ERR value is not an integer or out of range');
    }

    const db = client.getDB();
    const key = args[0];
    const entry = db.getEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const removed = entry.value.remRangeByRank(start, stop);
    if (entry.value.card() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return removed;
  });

  registry.register('ZREMRANGEBYSCORE', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'zremrangebyscore' command");
    }
    RedisSortedSet.parseScoreBound(args[1]);
    RedisSortedSet.parseScoreBound(args[2]);

    const db = client.getDB();
    const key = args[0];
    const entry = db.getEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const removed = entry.value.remRangeByScore(args[1], args[2]);
    if (entry.value.card() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return removed;
  });

  registry.register('ZREMRANGEBYLEX', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'zremrangebylex' command");
    }
    RedisSortedSet.parseLexBound(args[1]);
    RedisSortedSet.parseLexBound(args[2]);

    const db = client.getDB();
    const key = args[0];
    const entry = db.getEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const removed = entry.value.remRangeByLex(args[1], args[2]);
    if (entry.value.card() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return removed;
  });

  registry.register('ZPOPMIN', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'zpopmin' command");
    }
    const count = args.length > 1 ? parseInt(args[1], 10) : 1;
    if (isNaN(count) || count < 0) {
      throw new Error('ERR value is not an integer or out of range');
    }
    const db = client.getDB();
    const key = args[0];
    const entry = db.getEntry(key);
    if (!entry) return [];
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const popped = entry.value.popMin(count);
    if (entry.value.card() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return popped;
  });

  registry.register('ZPOPMAX', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'zpopmax' command");
    }
    const count = args.length > 1 ? parseInt(args[1], 10) : 1;
    if (isNaN(count) || count < 0) {
      throw new Error('ERR value is not an integer or out of range');
    }
    const db = client.getDB();
    const key = args[0];
    const entry = db.getEntry(key);
    if (!entry) return [];
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const popped = entry.value.popMax(count);
    if (entry.value.card() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return popped;
  });

  registry.register('BZPOPMIN', (client, args) => handleBlockingZSetPop(client, args, 'min'));
  registry.register('BZPOPMAX', (client, args) => handleBlockingZSetPop(client, args, 'max'));
}

function handleBlockingZSetPop(client, args, direction) {
  if (args.length < 2) {
    throw new Error(`ERR wrong number of arguments for 'bzpop${direction}' command`);
  }
  const timeoutSec = parseFloat(args[args.length - 1]);
  if (isNaN(timeoutSec) || timeoutSec < 0) {
    throw new Error('ERR timeout is negative');
  }
  const keys = args.slice(0, -1);
  const db = client.getDB();

  // Check if any key has elements right now
  for (const key of keys) {
    const entry = db.getEntry(key);
    if (entry) {
      if (entry.type !== 'zset') {
        throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
      }
      if (entry.value.card() > 0) {
        const popped = direction === 'min' ? entry.value.popMin(1) : entry.value.popMax(1);
        if (entry.value.card() === 0) {
          db.deleteKey(key);
        } else {
          db.emit('key:modified', key);
        }
        return [key, popped[0], popped[1]];
      }
    }
  }

  // Block client until an item is pushed or timeout expires
  return new Promise((resolve) => {
    let timer = null;
    const blockInfo = {
      type: 'zset',
      dbIndex: db.index,
      keys,
      direction,
      resolve: (result) => {
        if (timer) clearTimeout(timer);
        if (client.server) {
          client.server.unblockClient(client);
        }
        resolve(result);
      },
    };

    if (timeoutSec > 0) {
      timer = setTimeout(() => {
        if (client.server) {
          client.server.unblockClient(client);
        }
        resolve(NULL_ARRAY);
      }, timeoutSec * 1000);
    }
    blockInfo.timer = timer;

    if (client.server) {
      client.server.blockClient(client, blockInfo);
    }
  });
}

module.exports = registerZSetCommands;
