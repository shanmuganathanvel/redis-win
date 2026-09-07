'use strict';

const { globToRegex } = require('../datastore/db');
const { serializeArray } = require('../protocol/serializer');

function registerPubSubCommands(registry) {
  registry.register('SUBSCRIBE', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'subscribe' command");
    }

    client.isSubscriber = true;

    for (const channel of args) {
      client.channels.add(channel);
      client.server.addChannelSubscriber(channel, client);
      const subCount = client.totalSubscriptions();
      client.socket.write(serializeArray(['subscribe', channel, subCount]));
    }

    return null; // Response already sent per channel
  });

  registry.register('UNSUBSCRIBE', (client, args) => {
    const channels = args.length > 0 ? args : Array.from(client.channels);

    if (channels.length === 0) {
      const subCount = client.totalSubscriptions();
      client.socket.write(serializeArray(['unsubscribe', null, subCount]));
      return null;
    }

    for (const channel of channels) {
      client.channels.delete(channel);
      client.server.removeChannelSubscriber(channel, client);
      const subCount = client.totalSubscriptions();
      client.socket.write(serializeArray(['unsubscribe', channel, subCount]));
    }

    if (client.totalSubscriptions() === 0) {
      client.isSubscriber = false;
    }

    return null;
  });

  registry.register('PSUBSCRIBE', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'psubscribe' command");
    }

    client.isSubscriber = true;

    for (const pattern of args) {
      client.patterns.add(pattern);
      client.server.addPatternSubscriber(pattern, client);
      const subCount = client.totalSubscriptions();
      client.socket.write(serializeArray(['psubscribe', pattern, subCount]));
    }

    return null;
  });

  registry.register('PUNSUBSCRIBE', (client, args) => {
    const patterns = args.length > 0 ? args : Array.from(client.patterns);

    if (patterns.length === 0) {
      const subCount = client.totalSubscriptions();
      client.socket.write(serializeArray(['punsubscribe', null, subCount]));
      return null;
    }

    for (const pattern of patterns) {
      client.patterns.delete(pattern);
      client.server.removePatternSubscriber(pattern, client);
      const subCount = client.totalSubscriptions();
      client.socket.write(serializeArray(['punsubscribe', pattern, subCount]));
    }

    if (client.totalSubscriptions() === 0) {
      client.isSubscriber = false;
    }

    return null;
  });

  registry.register('PUBLISH', (client, args) => {
    if (args.length < 2) {
      throw new Error("ERR wrong number of arguments for 'publish' command");
    }
    const channel = args[0];
    const message = args[1];
    return client.server.publish(channel, message);
  });

  registry.register('PUBSUB', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'pubsub' command");
    }
    const sub = args[0].toUpperCase();
    if (sub === 'CHANNELS') {
      const pattern = args[1] || '*';
      const regex = globToRegex(pattern);
      const matched = [];
      for (const ch of client.server.channelSubscribers.keys()) {
        if (regex.test(ch)) {
          matched.push(ch);
        }
      }
      return matched;
    }
    if (sub === 'NUMSUB') {
      const channels = args.slice(1);
      const result = [];
      for (const ch of channels) {
        const subs = client.server.channelSubscribers.get(ch);
        result.push(ch, subs ? subs.size : 0);
      }
      return result;
    }
    if (sub === 'NUMPAT') {
      return client.server.patternSubscribers.size;
    }
    throw new Error(`ERR unknown subcommand '${args[0]}' for 'pubsub'`);
  });
}

module.exports = registerPubSubCommands;
