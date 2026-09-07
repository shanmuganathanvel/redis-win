'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { encode: msgpackEncode } = require('@msgpack/msgpack');
const CommandRegistry = require('../src/commands');
const { Datastore } = require('../src/datastore/db');
const ScriptingEngine = require('../src/scripting/engine');

function createMockClient() {
  const datastore = new Datastore(16);
  const registry = new CommandRegistry();
  const server = {
    datastore,
    registry,
    options: { auth: null },
    checkBlockedListClients: () => {},
    stats: { totalCommands: 0 },
  };
  const scripting = new ScriptingEngine(server);
  server.scripting = scripting;

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
    async exec(cmd, ...args) {
      const res = registry.execute(this, [cmd, ...args]);
      if (res instanceof Promise) {
        return await res;
      }
      return res;
    },
  };
}

test('Scripting: SCRIPT LOAD, SCRIPT EXISTS, SCRIPT FLUSH', async () => {
  const client = createMockClient();

  const script = 'return 42';
  const sha = await client.exec('SCRIPT', 'LOAD', script);
  assert.strictEqual(typeof sha, 'string');
  assert.strictEqual(sha.length, 40);

  // SCRIPT EXISTS
  const exists = await client.exec('SCRIPT', 'EXISTS', sha, '0000000000000000000000000000000000000000');
  assert.deepStrictEqual(exists, [1, 0]);

  // SCRIPT FLUSH
  await client.exec('SCRIPT', 'FLUSH');
  const afterFlush = await client.exec('SCRIPT', 'EXISTS', sha);
  assert.deepStrictEqual(afterFlush, [0]);
});

test('Scripting: EVALSHA with missing script throws NOSCRIPT', async () => {
  const client = createMockClient();

  const unknownSha = '8eb09338a4d68a0d75605cdbcaec70765c6b3a73';
  await assert.rejects(
    async () => {
      await client.exec('EVALSHA', unknownSha, '0');
    },
    (err) => {
      assert.ok(err.message.includes('NOSCRIPT'));
      return true;
    }
  );
});

test('Scripting: Basic EVAL expressions and return types', async () => {
  const client = createMockClient();

  // Number
  const num = await client.exec('EVAL', 'return 10 + 25', '0');
  assert.strictEqual(num, 35);

  // String
  const str = await client.exec('EVAL', 'return "hello from lua"', '0');
  assert.strictEqual(str, 'hello from lua');

  // Boolean true -> 1
  const bTrue = await client.exec('EVAL', 'return true', '0');
  assert.strictEqual(bTrue, 1);

  // Boolean false / nil -> null
  const bFalse = await client.exec('EVAL', 'return false', '0');
  assert.strictEqual(bFalse, null);
  const bNil = await client.exec('EVAL', 'return nil', '0');
  assert.strictEqual(bNil, null);

  // Array table
  const arr = await client.exec('EVAL', 'return {"first", "second", 3}', '0');
  assert.deepStrictEqual(arr, ['first', 'second', 3]);
});

test('Scripting: EVAL with KEYS and ARGV', async () => {
  const client = createMockClient();

  const script = 'return { KEYS[1], KEYS[2], ARGV[1], ARGV[2] }';
  const res = await client.exec('EVAL', script, '2', 'key1', 'key2', 'arg1', 'arg2');
  assert.deepStrictEqual(res, ['key1', 'key2', 'arg1', 'arg2']);
});

test('Scripting: EVAL with redis.call (SET, GET, INCR)', async () => {
  const client = createMockClient();

  const script = `
    redis.call("SET", KEYS[1], ARGV[1])
    redis.call("INCR", KEYS[2])
    local val = redis.call("GET", KEYS[1])
    local count = redis.call("GET", KEYS[2])
    return { val, count }
  `;

  const res = await client.exec('EVAL', script, '2', 'user:name', 'counter', 'Alice');
  assert.deepStrictEqual(res, ['Alice', '1']);

  // Verify in client datastore
  assert.strictEqual(await client.exec('GET', 'user:name'), 'Alice');
  assert.strictEqual(await client.exec('GET', 'counter'), '1');
});

test('Scripting: EVAL with cmsgpack (MessagePack decode/encode)', async () => {
  const client = createMockClient();

  // Create binary MessagePack payload like BullMQ does
  const optionsPayload = Buffer.from(msgpackEncode({
    token: 'my-job-token-12345',
    lockDuration: 30000,
    limiter: { max: 10, duration: 1000 },
  }));

  const script = `
    local opts = cmsgpack.unpack(ARGV[1])
    local token = opts.token
    local lockDuration = opts.lockDuration
    local max = opts.limiter.max
    return { token, lockDuration, max }
  `;

  const res = await client.exec('EVAL', script, '0', optionsPayload);
  assert.deepStrictEqual(res, ['my-job-token-12345', 30000, 10]);
});

test('Scripting: EVAL with cjson (JSON parse/stringify)', async () => {
  const client = createMockClient();

  const script = `
    local obj = cjson.decode(ARGV[1])
    obj.counter = obj.counter + 1
    return cjson.encode(obj)
  `;

  const jsonIn = JSON.stringify({ name: 'medplum', counter: 41 });
  const res = await client.exec('EVAL', script, '0', jsonIn);
  const parsed = JSON.parse(res);
  assert.strictEqual(parsed.name, 'medplum');
  assert.strictEqual(parsed.counter, 42);
});

test('Scripting: BullMQ moveToActive pattern simulation', async () => {
  const client = createMockClient();

  // Setup queue items in wait list
  client.exec('RPUSH', 'bull:myQueue:wait', 'job-101');

  // Encode options
  const opts = Buffer.from(msgpackEncode({
    token: 'token-abc',
    lockDuration: 30000,
  }));

  // Simplified BullMQ moveToActive script
  const script = `
    local waitKey = KEYS[1]
    local activeKey = KEYS[2]
    local streamKey = KEYS[3]
    local opts = cmsgpack.unpack(ARGV[2])

    -- Move job from wait to active
    local jobId = redis.call("RPOPLPUSH", waitKey, activeKey)
    if not jobId then
      return { 0, 0, 0, 0 }
    end

    -- Acquire lock
    local lockKey = ARGV[1] .. jobId .. ":lock"
    redis.call("SET", lockKey, opts.token, "PX", opts.lockDuration)

    -- Emit stream event
    redis.call("XADD", streamKey, "*", "event", "active", "jobId", jobId)

    -- Return job info
    return { 1, jobId, opts.token }
  `;

  const keys = ['bull:myQueue:wait', 'bull:myQueue:active', 'bull:myQueue:events'];
  const res = await client.exec(
    'EVAL',
    script,
    '3',
    ...keys,
    'bull:myQueue:',
    opts
  );

  assert.deepStrictEqual(res, [1, 'job-101', 'token-abc']);

  // Verify list states
  assert.strictEqual(await client.exec('LLEN', 'bull:myQueue:wait'), 0);
  assert.deepStrictEqual(await client.exec('LRANGE', 'bull:myQueue:active', 0, -1), ['job-101']);
  assert.strictEqual(await client.exec('GET', 'bull:myQueue:job-101:lock'), 'token-abc');

  // Verify stream event
  assert.strictEqual(await client.exec('XLEN', 'bull:myQueue:events'), 1);
  const events = await client.exec('XRANGE', 'bull:myQueue:events', '-', '+');
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0][1], ['event', 'active', 'jobId', 'job-101']);
});

test('Scripting: Real BullMQ moveToActive script execution if available', async () => {
  let moveToActive;
  try {
    const bullmqPath = 'C:/workplace/medplum-main/packages/server/node_modules/bullmq/dist/cjs/scripts/moveToActive-11.js';
    moveToActive = require(bullmqPath).moveToActive;
  } catch {
    // If not running in environment with medplum, skip
    return;
  }

  const client = createMockClient();

  const keys = [
    'bull:SubscriptionQueue:wait',
    'bull:SubscriptionQueue:active',
    'bull:SubscriptionQueue:prioritized',
    'bull:SubscriptionQueue:events',
    'bull:SubscriptionQueue:stalled',
    'bull:SubscriptionQueue:limiter',
    'bull:SubscriptionQueue:delayed',
    'bull:SubscriptionQueue:paused',
    'bull:SubscriptionQueue:meta',
    'bull:SubscriptionQueue:pc',
    'bull:SubscriptionQueue:marker',
  ];

  await client.exec('RPUSH', 'bull:SubscriptionQueue:wait', '1');
  await client.exec('HSET', 'bull:SubscriptionQueue:1', 'name', 'test-job');

  const opts = Buffer.from(msgpackEncode({
    token: 'test-token',
    lockDuration: 30000,
    name: 'worker-1'
  }));

  const res = await client.exec(
    'EVAL',
    moveToActive.content,
    '11',
    ...keys,
    'bull:SubscriptionQueue:',
    String(Date.now()),
    opts
  );

  assert.ok(Array.isArray(res));
  assert.strictEqual(res[1], '1');
  assert.strictEqual(await client.exec('LLEN', 'bull:SubscriptionQueue:wait'), 0);
  assert.deepStrictEqual(await client.exec('LRANGE', 'bull:SubscriptionQueue:active', 0, -1), ['1']);
  assert.strictEqual(await client.exec('XLEN', 'bull:SubscriptionQueue:events'), 1);
});

test('Scripting: Real BullMQ moveToFinished script execution with ZREMRANGEBYRANK', async () => {
  let moveToFinished;
  try {
    const bullmqPath = 'C:/workplace/medplum-main/packages/server/node_modules/bullmq/dist/cjs/scripts/moveToFinished-14.js';
    moveToFinished = require(bullmqPath).moveToFinished;
  } catch {
    return;
  }

  const client = createMockClient();

  const keys = [
    'bull:DispatchQueue:wait',
    'bull:DispatchQueue:active',
    'bull:DispatchQueue:prioritized',
    'bull:DispatchQueue:events',
    'bull:DispatchQueue:stalled',
    'bull:DispatchQueue:limiter',
    'bull:DispatchQueue:delayed',
    'bull:DispatchQueue:paused',
    'bull:DispatchQueue:meta',
    'bull:DispatchQueue:pc',
    'bull:DispatchQueue:completed',
    'bull:DispatchQueue:1',
    'bull:DispatchQueue:metrics',
    'bull:DispatchQueue:marker',
  ];

  // Prepare active job 1
  await client.exec('RPUSH', 'bull:DispatchQueue:active', '1');
  await client.exec('HSET', 'bull:DispatchQueue:1', 'name', 'test-job');
  await client.exec('SET', 'bull:DispatchQueue:1:lock', 'test-token');

  // Prepare existing completed jobs in completed zset to test trimming by max count
  await client.exec('ZADD', 'bull:DispatchQueue:completed', '1000', 'old-1', '2000', 'old-2');
  await client.exec('HSET', 'bull:DispatchQueue:old-1', 'name', 'old-1');
  await client.exec('HSET', 'bull:DispatchQueue:old-2', 'name', 'old-2');

  const opts = Buffer.from(msgpackEncode({
    token: 'test-token',
    keepJobs: { count: 1 },
    lockDuration: 30000,
    attempts: 3,
  }));

  const res = await client.exec(
    'EVAL',
    moveToFinished.content,
    '14',
    ...keys,
    '1', // ARGV[1] jobId
    String(Date.now()), // ARGV[2] timestamp
    'returnvalue', // ARGV[3] msg property
    '{"status":"done"}', // ARGV[4] val
    'completed', // ARGV[5] target
    '0', // ARGV[6] fetch next
    'bull:DispatchQueue:', // ARGV[7] prefix
    opts // ARGV[8] opts
  );

  // Script should execute cleanly and return 0 (OK)
  assert.strictEqual(res, 0);

  // Verify job 1 is in completed zset and old jobs were trimmed to maxCount 1
  assert.strictEqual(await client.exec('ZCARD', 'bull:DispatchQueue:completed'), 1);
  assert.strictEqual(await client.exec('ZRANK', 'bull:DispatchQueue:completed', '1'), 0);

  // Verify lock was released
  assert.strictEqual(await client.exec('GET', 'bull:DispatchQueue:1:lock'), null);
});


test('Scripting: Null-safety when accessing null fields in MessagePack objects', async () => {
  const client = createMockClient();

  const payloadWithNulls = Buffer.from(msgpackEncode({
    token: 'test-token',
    lockDuration: 30000,
    limiter: null,
    name: null,
  }));

  const script = `
    local opts = cmsgpack.unpack(ARGV[1])
    local hasLimiter = opts['limiter'] and opts['limiter']['max']
    local isNull = (opts['limiter'] == nil)
    return { isNull, hasLimiter or false }
  `;

  const res = await client.exec('EVAL', script, '0', payloadWithNulls);
  assert.deepStrictEqual(res, [1, null]);
});

test('Scripting: Zero stack leak and stability across 500+ executions', async () => {
  const client = createMockClient();
  const script = 'return { 1, 2, "test", redis.call("PING") }';

  for (let i = 0; i < 500; i++) {
    const res = await client.exec('EVAL', script, '0');
    assert.deepStrictEqual(res, [1, 2, 'test', { type: 'simple', value: 'PONG' }]);
  }

  const lua = await client.server.scripting.init();
  assert.strictEqual(lua.global.getTop(), 0);
});

test('Scripting: Concurrent BullMQ script executions without memory access out of bounds', async () => {
  let moveToActive;
  try {
    const bullmqPath = 'C:/workplace/medplum-main/packages/server/node_modules/bullmq/dist/cjs/scripts/moveToActive-11.js';
    moveToActive = require(bullmqPath).moveToActive;
  } catch {
    return;
  }

  const client = createMockClient();
  const keys = [
    'bull:CronQueue:wait', 'bull:CronQueue:active', 'bull:CronQueue:prioritized', 'bull:CronQueue:events',
    'bull:CronQueue:stalled', 'bull:CronQueue:limiter', 'bull:CronQueue:delayed', 'bull:CronQueue:paused',
    'bull:CronQueue:meta', 'bull:CronQueue:pc', 'bull:CronQueue:marker'
  ];
  const buf = Buffer.from(msgpackEncode({
    token: 'my-token',
    lockDuration: 30000,
    limiter: null,
    name: null
  }));

  const promises = [];
  for (let i = 0; i < 60; i++) {
    promises.push(client.exec('EVAL', moveToActive.content, '11', ...keys, 'bull:CronQueue:', '1788766108536', buf));
  }

  const results = await Promise.all(promises);
  assert.strictEqual(results.length, 60);
  for (const res of results) {
    assert.deepStrictEqual(res, [0, 0, 0, 0]);
  }

  const lua = await client.server.scripting.init();
  assert.strictEqual(lua.global.getTop(), 0);
});

test('Scripting: Self-healing recovery after fatal error or trap', async () => {
  const client = createMockClient();

  // Trigger error inside Lua
  await assert.rejects(
    async () => {
      await client.exec('EVAL', 'error("intentional fatal error")', '0');
    },
    (err) => {
      assert.ok(err.message.includes('intentional fatal error'));
      return true;
    }
  );

  // Subsequent commands must work perfectly without trapped state
  const res = await client.exec('EVAL', 'return 42', '0');
  assert.strictEqual(res, 42);
});

