# redis-win 🚀

> **Ultra-lightweight Redis replacement for Windows, macOS, and Linux.**  
> Built for developers who can't install Docker or WSL2. Run instantly with `npx redis-win`.

[![CI](https://github.com/shanmuganathanvel/redis-win/actions/workflows/ci.yml/badge.svg)](https://github.com/shanmuganathanvel/redis-win/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#)
[![Zero C++ Compilers](https://img.shields.io/badge/native%20build%20tools-none-orange.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 💡 Why redis-win?

On Windows machines, running standard Redis is notoriously painful:
- 🚫 **Docker Desktop** is heavy, eats 3–5 GB of RAM, and requires WSL2 / Hyper-V virtualization (often locked down on corporate laptops).
- 🚫 **Official Redis** does not provide native Windows binaries (Microsoft's archive is abandoned since Redis 3.x).
- 🚫 **Native C++ Addons** require `windows-build-tools`, Python, and Visual Studio compilers, which frequently fail during installation.

### The Solution:
**redis-win** is a standalone, lightweight Redis server that runs directly on Node.js:
- ⚡ **Instant Execution**: Run `npx redis-win` — starts in under 1 second.
- 🪶 **Minimal Footprint**: Uses only ~25–35 MB of RAM.
- 🔌 **Drop-in Compatibility**: Speaks standard RESP (Redis Serialization Protocol) on TCP port 6379.
- 🦾 **Full BullMQ Support**: Built-in WebAssembly Lua engine (`wasmoon`) with `cjson` and `cmsgpack` so modern queue libraries like BullMQ work out of the box.
- 💾 **Default Auto-Persistence**: Automatically saves data to disk (`./redis-dump.json`) and restores across restarts.
- 🛠️ **Zero C++ Build Tools**: 100% pure JavaScript and WebAssembly — no `node-gyp`, no Python, no Visual Studio build tools needed.

---

## ⚡ Quick Start

### 1. Run immediately via `npx` (No installation needed)
```bash
npx redis-win
```

### 2. Or install globally
```bash
npm install -g redis-win
redis-win
```

Upon launching, you will see the startup banner:
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
[redis-win] Snapshot persistence enabled: ./redis-dump.json
```

---

## 🛠️ CLI Options

```bash
redis-win [options]
```

| Option | Shorthand | Description | Default |
|---|---|---|---|
| `--port <port>` | `-p` | Port to listen on (or via `REDIS_PORT` / `PORT` env) | `6379` |
| `--host <host>` | `-h` | Bind IP address | `127.0.0.1` |
| `--auth <password>` | `-a` | Require password authentication | `none` |
| `--save <filepath>` | | File path to save/restore data across restarts | `./redis-dump.json` |
| `--no-save` | | Disable persistence and run purely in-memory | `false` |
| `--verbose` | `-v` | Log every client connection and event | `false` |
| `--help` | | Show help screen | |
| `--version` | | Show version number | |

### Examples
```bash
# Start server with persistence enabled by default
npx redis-win

# Run purely in-memory (no disk writes, ideal for CI/tests)
npx redis-win --no-save

# Run with custom snapshot file location
npx redis-win --save ./data/my-dump.json

# Run on custom port with password authentication
npx redis-win --port 6380 --auth mysecretpassword
```

---

## 💾 Persistence Across Restarts

`redis-win` includes built-in snapshot persistence enabled by default:
- **On Startup**: Automatically loads and restores all keys, hashes, lists, sets, sorted sets, and remaining TTL expiry timers from `./redis-dump.json`.
- **While Running**: Automatically saves a snapshot every 60 seconds in the background.
- **On Shutdown (`Ctrl + C`)**: Flushes all in-memory data to disk before exiting.
- **On-Demand**: Connected applications can trigger immediate saves at any time using standard Redis commands:
  ```text
  SAVE
  # or
  BGSAVE
  ```

---

## 🔌 Connecting from Applications

### 1. Node.js with BullMQ (Background Job Queues)
Because `redis-win` includes a WebAssembly Lua engine with `cmsgpack` and `cjson`, **BullMQ works seamlessly**:

```javascript
const { Queue, Worker } = require('bullmq');

const connection = { host: '127.0.0.1', port: 6379 };

// Create Queue
const emailQueue = new Queue('emails', { connection });

// Add Job
await emailQueue.add('send-welcome', { email: 'user@example.com' });

// Process Job
const worker = new Worker('emails', async (job) => {
  console.log(`Processing ${job.name} for ${job.data.email}`);
}, { connection });
```

### 2. Node.js with `ioredis`
```javascript
const Redis = require('ioredis');
const redis = new Redis(); // connects to 127.0.0.1:6379 by default

async function demo() {
  await redis.set('user:session', 'active', 'EX', 3600);
  const session = await redis.get('user:session');
  console.log('Session:', session);

  await redis.hset('profile:1', 'name', 'Shanmuganathan', 'role', 'developer');
  const profile = await redis.hgetall('profile:1');
  console.log('Profile:', profile);
}
demo();
```

### 3. Python (`redis-py`)
```python
import redis

r = redis.Redis(host='localhost', port=6379, db=0)
r.set('greeting', 'Hello from Windows!')
print(r.get('greeting').decode('utf-8'))  # "Hello from Windows!"
```

### 4. Standard `redis-cli`
```bash
redis-cli
127.0.0.1:6379> PING
PONG
127.0.0.1:6379> SET status "operational"
OK
127.0.0.1:6379> GET status
"operational"
```

---

## 📋 Supported Commands

### Server & Connection
- `PING`, `ECHO`, `QUIT`, `SELECT`, `AUTH`
- `INFO` (full server info output for client handshakes)
- `COMMAND`, `COMMAND DOCS`, `COMMAND COUNT`
- `CLIENT SETNAME`, `CLIENT GETNAME`, `CLIENT LIST`, `CLIENT SETINFO`
- `HELLO` (RESP protocol negotiation)
- `TIME`, `SAVE`, `BGSAVE`, `LASTSAVE`

### Generic Keys & TTL Expiration
- `DEL`, `UNLINK`, `EXISTS`, `TYPE`, `KEYS` (glob pattern matching `*`, `?`, `[...]`), `SCAN`
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

### Lists & Queues
- `LPUSH`, `RPUSH`, `LPOP`, `RPOP`, `LRANGE`, `LLEN`
- `LINDEX`, `LSET`, `LREM`, `RPOPLPUSH`, `LMOVE`
- `BLPOP`, `BRPOP` (blocking queue pops with timeout support)

### Sets
- `SADD`, `SREM`, `SMEMBERS`, `SISMEMBER`, `SMISMEMBER`
- `SCARD`, `SPOP`, `SRANDMEMBER`, `SSCAN`

### Sorted Sets (ZSet)
- `ZADD` (supports `NX`, `XX`, `GT`, `LT`, `CH`), `ZREM`
- `ZSCORE`, `ZRANK`, `ZREVRANK`, `ZCARD`, `ZCOUNT`, `ZINCRBY`
- `ZRANGE` (supports `BYSCORE`, `REV`, `LIMIT`, `WITHSCORES`), `ZREVRANGE`, `ZRANGEBYSCORE`, `ZREVRANGEBYSCORE`
- `ZREMRANGEBYSCORE`, `ZREMRANGEBYRANK`, `ZREMRANGEBYLEX`, `ZPOPMIN`, `ZPOPMAX`

### Redis Streams
- `XADD`, `XLEN`, `XRANGE`, `XREVRANGE`, `XDEL`, `XTRIM`, `XREAD`

### Lua Scripting Engine
- `EVAL`, `EVALSHA`, `SCRIPT LOAD`, `SCRIPT EXISTS`, `SCRIPT FLUSH`
- Built-in libraries: `redis.call()`, `redis.pcall()`, `cjson` (`encode`/`decode`), `cmsgpack` (`pack`/`unpack`).

### Pub / Sub Messaging
- `SUBSCRIBE`, `UNSUBSCRIBE`
- `PSUBSCRIBE`, `PUNSUBSCRIBE`
- `PUBLISH`
- `PUBSUB CHANNELS`, `PUBSUB NUMSUB`, `PUBSUB NUMPAT`

### Transactions
- `MULTI`, `EXEC`, `DISCARD`, `WATCH`, `UNWATCH`

---

## 🧪 Testing

The test suite runs using Node.js's native test runner (`node:test`):

```bash
npm test
```

All 35 automated tests cover:
- Protocol streaming parsing and serialization
- Strings, Hashes, Lists, Sets, Sorted Sets, and Streams
- Active and passive TTL expiration
- Multi/Exec transactions and watched keys
- Pub/Sub multi-client routing
- Real BullMQ Lua scripts (`moveToActive`, `moveToFinished`, MessagePack encode/decode)
- Snapshot persistence save and recovery
- Real TCP socket communication

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
Feel free to check out the [issues page](https://github.com/shanmuganathanvel/redis-win/issues).

---

## 📄 License

MIT © [Shanmuganathan Palanivel](https://github.com/shanmuganathanvel)
