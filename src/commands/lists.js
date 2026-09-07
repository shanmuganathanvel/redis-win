'use strict';

const { OK, NULL_ARRAY } = require('../protocol/serializer');
const { RedisList } = require('../datastore/data_types');

function registerListCommands(registry) {
  registry.register('LPUSH', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'lpush' command");
    }
    const db = client.getDB();
    const key = args[0];
    let entry = db.getEntry(key);

    if (!entry) {
      const list = new RedisList();
      db.setEntry(key, 'list', list);
      entry = db.getEntry(key);
    } else if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const list = entry.value;
    const len = list.pushLeft(...args.slice(1));
    db.emit('key:modified', key);
    if (client.server && typeof client.server.checkBlockedListClients === 'function') {
      client.server.checkBlockedListClients(db.index, key);
    }
    return len;
  });

  registry.register('RPUSH', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'rpush' command");
    }
    const db = client.getDB();
    const key = args[0];
    let entry = db.getEntry(key);

    if (!entry) {
      const list = new RedisList();
      db.setEntry(key, 'list', list);
      entry = db.getEntry(key);
    } else if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const list = entry.value;
    const len = list.pushRight(...args.slice(1));
    db.emit('key:modified', key);
    if (client.server && typeof client.server.checkBlockedListClients === 'function') {
      client.server.checkBlockedListClients(db.index, key);
    }
    return len;
  });

  registry.register('LPOP', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'lpop' command");
    }
    const db = client.getDB();
    const key = args[0];
    const count = args.length > 1 ? parseInt(args[1], 10) : 1;
    if (isNaN(count) || count < 0) throw new Error('ERR value is not an integer or out of range');

    const entry = db.getEntry(key);
    if (!entry) return null;
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const list = entry.value;
    const popped = list.popLeft(count);
    if (list.len() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return popped;
  });

  registry.register('RPOP', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'rpop' command");
    }
    const db = client.getDB();
    const key = args[0];
    const count = args.length > 1 ? parseInt(args[1], 10) : 1;
    if (isNaN(count) || count < 0) throw new Error('ERR value is not an integer or out of range');

    const entry = db.getEntry(key);
    if (!entry) return null;
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const list = entry.value;
    const popped = list.popRight(count);
    if (list.len() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return popped;
  });

  registry.register('LRANGE', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'lrange' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return [];
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const start = parseInt(args[1], 10);
    const stop = parseInt(args[2], 10);
    if (isNaN(start) || isNaN(stop)) throw new Error('ERR value is not an integer or out of range');

    return entry.value.range(start, stop);
  });

  registry.register('LLEN', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'llen' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return 0;
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.len();
  });

  registry.register('LINDEX', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'lindex' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) return null;
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const idx = parseInt(args[1], 10);
    if (isNaN(idx)) throw new Error('ERR value is not an integer or out of range');
    return entry.value.get(idx);
  });

  registry.register('LSET', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'lset' command");
    }
    const db = client.getDB();
    const entry = db.getEntry(args[0]);
    if (!entry) throw new Error('ERR no such key');
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const idx = parseInt(args[1], 10);
    if (isNaN(idx)) throw new Error('ERR value is not an integer or out of range');
    entry.value.set(idx, args[2]);
    db.emit('key:modified', args[0]);
    return OK;
  });

  registry.register('LREM', (client, args) => {
    if (args.length < 3) {
      throw new Error("ERR wrong number of arguments for 'lrem' command");
    }
    const db = client.getDB();
    const key = args[0];
    const entry = db.getEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const count = parseInt(args[1], 10);
    if (isNaN(count)) throw new Error('ERR value is not an integer or out of range');

    const removed = entry.value.rem(count, args[2]);
    if (entry.value.len() === 0) {
      db.deleteKey(key);
    } else {
      db.emit('key:modified', key);
    }
    return removed;
  });

  registry.register('RPOPLPUSH', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'rpoplpush' command");
    }
    return executeLMove(client, args[0], args[1], 'RIGHT', 'LEFT');
  });

  registry.register('LMOVE', (client, args) => {
    if (args.length < 4) {
      throw new Error("ERR wrong number of arguments for 'lmove' command");
    }
    return executeLMove(client, args[0], args[1], args[2], args[3]);
  });

  // Blocking list operations: BLPOP and BRPOP
  registry.register('BLPOP', (client, args) => {
    return handleBlockingListPop(client, args, 'left');
  });

  registry.register('BRPOP', (client, args) => {
    return handleBlockingListPop(client, args, 'right');
  });
}

function handleBlockingListPop(client, args, direction) {
  if (args.length < 2) {
    throw new Error(`ERR wrong number of arguments for 'b${direction === 'left' ? 'l' : 'r'}pop' command`);
  }

  const timeoutSec = parseFloat(args[args.length - 1]);
  if (isNaN(timeoutSec) || timeoutSec < 0) {
    throw new Error('ERR timeout is not a float or out of range');
  }

  const keys = args.slice(0, args.length - 1);
  const db = client.getDB();

  // Check if any key already has elements
  for (const key of keys) {
    const entry = db.getEntry(key);
    if (entry) {
      if (entry.type !== 'list') {
        throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
      }
      if (entry.value.len() > 0) {
        const item = direction === 'left' ? entry.value.popLeft(1) : entry.value.popRight(1);
        if (entry.value.len() === 0) {
          db.deleteKey(key);
        } else {
          db.emit('key:modified', key);
        }
        return [key, item];
      }
    }
  }

  // Block client until an item is pushed or timeout expires
  return new Promise((resolve) => {
    let timer = null;
    const blockInfo = {
      type: 'list',
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
        resolve(NULL_ARRAY); // Nil array
      }, timeoutSec * 1000);
    }
    blockInfo.timer = timer;

    if (client.server) {
      client.server.blockClient(client, blockInfo);
    }
  });
}

function executeLMove(client, sourceKey, destKey, whereFrom, whereTo) {
  const from = whereFrom.toUpperCase();
  const to = whereTo.toUpperCase();
  if (from !== 'LEFT' && from !== 'RIGHT') {
    throw new Error('ERR syntax error');
  }
  if (to !== 'LEFT' && to !== 'RIGHT') {
    throw new Error('ERR syntax error');
  }

  const db = client.getDB();
  const srcEntry = db.getEntry(sourceKey);
  if (!srcEntry) {
    return null;
  }
  if (srcEntry.type !== 'list') {
    throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
  }

  let destEntry = db.getEntry(destKey);
  if (destEntry && destEntry.type !== 'list') {
    throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
  }

  let destList;
  if (sourceKey === destKey) {
    destList = srcEntry.value;
  } else if (!destEntry) {
    destList = new RedisList();
    db.setEntry(destKey, 'list', destList);
  } else {
    destList = destEntry.value;
  }

  const movedItem = srcEntry.value.move(destList, from, to);
  if (srcEntry.value.len() === 0 && sourceKey !== destKey) {
    db.deleteKey(sourceKey);
  } else {
    db.emit('key:modified', sourceKey);
  }

  if (sourceKey !== destKey) {
    db.emit('key:modified', destKey);
  }

  client.server.checkBlockedListClients(db.index, destKey);
  return movedItem;
}

module.exports = registerListCommands;
