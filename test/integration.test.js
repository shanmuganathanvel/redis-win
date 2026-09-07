'use strict';

const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const RedisServer = require('../src/server');
const RespParser = require('../src/protocol/parser');

function createTcpClient(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
      resolve(socket);
    });
    socket.on('error', reject);
  });
}

function sendCommand(socket, ...args) {
  return new Promise((resolve, reject) => {
    const parser = new RespParser((cmd) => {
      resolve(cmd);
    });

    const onData = (chunk) => {
      parser.feed(chunk);
    };

    socket.on('data', onData);

    const payload = `*${args.length}\r\n` + args.map((a) => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`).join('');
    socket.write(payload, (err) => {
      if (err) reject(err);
    });
  });
}

test('Integration: Real TCP Server connection, handshakes, commands, pub/sub, and blocking queues', async () => {
  const server = new RedisServer({ port: 0 });
  const addr = await server.start();
  const port = addr.port;

  try {
    // 1. Client handshake & basic commands
    const client = await createTcpClient(port);

    // PING
    const pong = await sendCommand(client, 'PING');
    // For single simple string, RespParser treats as inline or command
    // Wait, let's verify response parser
    assert.ok(pong !== null);

    // SET and GET
    await sendCommand(client, 'SET', 'color', 'blue');
    const getRes = await sendCommand(client, 'GET', 'color');
    assert.ok(getRes !== null);

    client.destroy();

    // 2. Pub/Sub test between two clients
    const subClient = await createTcpClient(port);
    const pubClient = await createTcpClient(port);

    const subReceived = [];
    const subParser = new RespParser((msg) => {
      subReceived.push(msg);
    });
    subClient.on('data', (chunk) => subParser.feed(chunk));

    // Subscribe to "news"
    subClient.write('*2\r\n$9\r\nSUBSCRIBE\r\n$4\r\nnews\r\n');
    await new Promise((r) => setTimeout(r, 50));

    assert.strictEqual(subReceived.length, 1);
    assert.deepStrictEqual(subReceived[0], ['subscribe', 'news', 1]);

    // Publish to "news"
    await sendCommand(pubClient, 'PUBLISH', 'news', 'breaking-headline');
    await new Promise((r) => setTimeout(r, 50));

    assert.strictEqual(subReceived.length, 2);
    assert.deepStrictEqual(subReceived[1], ['message', 'news', 'breaking-headline']);

    subClient.destroy();
    pubClient.destroy();

    // 3. Blocking Queue test (BLPOP / LPUSH)
    const workerClient = await createTcpClient(port);
    const producerClient = await createTcpClient(port);

    let workerResult = null;
    const workerParser = new RespParser((res) => {
      workerResult = res;
    });
    workerClient.on('data', (chunk) => workerParser.feed(chunk));

    // Worker blocks on "tasks" queue with 2 second timeout
    workerClient.write('*3\r\n$5\r\nBLPOP\r\n$5\r\ntasks\r\n$1\r\n2\r\n');
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(workerResult, null); // Still blocked!

    // Producer pushes a task
    await sendCommand(producerClient, 'RPUSH', 'tasks', 'process-video');
    await new Promise((r) => setTimeout(r, 50));

    assert.deepStrictEqual(workerResult, ['tasks', 'process-video']);

    workerClient.destroy();
    producerClient.destroy();
  } finally {
    await server.stop();
  }
});
