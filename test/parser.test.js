'use strict';

const test = require('node:test');
const assert = require('node:assert');
const RespParser = require('../src/protocol/parser');
const serializer = require('../src/protocol/serializer');

test('RESP Serializer formats basic types correctly', () => {
  assert.strictEqual(serializer.serializeSimpleString('OK').toString(), '+OK\r\n');
  assert.strictEqual(serializer.serializeError('ERR message').toString(), '-ERR message\r\n');
  assert.strictEqual(serializer.serializeInteger(42).toString(), ':42\r\n');
  assert.strictEqual(serializer.serializeBulkString('hello').toString(), '$5\r\nhello\r\n');
  assert.strictEqual(serializer.serializeBulkString(null).toString(), '$-1\r\n');
  assert.strictEqual(serializer.serializeArray(['foo', 'bar']).toString(), '*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n');
  assert.strictEqual(serializer.serializeArray(null).toString(), '*-1\r\n');
  assert.strictEqual(serializer.serialize(true).toString(), ':1\r\n');
  assert.strictEqual(serializer.serialize(false).toString(), ':0\r\n');
});

test('RESP Parser parses simple multibulk command', () => {
  const commands = [];
  const parser = new RespParser((cmd) => commands.push(cmd));

  // *3\r\n$3\r\nSET\r\n$3\r\nfoo\r\n$3\r\nbar\r\n
  const payload = Buffer.from('*3\r\n$3\r\nSET\r\n$3\r\nfoo\r\n$3\r\nbar\r\n');
  parser.feed(payload);

  assert.strictEqual(commands.length, 1);
  assert.deepStrictEqual(commands[0], ['SET', 'foo', 'bar']);
});

test('RESP Parser handles chunked inputs across multiple packets', () => {
  const commands = [];
  const parser = new RespParser((cmd) => commands.push(cmd));

  const part1 = Buffer.from('*3\r\n$3\r\nSET\r\n$3\r\nfo');
  const part2 = Buffer.from('o\r\n$3\r\nbar\r\n');

  parser.feed(part1);
  assert.strictEqual(commands.length, 0); // Not ready yet

  parser.feed(part2);
  assert.strictEqual(commands.length, 1);
  assert.deepStrictEqual(commands[0], ['SET', 'foo', 'bar']);
});

test('RESP Parser handles pipelined commands in one packet', () => {
  const commands = [];
  const parser = new RespParser((cmd) => commands.push(cmd));

  const chunk = Buffer.from(
    '*2\r\n$4\r\nECHO\r\n$5\r\nhello\r\n' +
    '*1\r\n$4\r\nPING\r\n'
  );
  parser.feed(chunk);

  assert.strictEqual(commands.length, 2);
  assert.deepStrictEqual(commands[0], ['ECHO', 'hello']);
  assert.deepStrictEqual(commands[1], ['PING']);
});

test('RESP Parser handles inline commands', () => {
  const commands = [];
  const parser = new RespParser((cmd) => commands.push(cmd));

  parser.feed(Buffer.from('PING\r\n'));
  parser.feed(Buffer.from('SET key "hello world"\r\n'));

  assert.strictEqual(commands.length, 2);
  assert.deepStrictEqual(commands[0], ['PING']);
  assert.deepStrictEqual(commands[1], ['SET', 'key', 'hello world']);
});
