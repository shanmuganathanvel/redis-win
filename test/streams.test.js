'use strict';

const test = require('node:test');
const assert = require('node:assert');
const CommandRegistry = require('../src/commands');
const { Datastore } = require('../src/datastore/db');

function createMockClient() {
  const datastore = new Datastore(16);
  const registry = new CommandRegistry();
  const server = {
    datastore,
    registry,
    options: { auth: null },
    checkBlockedListClients: () => {},
    checkBlockedZSetClients: () => {},
    stats: { totalCommands: 0 },
  };

  return {
    server,
    dbIndex: 0,
    authenticated: true,
    isSubscriber: false,
    inMulti: false,
    multiQueue: [],
    watchedKeys: new Set(),
    watchedKeysDirty: false,
    getDB() {
      return datastore.getDB(this.dbIndex);
    },
    exec(cmd, ...args) {
      return registry.execute(this, [cmd, ...args]);
    },
  };
}

test('Streams: XADD, XLEN, XRANGE, XREVRANGE, XDEL, XTRIM', () => {
  const client = createMockClient();

  // XADD with auto-generated id
  const id1 = client.exec('XADD', 'mystream', '*', 'sensor', 'temp', 'value', '24.5');
  assert.ok(typeof id1 === 'string');
  assert.ok(id1.includes('-'));

  const id2 = client.exec('XADD', 'mystream', '*', 'sensor', 'pressure', 'value', '1013');
  assert.ok(typeof id2 === 'string');

  // XLEN
  assert.strictEqual(client.exec('XLEN', 'mystream'), 2);
  assert.strictEqual(client.exec('XLEN', 'nonexistent'), 0);

  // XRANGE
  const rangeAll = client.exec('XRANGE', 'mystream', '-', '+');
  assert.strictEqual(rangeAll.length, 2);
  assert.strictEqual(rangeAll[0][0], id1);
  assert.deepStrictEqual(rangeAll[0][1], ['sensor', 'temp', 'value', '24.5']);
  assert.strictEqual(rangeAll[1][0], id2);

  // XRANGE with COUNT
  const rangeOne = client.exec('XRANGE', 'mystream', '-', '+', 'COUNT', '1');
  assert.strictEqual(rangeOne.length, 1);
  assert.strictEqual(rangeOne[0][0], id1);

  // XREVRANGE
  const revRange = client.exec('XREVRANGE', 'mystream', '+', '-');
  assert.strictEqual(revRange.length, 2);
  assert.strictEqual(revRange[0][0], id2);

  // XDEL
  const deleted = client.exec('XDEL', 'mystream', id1);
  assert.strictEqual(deleted, 1);
  assert.strictEqual(client.exec('XLEN', 'mystream'), 1);

  // XTRIM
  client.exec('XADD', 'mystream', '*', 'a', '1');
  client.exec('XADD', 'mystream', '*', 'b', '2');
  assert.strictEqual(client.exec('XLEN', 'mystream'), 3);
  const trimmed = client.exec('XTRIM', 'mystream', 'MAXLEN', '1');
  assert.strictEqual(trimmed, 2);
  assert.strictEqual(client.exec('XLEN', 'mystream'), 1);
});

test('Lists: RPOPLPUSH and LMOVE', () => {
  const client = createMockClient();

  // RPOPLPUSH on empty source returns null
  assert.strictEqual(client.exec('RPOPLPUSH', 'source', 'dest'), null);

  // Push items to source: [c, b, a] (head is c, tail is a)
  client.exec('RPUSH', 'source', 'a', 'b', 'c');

  // RPOPLPUSH pops tail ('c') and pushes to left of dest
  const moved1 = client.exec('RPOPLPUSH', 'source', 'dest');
  assert.strictEqual(moved1, 'c');
  assert.deepStrictEqual(client.exec('LRANGE', 'source', 0, -1), ['a', 'b']);
  assert.deepStrictEqual(client.exec('LRANGE', 'dest', 0, -1), ['c']);

  // Move another: pops 'b', pushes to left of dest -> [b, c]
  const moved2 = client.exec('RPOPLPUSH', 'source', 'dest');
  assert.strictEqual(moved2, 'b');
  assert.deepStrictEqual(client.exec('LRANGE', 'dest', 0, -1), ['b', 'c']);

  // LMOVE
  // source currently has ['a']. Move from LEFT to RIGHT of dest -> [b, c, a]
  const lmoveResult = client.exec('LMOVE', 'source', 'dest', 'LEFT', 'RIGHT');
  assert.strictEqual(lmoveResult, 'a');
  assert.deepStrictEqual(client.exec('LRANGE', 'dest', 0, -1), ['b', 'c', 'a']);
  // source should now be empty and removed
  assert.strictEqual(client.exec('EXISTS', 'source'), 0);
});

test('Sorted Sets: ZPOPMIN', () => {
  const client = createMockClient();

  // ZADD items
  client.exec('ZADD', 'myzset', '10', 'member1', '5', 'member2', '20', 'member3');

  // ZPOPMIN 1 item (default)
  const pop1 = client.exec('ZPOPMIN', 'myzset');
  assert.deepStrictEqual(pop1, ['member2', '5']);
  assert.strictEqual(client.exec('ZCARD', 'myzset'), 2);

  // ZPOPMIN remaining 2 items
  const pop2 = client.exec('ZPOPMIN', 'myzset', '2');
  assert.deepStrictEqual(pop2, ['member1', '10', 'member3', '20']);
  assert.strictEqual(client.exec('ZCARD', 'myzset'), 0);
  assert.strictEqual(client.exec('EXISTS', 'myzset'), 0);
});

test('Sorted Sets: ZPOPMAX', () => {
  const client = createMockClient();

  client.exec('ZADD', 'myzset_max', '10', 'member1', '5', 'member2', '20', 'member3');

  const pop1 = client.exec('ZPOPMAX', 'myzset_max');
  assert.deepStrictEqual(pop1, ['member3', '20']);
  assert.strictEqual(client.exec('ZCARD', 'myzset_max'), 2);

  const pop2 = client.exec('ZPOPMAX', 'myzset_max', '2');
  assert.deepStrictEqual(pop2, ['member1', '10', 'member2', '5']);
  assert.strictEqual(client.exec('ZCARD', 'myzset_max'), 0);
  assert.strictEqual(client.exec('EXISTS', 'myzset_max'), 0);
});
