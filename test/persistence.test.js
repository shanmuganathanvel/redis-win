'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const RedisServer = require('../src/server');
const CommandRegistry = require('../src/commands');

test('Persistence: Save and restore snapshot to JSON file', async () => {
  const savePath = path.join(__dirname, 'test_dump.json');
  if (fs.existsSync(savePath)) {
    fs.unlinkSync(savePath);
  }

  try {
    // 1. Start server with savePath and write some data
    const server1 = new RedisServer({ savePath });
    const registry = new CommandRegistry();
    const mockClient1 = {
      server: server1,
      dbIndex: 0,
      authenticated: true,
      getDB() { return server1.datastore.getDB(0); },
    };

    registry.execute(mockClient1, ['SET', 'persisted_key', 'hello_redis']);
    registry.execute(mockClient1, ['HSET', 'user:100', 'name', 'Alice', 'role', 'admin']);
    registry.execute(mockClient1, ['RPUSH', 'jobs', 'jobA', 'jobB']);
    registry.execute(mockClient1, ['SADD', 'tags', 'dev', 'win']);
    registry.execute(mockClient1, ['ZADD', 'leaderboard', '100', 'player1', '250', 'player2']);

    // Save
    server1.persistence.save();
    assert.ok(fs.existsSync(savePath));

    // 2. Start new server instance loading the saved snapshot
    const server2 = new RedisServer({ savePath });
    server2.persistence.load();

    const mockClient2 = {
      server: server2,
      dbIndex: 0,
      authenticated: true,
      getDB() { return server2.datastore.getDB(0); },
    };

    assert.strictEqual(registry.execute(mockClient2, ['GET', 'persisted_key']), 'hello_redis');
    assert.strictEqual(registry.execute(mockClient2, ['HGET', 'user:100', 'name']), 'Alice');
    assert.deepStrictEqual(registry.execute(mockClient2, ['LRANGE', 'jobs', '0', '-1']), ['jobA', 'jobB']);
    assert.strictEqual(registry.execute(mockClient2, ['SISMEMBER', 'tags', 'win']), 1);
    assert.strictEqual(registry.execute(mockClient2, ['ZSCORE', 'leaderboard', 'player2']), '250');

    // 3. Test SAVE, BGSAVE, LASTSAVE commands
    const saveRes = registry.execute(mockClient2, ['SAVE']);
    assert.strictEqual(saveRes.toString(), '+OK\r\n');
    const lastSave = registry.execute(mockClient2, ['LASTSAVE']);
    assert.ok(typeof lastSave === 'number' && lastSave > 0);
  } finally {
    if (fs.existsSync(savePath)) {
      fs.unlinkSync(savePath);
    }
  }
});
