'use strict';

const { OK, NULL_ARRAY } = require('../protocol/serializer');

function registerTransactionCommands(registry) {
  registry.register('MULTI', (client) => {
    if (client.inMulti) {
      throw new Error('ERR MULTI calls cannot be nested');
    }
    client.inMulti = true;
    client.multiQueue = [];
    return OK;
  });

  registry.register('DISCARD', (client) => {
    if (!client.inMulti) {
      throw new Error('ERR DISCARD without MULTI');
    }
    client.inMulti = false;
    client.multiQueue = [];
    client.unwatch();
    return OK;
  });

  registry.register('EXEC', (client) => {
    if (!client.inMulti) {
      throw new Error('ERR EXEC without MULTI');
    }

    // Check watched keys
    if (client.watchedKeysDirty) {
      client.inMulti = false;
      client.multiQueue = [];
      client.unwatch();
      return NULL_ARRAY;
    }

    const queue = client.multiQueue;
    client.inMulti = false;
    client.multiQueue = [];
    client.unwatch();

    const results = [];
    for (const cmdArgs of queue) {
      try {
        const res = registry.execute(client, cmdArgs, true);
        results.push(res);
      } catch (err) {
        results.push(err);
      }
    }
    return results;
  });

  registry.register('WATCH', (client, args) => {
    if (client.inMulti) {
      throw new Error('ERR WATCH inside MULTI is not allowed');
    }
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'watch' command");
    }
    for (const key of args) {
      client.watch(key);
    }
    return OK;
  });

  registry.register('UNWATCH', (client) => {
    client.unwatch();
    return OK;
  });
}

module.exports = registerTransactionCommands;
