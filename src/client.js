'use strict';

const RespParser = require('./protocol/parser');
const { serialize } = require('./protocol/serializer');

let nextClientId = 1;

class ClientSession {
  constructor(socket, server) {
    this.id = nextClientId++;
    this.socket = socket;
    this.server = server;
    this.dbIndex = 0;
    this.name = '';
    this.authenticated = !server.options.auth;
    this.isSubscriber = false;
    this.channels = new Set();
    this.patterns = new Set();

    this.inMulti = false;
    this.multiQueue = [];
    this.watchedKeys = new Set();
    this.watchedKeysDirty = false;

    this.isBlocked = false;
    this.blockedInfo = null;

    this._onKeyModified = (modifiedKey) => {
      if (this.watchedKeys.has(modifiedKey)) {
        this.watchedKeysDirty = true;
      }
    };

    this.getDB().on('key:modified', this._onKeyModified);

    this.parser = new RespParser(async (rawArgs) => {
      try {
        const result = this.server.registry.execute(this, rawArgs);
        if (result instanceof Promise) {
          const asyncResult = await result;
          if (asyncResult !== undefined) {
            this.send(asyncResult);
          }
        } else if (result !== undefined) {
          this.send(result);
        }
      } catch (err) {
        this.send(err);
      }
    });

    this.socket.on('data', (chunk) => {
      try {
        this.parser.feed(chunk);
      } catch (err) {
        this.send(err);
      }
    });

    this.socket.on('close', () => {
      this.cleanup();
    });

    this.socket.on('error', (err) => {
      if (this.server.options.verbose) {
        console.error(`[Client ${this.id}] Socket error:`, err.message);
      }
      this.cleanup();
    });
  }

  getDB() {
    return this.server.datastore.getDB(this.dbIndex);
  }

  selectDB(newIndex) {
    const oldDB = this.getDB();
    oldDB.off('key:modified', this._onKeyModified);

    this.dbIndex = newIndex;
    const newDB = this.getDB();
    newDB.on('key:modified', this._onKeyModified);

    this.unwatch();
  }

  watch(key) {
    this.watchedKeys.add(key);
  }

  unwatch() {
    this.watchedKeys.clear();
    this.watchedKeysDirty = false;
  }

  totalSubscriptions() {
    return this.channels.size + this.patterns.size;
  }

  send(data) {
    if (this.socket.writable) {
      this.socket.write(serialize(data));
    }
  }

  cleanup() {
    const db = this.getDB();
    if (db) {
      db.off('key:modified', this._onKeyModified);
    }
    this.server.removeClient(this);
  }
}

module.exports = ClientSession;
