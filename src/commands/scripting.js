'use strict';

const { OK } = require('../protocol/serializer');

function registerScriptingCommands(registry) {
  registry.register('EVAL', async (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'eval' command");
    }

    const script = String(args[0]);
    const numkeys = parseInt(args[1], 10);
    if (isNaN(numkeys) || numkeys < 0) {
      throw new Error('ERR value is not an integer or out of range');
    }
    if (args.length < 2 + numkeys) {
      throw new Error("ERR Number of keys can't be greater than number of args");
    }

    const keys = args.slice(2, 2 + numkeys);
    const argv = args.slice(2 + numkeys);

    return await client.server.scripting.execute(client, script, keys, argv);
  });

  registry.register('EVALSHA', async (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'evalsha' command");
    }

    const sha1 = String(args[0]).toLowerCase();
    const numkeys = parseInt(args[1], 10);
    if (isNaN(numkeys) || numkeys < 0) {
      throw new Error('ERR value is not an integer or out of range');
    }
    if (args.length < 2 + numkeys) {
      throw new Error("ERR Number of keys can't be greater than number of args");
    }

    const script = client.server.scripting.getScript(sha1);
    if (!script) {
      throw new Error('NOSCRIPT No matching script. Please use EVAL.');
    }

    const keys = args.slice(2, 2 + numkeys);
    const argv = args.slice(2 + numkeys);

    return await client.server.scripting.execute(client, script, keys, argv);
  });

  registry.register('SCRIPT', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR unknown subcommand or wrong number of arguments for 'SCRIPT'");
    }

    const sub = String(args[0]).toUpperCase();

    if (sub === 'LOAD') {
      if (args.length < 2) {
        throw new Error("ERR wrong number of arguments for 'script|load' command");
      }
      return client.server.scripting.loadScript(String(args[1]));
    }

    if (sub === 'EXISTS') {
      if (args.length < 2) {
        throw new Error("ERR wrong number of arguments for 'script|exists' command");
      }
      return args.slice(1).map((sha) => (client.server.scripting.hasScript(sha) ? 1 : 0));
    }

    if (sub === 'FLUSH') {
      client.server.scripting.flushScripts();
      return OK;
    }

    if (sub === 'KILL') {
      return OK;
    }

    throw new Error(`ERR unknown subcommand '${args[0]}' for 'SCRIPT'`);
  });
}

module.exports = registerScriptingCommands;
