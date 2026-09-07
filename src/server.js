'use strict';

const net = require('net');
const EventEmitter = require('events');
const { Datastore, globToRegex } = require('./datastore/db');
const CommandRegistry = require('./commands');
const ClientSession = require('./client');
const PersistenceManager = require('./persistence/snapshot');
const ScriptingEngine = require('./scripting/engine');
const { serializeArray } = require('./protocol/serializer');

class RedisServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      port: options.port || 6379,
      host: options.host || '127.0.0.1',
      auth: options.auth || null,
      savePath: options.savePath || null,
      verbose: options.verbose || false,
      ...options,
    };

    this.datastore = new Datastore(16);
    this.registry = new CommandRegistry();
    this.persistence = new PersistenceManager(this.datastore, this.options.savePath);
    this.scripting = new ScriptingEngine(this);

    this.clients = new Set();
    this.channelSubscribers = new Map(); // channel -> Set<ClientSession>
    this.patternSubscribers = new Map(); // pattern -> Set<ClientSession>
    this.blockedClients = new Set(); // Set<ClientSession>

    this.startTime = Date.now();
    this.stats = {
      totalConnections: 0,
      totalCommands: 0,
    };

    this.tcpServer = null;
    this.expireInterval = null;
    this.saveInterval = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      // Load saved snapshot if configured
      this.persistence.load();

      // Pre-warm scripting engine
      this.scripting.init().catch(() => {});

      // Active expiration timer every 100ms
      this.expireInterval = setInterval(() => {
        this.datastore.activeExpireCycle();
      }, 100);

      // Periodic snapshot save every 60s if persistence is enabled
      if (this.options.savePath) {
        this.saveInterval = setInterval(() => {
          this.persistence.save();
        }, 60000);
      }

      this.tcpServer = net.createServer((socket) => {
        this.stats.totalConnections++;
        const client = new ClientSession(socket, this);
        this.clients.add(client);
        this.emit('client:connected', client);

        if (this.options.verbose) {
          console.log(`[Client ${client.id}] Connected from ${socket.remoteAddress}:${socket.remotePort}`);
        }
      });

      this.tcpServer.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.tcpServer.listen(this.options.port, this.options.host, () => {
        const addr = this.tcpServer.address();
        this.port = addr.port;
        this.emit('ready', addr);
        resolve(addr);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.expireInterval) {
        clearInterval(this.expireInterval);
        this.expireInterval = null;
      }
      if (this.saveInterval) {
        clearInterval(this.saveInterval);
        this.saveInterval = null;
      }

      // Save snapshot on exit if configured
      this.persistence.save();

      // Close all client sockets
      for (const client of this.clients) {
        client.socket.destroy();
      }
      this.clients.clear();

      if (this.tcpServer) {
        this.tcpServer.close(() => {
          this.emit('close');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  removeClient(client) {
    this.clients.delete(client);
    this.unblockClient(client);

    // Remove from channels
    for (const ch of client.channels) {
      this.removeChannelSubscriber(ch, client);
    }
    for (const pat of client.patterns) {
      this.removePatternSubscriber(pat, client);
    }

    if (this.options.verbose) {
      console.log(`[Client ${client.id}] Disconnected`);
    }
    this.emit('client:disconnected', client);
  }

  addChannelSubscriber(channel, client) {
    let subs = this.channelSubscribers.get(channel);
    if (!subs) {
      subs = new Set();
      this.channelSubscribers.set(channel, subs);
    }
    subs.add(client);
  }

  removeChannelSubscriber(channel, client) {
    const subs = this.channelSubscribers.get(channel);
    if (subs) {
      subs.delete(client);
      if (subs.size === 0) {
        this.channelSubscribers.delete(channel);
      }
    }
  }

  addPatternSubscriber(pattern, client) {
    let subs = this.patternSubscribers.get(pattern);
    if (!subs) {
      subs = new Set();
      this.patternSubscribers.set(pattern, subs);
    }
    subs.add(client);
  }

  removePatternSubscriber(pattern, client) {
    const subs = this.patternSubscribers.get(pattern);
    if (subs) {
      subs.delete(client);
      if (subs.size === 0) {
        this.patternSubscribers.delete(pattern);
      }
    }
  }

  publish(channel, message) {
    let receivers = 0;

    // Direct channel subscribers
    const directSubs = this.channelSubscribers.get(channel);
    if (directSubs) {
      for (const client of directSubs) {
        client.socket.write(serializeArray(['message', channel, message]));
        receivers++;
      }
    }

    // Pattern subscribers
    for (const [pattern, subs] of this.patternSubscribers.entries()) {
      const regex = globToRegex(pattern);
      if (regex.test(channel)) {
        for (const client of subs) {
          client.socket.write(serializeArray(['pmessage', pattern, channel, message]));
          receivers++;
        }
      }
    }

    return receivers;
  }

  blockClient(client, blockInfo) {
    client.isBlocked = true;
    client.blockedInfo = blockInfo;
    this.blockedClients.add(client);
  }

  unblockClient(client) {
    if (client.blockedInfo && client.blockedInfo.timer) {
      clearTimeout(client.blockedInfo.timer);
    }
    client.isBlocked = false;
    client.blockedInfo = null;
    this.blockedClients.delete(client);
  }

  checkBlockedListClients(dbIndex, key) {
    for (const client of [...this.blockedClients]) {
      if (!client.blockedInfo || client.blockedInfo.type !== 'list') continue;
      if (client.blockedInfo.dbIndex !== dbIndex) continue;
      if (!client.blockedInfo.keys.includes(key)) continue;

      const db = this.datastore.getDB(dbIndex);
      const entry = db.getEntry(key);
      if (entry && entry.type === 'list' && entry.value.len() > 0) {
        const item = client.blockedInfo.direction === 'left'
          ? entry.value.popLeft(1)
          : entry.value.popRight(1);

        if (entry.value.len() === 0) {
          db.deleteKey(key);
        } else {
          db.emit('key:modified', key);
        }

        const resolve = client.blockedInfo.resolve;
        resolve([key, item]);
      }
    }
  }

  checkBlockedZSetClients(dbIndex, key) {
    for (const client of [...this.blockedClients]) {
      if (!client.blockedInfo || client.blockedInfo.type !== 'zset') continue;
      if (client.blockedInfo.dbIndex !== dbIndex) continue;
      if (!client.blockedInfo.keys.includes(key)) continue;

      const db = this.datastore.getDB(dbIndex);
      const entry = db.getEntry(key);
      if (entry && entry.type === 'zset' && entry.value.card() > 0) {
        const popped = client.blockedInfo.direction === 'min'
          ? entry.value.popMin(1)
          : entry.value.popMax(1);

        if (entry.value.card() === 0) {
          db.deleteKey(key);
        } else {
          db.emit('key:modified', key);
        }

        const resolve = client.blockedInfo.resolve;
        resolve([key, popped[0], popped[1]]);
      }
    }
  }
}

module.exports = RedisServer;
