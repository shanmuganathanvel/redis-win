'use strict';

const { OK, serializeSimpleString } = require('../protocol/serializer');

function registerGenericCommands(registry) {
  registry.register('DEL', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'del' command");
    }
    const db = client.getDB();
    let deleted = 0;
    for (const key of args) {
      deleted += db.deleteKey(key);
    }
    return deleted;
  });

  registry.register('UNLINK', (client, args) => {
    return registry.execute(client, ['DEL', ...args]);
  });

  registry.register('EXISTS', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'exists' command");
    }
    const db = client.getDB();
    let count = 0;
    for (const key of args) {
      if (db.hasKey(key)) {
        count++;
      }
    }
    return count;
  });

  registry.register('TYPE', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'type' command");
    }
    const db = client.getDB();
    const type = db.getType(args[0]);
    return serializeSimpleString(type);
  });

  registry.register('KEYS', (client, args) => {
    const pattern = args[0] || '*';
    const db = client.getDB();
    return db.keys(pattern);
  });

  registry.register('SCAN', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'scan' command");
    }
    const db = client.getDB();
    let pattern = '*';
    let count = 10;

    for (let i = 1; i < args.length; i++) {
      const opt = args[i].toUpperCase();
      if (opt === 'MATCH' && i + 1 < args.length) {
        pattern = args[++i];
      } else if (opt === 'COUNT' && i + 1 < args.length) {
        count = parseInt(args[++i], 10) || 10;
      }
    }

    const matchedKeys = db.keys(pattern);
    // In dev server, return '0' as cursor indicating full scan complete
    return ['0', matchedKeys.slice(0, count)];
  });

  registry.register('EXPIRE', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'expire' command");
    }
    const sec = parseInt(args[1], 10);
    if (isNaN(sec)) throw new Error('ERR value is not an integer or out of range');
    return client.getDB().setExpire(args[0], sec * 1000);
  });

  registry.register('PEXPIRE', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'pexpire' command");
    }
    const ms = parseInt(args[1], 10);
    if (isNaN(ms)) throw new Error('ERR value is not an integer or out of range');
    return client.getDB().setExpire(args[0], ms);
  });

  registry.register('EXPIREAT', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'expireat' command");
    }
    const sec = parseInt(args[1], 10);
    if (isNaN(sec)) throw new Error('ERR value is not an integer or out of range');
    return client.getDB().setExpireAt(args[0], sec * 1000);
  });

  registry.register('PEXPIREAT', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'pexpireat' command");
    }
    const ms = parseInt(args[1], 10);
    if (isNaN(ms)) throw new Error('ERR value is not an integer or out of range');
    return client.getDB().setExpireAt(args[0], ms);
  });

  registry.register('TTL', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'ttl' command");
    }
    return client.getDB().getTTL(args[0]);
  });

  registry.register('PTTL', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'pttl' command");
    }
    return client.getDB().getPTTL(args[0]);
  });

  registry.register('PERSIST', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'persist' command");
    }
    return client.getDB().persist(args[0]);
  });

  registry.register('RENAME', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'rename' command");
    }
    client.getDB().rename(args[0], args[1]);
    return OK;
  });

  registry.register('RENAMENX', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'renamenx' command");
    }
    const db = client.getDB();
    if (db.hasKey(args[1])) {
      return 0;
    }
    db.rename(args[0], args[1]);
    return 1;
  });

  registry.register('FLUSHDB', (client) => {
    client.getDB().flush();
    return OK;
  });

  registry.register('FLUSHALL', (client) => {
    client.server.datastore.flushAll();
    return OK;
  });

  registry.register('DBSIZE', (client) => {
    return client.getDB().dbsize();
  });
}

module.exports = registerGenericCommands;
