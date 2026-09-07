'use strict';

const net = require('net');

/**
 * A tiny zero-dependency Redis client to test redis-win interactively!
 */
function createClient(port = 6379, host = '127.0.0.1') {
  const socket = net.createConnection({ port, host });
  let queue = [];
  let buffer = '';

  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    // Simple response processor for demo purposes
    while (buffer.includes('\r\n')) {
      const crlf = buffer.indexOf('\r\n');
      const line = buffer.slice(0, crlf);
      buffer = buffer.slice(crlf + 2);

      if (queue.length > 0) {
        const { resolve } = queue.shift();
        resolve(line);
      }
    }
  });

  function send(...args) {
    return new Promise((resolve) => {
      queue.push({ resolve });
      const payload = `*${args.length}\r\n` + args.map((a) => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`).join('');
      socket.write(payload);
    });
  }

  return {
    socket,
    send,
    close: () => socket.end(),
  };
}

async function runDemo() {
  console.log(' Connecting to redis-win on 127.0.0.1:6379...\n');
  const client = createClient();

  await new Promise((resolve) => client.socket.on('connect', resolve));
  console.log(' Connected successfully!\n');

  console.log('1. Testing PING:');
  const pong = await client.send('PING');
  console.log('   Response:', pong);

  console.log('\n2. Testing SET & GET:');
  const setRes = await client.send('SET', 'greeting', 'Hello from Windows!');
  console.log('   SET greeting:', setRes);
  const getRes = await client.send('GET', 'greeting');
  console.log('   GET greeting:');
  // Read bulk string body
  const body = await new Promise((r) => {
    client.socket.once('data', (d) => r(d.toString().trim()));
  });
  console.log('   Value:', body);

  console.log('\n3. Testing INCR:');
  const incrRes = await client.send('INCR', 'page_views');
  console.log('   INCR page_views:', incrRes);

  console.log('\n4. Testing Hashes (HSET):');
  const hsetRes = await client.send('HSET', 'user:1', 'name', 'Shanmuganathan', 'role', 'developer');
  console.log('   HSET user:1:', hsetRes);

  console.log('\n5. Testing Lists (RPUSH & LLEN):');
  const rpushRes = await client.send('RPUSH', 'tasks', 'task-1', 'task-2');
  console.log('   RPUSH tasks:', rpushRes);
  const llenRes = await client.send('LLEN', 'tasks');
  console.log('   LLEN tasks:', llenRes);

  console.log('\n All basic tests executed successfully!');
  client.close();
}

runDemo().catch((err) => {
  console.error('Error connecting to server. Is `npm start` running?', err.message);
});
