# redis-win 🚀

> **Ultra-lightweight, zero-dependency Redis replacement for Windows (and cross-platform).**  
> Run directly with `npx redis-win` without Docker, WSL2, or native C++ compilers.

[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 💡 Why redis-win?

On Windows, running standard Redis natively is notoriously cumbersome:
- Native Windows Redis ports are outdated or unmaintained.
- Docker Desktop requires WSL2, Hyper-V, and eats multiple gigabytes of RAM.
- Junior developers, students, or locked-down corporate laptops often cannot install Docker or WSL2.

**redis-win** solves this completely:
- **Zero External Dependencies**: Built 100% on Node.js standard libraries (`net`, `buffer`, `events`, `fs`).
- **Instant Setup**: Start in under 2 seconds with `npx redis-win`.
- **Drop-in Client Compatibility**: Speaks standard RESP (Redis Serialization Protocol) over TCP port 6379.
- **Micro Footprint**: Takes only ~15–25 MB of RAM.
- **Supports Modern Handshakes**: Fully compatible with `ioredis`, `redis` (npm), `redis-py` (Python), BullMQ, Spring Data Redis, Celery, and `redis-cli`.

---

## ⚡ Quick Start

### Run immediately with `npx` (No installation needed)
```bash
npx redis-win
```

### Or install globally
```bash
npm install -g redis-win
redis-win
```

You will see:
```text
                _._                                                  
           _.-""\\\"""-._                                          
      _.-""\\\\\\""-._        redis-win v1.0.0                 
 .-"\\\\\\\\\\"-._     Port: 6379                             
|\\\\\\\\\\\\|    PID:  12345                              
|\\\\\\\\\\\\|                                                 
|\\\\\\\\\\\\|    Zero-dependency Redis replacement            
 '-._\\\\\\\\\\_.-'    Ready to accept connections                  
     '-._\\\\\\_.-'                                               
         '-._\\\_.-'                                                   
             `-.\`                                                   

[redis-win] Listening on 127.0.0.1:6379
```

---

## 🛠️ CLI Options

```bash
redis-win [options]
```

| Option | Shorthand | Description | Default |
|---|---|---|---|
| `--port <port>` | `-p` | Port to listen on (or via `REDIS_PORT` env) | `6379` |
| `--host <host>` | `-h` | Bind IP address | `127.0.0.1` |
| `--auth <password>` | `-a` | Require client authentication password | `none` |
| `--save <filepath>` | | File path to save/restore data across restarts | `./redis-dump.json` (enabled) |
| `--no-save` | | Disable persistence and run purely in-memory | `false` |
| `--verbose` | `-v` | Log every client connection and event | `false` |
| `--help` | | Show help screen | |
| `--version` | | Show version number | |

### Examples
```bash
# Start server with persistence enabled by default
npx redis-win

# Run purely in-memory (no disk saves)
npx redis-win --no-save

# Run with custom dump file path
npx redis-win --save ./data/my-dump.json

# Run on custom port with password authentication
npx redis-win --port 6380 --auth mysecretpassword
```

---

## 🔌 Connecting from Applications

### 1. Node.js with `ioredis`
```javascript
const Redis = require('ioredis');
const redis = new Redis(); // connects to 127.0.0.1:6379 by default

async function test() {
  await redis.set('user:session', 'active', 'EX', 3600);
  const session = await redis.get('user:session');
  console.log('Session:', session);
}
test();
```

### 2. Node.js with BullMQ (Background Queues)
```javascript
const { Queue, Worker } = require('bullmq');

const myQueue = new Queue('paint', { connection: { host: '127.0.0.1', port: 6379 } });
const worker = new Worker('paint', async (job) => {
  console.log('Processing job:', job.name, job.data);
}, { connection: { host: '127.0.0.1', port: 6379 } });

await myQueue.add('cars', { color: 'blue' });
```

### 3. Python (`redis-py`)
```python
import redis

r = redis.Redis(host='localhost', port=6379, db=0)
r.set('foo', 'bar')
print(r.get('foo'))  # b'bar'
```

### 4. Standard `redis-cli`
```bash
redis-cli
127.0.0.1:6379> PING
PONG
127.0.0.1:6379> SET test 123
OK
127.0.0.1:6379> GET test
"123"
```

---

## 📋 Supported Commands

### Server & Connection
- `PING`, `ECHO`, `QUIT`, `SELECT`, `AUTH`
- `INFO` (full server info output for client handshakes)
- `COMMAND`, `COMMAND DOCS`, `COMMAND COUNT`
- `CLIENT SETNAME`, `CLIENT GETNAME`, `CLIENT LIST`, `CLIENT SETINFO`
- `HELLO` (RESP protocol negotiation)
- `TIME`

### Generic Keys & TTL
- `DEL`, `UNLINK`, `EXISTS`, `TYPE`, `KEYS`, `SCAN`
- `EXPIRE`, `EXPIREAT`, `PEXPIRE`, `PEXPIREAT`, `TTL`, `PTTL`, `PERSIST`
- `RENAME`, `RENAMENX`, `FLUSHDB`, `FLUSHALL`, `DBSIZE`

### Strings
- `GET`, `SET` (supports `EX`, `PX`, `EXAT`, `PXAT`, `NX`, `XX`, `KEEPTTL`, `GET`)
- `SETNX`, `SETEX`, `PSETEX`, `GETSET`, `STRLEN`, `APPEND`
- `INCR`, `DECR`, `INCRBY`, `DECRBY`, `INCRBYFLOAT`
- `MGET`, `MSET`, `MSETNX`

### Hashes
- `HSET`, `HGET`, `HSETNX`, `HMSET`, `HMGET`, `HDEL`, `HEXISTS`
- `HGETALL`, `HKEYS`, `HVALS`, `HLEN`, `HINCRBY`, `HINCRBYFLOAT`, `HSCAN`

### Lists (Queues & Stacks)
- `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LRANGE`, `LLEN`
- `LINDEX`, `LSET`, `LREM`
- `BLPOP`, `BRPOP` (blocking list pops with timeout support)

### Sets
- `SADD`, `SREM`, `SMEMBERS`, `SISMEMBER`, `SMISMEMBER`
- `SCARD`, `SPOP`, `SRANDMEMBER`, `SSCAN`

### Sorted Sets (ZSet)
- `ZADD` (supports `NX`, `XX`, `GT`, `LT`, `CH`), `ZREM`
- `ZSCORE`, `ZRANK`, `ZREVRANK`, `ZCARD`, `ZCOUNT`, `ZINCRBY`
- `ZRANGE` (supports `BYSCORE`, `REV`, `LIMIT`, `WITHSCORES`), `ZREVRANGE`, `ZRANGEBYSCORE`, `ZREVRANGEBYSCORE`

### Pub / Sub
- `SUBSCRIBE`, `UNSUBSCRIBE`
- `PSUBSCRIBE`, `PUNSUBSCRIBE`
- `PUBLISH`
- `PUBSUB CHANNELS`, `PUBSUB NUMSUB`, `PUBSUB NUMPAT`

### Transactions
- `MULTI`, `EXEC`, `DISCARD`, `WATCH`, `UNWATCH`

---

## 🧪 Testing

Run the automated test suite (uses Node's native test runner, zero extra dependencies):

```bash
npm test
```

---

## 📄 License

MIT © 2026
