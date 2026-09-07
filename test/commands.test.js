'use strict';

const test = require('node:test');
const assert = require('node:assert');
const CommandRegistry = require('../src/commands');
const { Datastore } = require('../src/datastore/db');

function createMockClient() {
  const datastore = new Datastore();
  let dbIndex = 0;
  const client = {
    id: 1,
    dbIndex: 0,
    authenticated: true,
    isSubscriber: false,
    inMulti: false,
    multiQueue: [],
    watchedKeys: new Set(),
    watchedKeysDirty: false,
    channels: new Set(),
    patterns: new Set(),
    server: {
      options: {},
      datastore,
      stats: { totalCommands: 0, totalConnections: 1 },
      clients: new Set(),
      channelSubscribers: new Map(),
      patternSubscribers: new Map(),
      blockedClients: new Set(),
      blockClient() {},
      unblockClient() {},
      checkBlockedListClients() {},
      publish() { return 0; },
    },
    getDB() {
      return datastore.getDB(this.dbIndex);
    },
    selectDB(idx) {
      this.dbIndex = idx;
    },
    watch(k) {
      this.watchedKeys.add(k);
    },
    unwatch() {
      this.watchedKeys.clear();
      this.watchedKeysDirty = false;
    },
  };
  return { client, datastore };
}

test('Strings: SET, GET, INCR, APPEND, MSET, MGET', () => {
  const registry = new CommandRegistry();
  const { client } = createMockClient();

  // Basic SET & GET
  registry.execute(client, ['SET', 'hello', 'world']);
  assert.strictEqual(registry.execute(client, ['GET', 'hello']), 'world');

  // SET with NX
  const nxFail = registry.execute(client, ['SET', 'hello', 'new', 'NX']);
  assert.strictEqual(nxFail, null);
  assert.strictEqual(registry.execute(client, ['GET', 'hello']), 'world');

  // SET with XX
  registry.execute(client, ['SET', 'hello', 'updated', 'XX']);
  assert.strictEqual(registry.execute(client, ['GET', 'hello']), 'updated');

  // INCR & DECR
  registry.execute(client, ['SET', 'counter', '10']);
  assert.strictEqual(registry.execute(client, ['INCR', 'counter']), 11);
  assert.strictEqual(registry.execute(client, ['INCRBY', 'counter', '5']), 16);
  assert.strictEqual(registry.execute(client, ['DECR', 'counter']), 15);

  // APPEND & STRLEN
  assert.strictEqual(registry.execute(client, ['APPEND', 'hello', '!']), 8);
  assert.strictEqual(registry.execute(client, ['STRLEN', 'hello']), 8);

  // MSET & MGET
  registry.execute(client, ['MSET', 'k1', 'v1', 'k2', 'v2']);
  assert.deepStrictEqual(registry.execute(client, ['MGET', 'k1', 'k2', 'k3']), ['v1', 'v2', null]);
});

test('Hashes: HSET, HGET, HMGET, HGETALL, HDEL, HINCRBY', () => {
  const registry = new CommandRegistry();
  const { client } = createMockClient();

  registry.execute(client, ['HSET', 'myhash', 'field1', 'foo', 'field2', 'bar']);
  assert.strictEqual(registry.execute(client, ['HGET', 'myhash', 'field1']), 'foo');
  assert.deepStrictEqual(registry.execute(client, ['HMGET', 'myhash', 'field1', 'field2', 'missing']), ['foo', 'bar', null]);
  assert.deepStrictEqual(registry.execute(client, ['HGETALL', 'myhash']), ['field1', 'foo', 'field2', 'bar']);

  assert.strictEqual(registry.execute(client, ['HINCRBY', 'myhash', 'counter', '3']), 3);
  assert.strictEqual(registry.execute(client, ['HGET', 'myhash', 'counter']), '3');

  assert.strictEqual(registry.execute(client, ['HDEL', 'myhash', 'field1']), 1);
  assert.strictEqual(registry.execute(client, ['HEXISTS', 'myhash', 'field1']), 0);
  assert.strictEqual(registry.execute(client, ['HLEN', 'myhash']), 2);
});

test('Lists: LPUSH, RPUSH, LPOP, RPOP, LRANGE, LLEN', () => {
  const registry = new CommandRegistry();
  const { client } = createMockClient();

  registry.execute(client, ['RPUSH', 'mylist', 'one', 'two']);
  registry.execute(client, ['LPUSH', 'mylist', 'zero']);

  assert.strictEqual(registry.execute(client, ['LLEN', 'mylist']), 3);
  assert.deepStrictEqual(registry.execute(client, ['LRANGE', 'mylist', '0', '-1']), ['zero', 'one', 'two']);
  assert.strictEqual(registry.execute(client, ['LPOP', 'mylist']), 'zero');
  assert.strictEqual(registry.execute(client, ['RPOP', 'mylist']), 'two');
  assert.strictEqual(registry.execute(client, ['LLEN', 'mylist']), 1);
});

test('Sets: SADD, SREM, SMEMBERS, SISMEMBER, SCARD', () => {
  const registry = new CommandRegistry();
  const { client } = createMockClient();

  assert.strictEqual(registry.execute(client, ['SADD', 'myset', 'a', 'b', 'c']), 3);
  assert.strictEqual(registry.execute(client, ['SADD', 'myset', 'a']), 0); // duplicate
  assert.strictEqual(registry.execute(client, ['SCARD', 'myset']), 3);
  assert.strictEqual(registry.execute(client, ['SISMEMBER', 'myset', 'b']), 1);
  assert.strictEqual(registry.execute(client, ['SISMEMBER', 'myset', 'z']), 0);

  assert.strictEqual(registry.execute(client, ['SREM', 'myset', 'b']), 1);
  assert.strictEqual(registry.execute(client, ['SCARD', 'myset']), 2);
});

test('Sorted Sets: ZADD, ZSCORE, ZRANK, ZRANGE, ZCARD', () => {
  const registry = new CommandRegistry();
  const { client } = createMockClient();

  registry.execute(client, ['ZADD', 'myzset', '10', 'apple', '20', 'banana', '5', 'cherry']);
  assert.strictEqual(registry.execute(client, ['ZCARD', 'myzset']), 3);
  assert.strictEqual(registry.execute(client, ['ZSCORE', 'myzset', 'apple']), '10');

  // Sorted order should be cherry (5), apple (10), banana (20)
  assert.strictEqual(registry.execute(client, ['ZRANK', 'myzset', 'cherry']), 0);
  assert.strictEqual(registry.execute(client, ['ZRANK', 'myzset', 'apple']), 1);
  assert.strictEqual(registry.execute(client, ['ZRANK', 'myzset', 'banana']), 2);

  assert.deepStrictEqual(registry.execute(client, ['ZRANGE', 'myzset', '0', '-1']), ['cherry', 'apple', 'banana']);
  assert.deepStrictEqual(
    registry.execute(client, ['ZRANGE', 'myzset', '0', '-1', 'WITHSCORES']),
    ['cherry', '5', 'apple', '10', 'banana', '20']
  );
});

test('Generic & TTL: DEL, EXISTS, KEYS, EXPIRE, TTL, PERSIST', async () => {
  const registry = new CommandRegistry();
  const { client } = createMockClient();

  registry.execute(client, ['SET', 'user:1', 'Alice']);
  registry.execute(client, ['SET', 'user:2', 'Bob']);
  registry.execute(client, ['SET', 'temp', 'data']);

  assert.strictEqual(registry.execute(client, ['EXISTS', 'user:1', 'user:2', 'nope']), 2);

  const matched = registry.execute(client, ['KEYS', 'user:*']);
  assert.strictEqual(matched.length, 2);
  assert.ok(matched.includes('user:1'));
  assert.ok(matched.includes('user:2'));

  // Expiration
  registry.execute(client, ['PEXPIRE', 'temp', '100']);
  assert.ok(registry.execute(client, ['PTTL', 'temp']) > 0);

  await new Promise((r) => setTimeout(r, 120));
  assert.strictEqual(registry.execute(client, ['GET', 'temp']), null);
  assert.strictEqual(registry.execute(client, ['EXISTS', 'temp']), 0);
});

test('Transactions: MULTI, EXEC, DISCARD', () => {
  const registry = new CommandRegistry();
  const { client } = createMockClient();

  registry.execute(client, ['MULTI']);
  registry.execute(client, ['SET', 'tx_key', 'val']);
  registry.execute(client, ['INCR', 'tx_num']);
  assert.strictEqual(client.multiQueue.length, 2);

  const results = registry.execute(client, ['EXEC']);
  assert.strictEqual(results.length, 2);
  assert.strictEqual(registry.execute(client, ['GET', 'tx_key']), 'val');
  assert.strictEqual(registry.execute(client, ['GET', 'tx_num']), '1');

  // DISCARD
  registry.execute(client, ['MULTI']);
  registry.execute(client, ['SET', 'discard_key', 'should_not_exist']);
  registry.execute(client, ['DISCARD']);
  assert.strictEqual(registry.execute(client, ['GET', 'discard_key']), null);
});
