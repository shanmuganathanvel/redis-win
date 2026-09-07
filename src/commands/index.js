'use strict';

const { QUEUED } = require('../protocol/serializer');

const registerConnection = require('./connection');
const registerGeneric = require('./generic');
const registerStrings = require('./strings');
const registerHashes = require('./hashes');
const registerLists = require('./lists');
const registerSets = require('./sets');
const registerZSets = require('./zsets');
const registerPubSub = require('./pubsub');
const registerTransactions = require('./transactions');

class CommandRegistry {
  constructor() {
    this.commands = new Map();

    registerConnection(this);
    registerGeneric(this);
    registerStrings(this);
    registerHashes(this);
    registerLists(this);
    registerSets(this);
    registerZSets(this);
    registerPubSub(this);
    registerTransactions(this);
  }

  register(name, handler) {
    this.commands.set(name.toUpperCase(), handler);
  }

  get(name) {
    return this.commands.get(name.toUpperCase());
  }

  execute(client, rawArgs, isFromMulti = false) {
    if (!rawArgs || rawArgs.length === 0) {
      return null;
    }

    const cmdName = String(rawArgs[0]).toUpperCase();
    const args = rawArgs.slice(1);

    // Auth check
    if (client.server && client.server.options.auth && !client.authenticated) {
      if (cmdName !== 'AUTH' && cmdName !== 'QUIT' && cmdName !== 'HELLO') {
        throw new Error('NOAUTH Authentication required.');
      }
    }

    // Subscriber mode check
    if (client.isSubscriber) {
      const allowedInSub = ['SUBSCRIBE', 'PSUBSCRIBE', 'UNSUBSCRIBE', 'PUNSUBSCRIBE', 'PING', 'QUIT'];
      if (!allowedInSub.includes(cmdName)) {
        throw new Error(`ERR only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT allowed in this context`);
      }
    }

    // Multi/Transaction queue check
    if (client.inMulti && !isFromMulti) {
      const execCommands = ['EXEC', 'DISCARD', 'MULTI', 'QUIT'];
      if (!execCommands.includes(cmdName)) {
        client.multiQueue.push(rawArgs);
        return QUEUED;
      }
    }

    const handler = this.commands.get(cmdName);
    if (!handler) {
      throw new Error(`ERR unknown command '${cmdName}', with args beginning with: ${args.map((a) => `'${a}'`).join(' ')}`);
    }

    if (client.server) {
      client.server.stats.totalCommands++;
    }

    return handler(client, args);
  }
}

module.exports = CommandRegistry;
