'use strict';

const crypto = require('crypto');
const { LuaFactory, LuaThread, LuaEngine } = require('wasmoon');
const { encode: msgpackEncode, decode: msgpackDecode } = require('@msgpack/msgpack');

// Fix wasmoon bug 1: wasmoon crashes with TypeError when attempting to push `null`
// because it checks `target.then` on objects without checking `target !== null`.
const origPushValue = LuaThread.prototype.pushValue;
LuaThread.prototype.pushValue = function (decoratedValue, userdata) {
  const target = (decoratedValue && typeof decoratedValue === 'object' && 'target' in decoratedValue)
    ? decoratedValue.target
    : decoratedValue;
  if (target === null) {
    this.lua.lua_pushnil(this.address);
    return;
  }
  return origPushValue.call(this, decoratedValue, userdata);
};

// Fix wasmoon bug 2: callByteCode moves result to global stack with lua_xmove,
// but only removes the thread in finally, permanently leaking result values
// on the global stack until the stack overflows / triggers memory access out of bounds.
// Furthermore, thread.run(0) already returns evaluated JS values via getStackValues().
LuaEngine.prototype.callByteCode = async function (loader) {
  const thread = this.global.newThread();
  const threadIndex = this.global.getTop();
  try {
    loader(thread);
    const result = await thread.run(0);
    return result.length > 0 ? result[0] : undefined;
  } finally {
    thread.close();
    this.global.setTop(threadIndex - 1);
  }
};

// Fix wasmoon bug 3: doStringSync executes runSync which leaves return values on the stack
const origDoStringSync = LuaEngine.prototype.doStringSync;
LuaEngine.prototype.doStringSync = function (script) {
  const base = this.global.getTop();
  try {
    return origDoStringSync.call(this, script);
  } finally {
    this.global.setTop(base);
  }
};

function sanitizeNulls(obj) {
  if (obj === null) return undefined;
  if (Array.isArray(obj)) return obj.map(sanitizeNulls);
  if (typeof obj === 'object' && obj !== null && !(obj instanceof Uint8Array) && !Buffer.isBuffer(obj)) {
    for (const k of Object.keys(obj)) {
      obj[k] = sanitizeNulls(obj[k]);
    }
  }
  return obj;
}

class ScriptingEngine {
  constructor(server) {
    this.server = server;
    this.scripts = new Map(); // sha1 -> script string
    this.factory = new LuaFactory();
    this.lua = null;
    this.initPromise = null;
    this.currentClient = null;
    this.executionQueue = Promise.resolve();
  }

  async init() {
    if (this.lua) return this.lua;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const lua = await this.factory.createEngine();

      // Compatibility polyfill for unpack (Lua 5.1 in Redis vs Lua 5.4 in wasmoon)
      await lua.doString(`
        if not unpack then unpack = table.unpack end
      `);

      // cmsgpack library
      lua.global.set('cmsgpack', {
        unpack: (val) => {
          let buf;
          if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
            buf = val;
          } else if (typeof val === 'string') {
            buf = Buffer.from(val, 'binary');
          } else {
            throw new Error('Invalid argument to cmsgpack.unpack');
          }
          const decoded = msgpackDecode(buf);
          return sanitizeNulls(decoded);
        },
        pack: (val) => {
          const encoded = msgpackEncode(val);
          return Buffer.from(encoded);
        },
      });

      // cjson library
      lua.global.set('cjson', {
        decode: (str) => sanitizeNulls(JSON.parse(str)),
        encode: (val) => JSON.stringify(val),
      });

      // Bind redis object once to avoid recreating closures & userdata proxies on every EVAL
      lua.global.set('redis', {
        call: (cmdName, ...args) => {
          try {
            const client = this.currentClient;
            if (!client) {
              throw new Error('No active client context for redis.call');
            }
            const stringifiedArgs = args.map((a) => (Buffer.isBuffer(a) ? a : String(a)));
            const res = client.server.registry.execute(client, [String(cmdName), ...stringifiedArgs]);
            return this._redisToLua(res);
          } catch (err) {
            throw new Error(err.message || String(err));
          }
        },
        pcall: (cmdName, ...args) => {
          try {
            const client = this.currentClient;
            if (!client) {
              return { err: 'No active client context for redis.pcall' };
            }
            const stringifiedArgs = args.map((a) => (Buffer.isBuffer(a) ? a : String(a)));
            const res = client.server.registry.execute(client, [String(cmdName), ...stringifiedArgs]);
            return this._redisToLua(res);
          } catch (err) {
            return { err: err.message || String(err) };
          }
        },
        error_reply: (msg) => ({ err: String(msg) }),
        status_reply: (msg) => ({ ok: String(msg) }),
      });

      this.lua = lua;
      return lua;
    })();

    return this.initPromise;
  }

  computeSha1(script) {
    return crypto.createHash('sha1').update(script).digest('hex').toLowerCase();
  }

  loadScript(script) {
    const sha = this.computeSha1(script);
    this.scripts.set(sha, script);
    return sha;
  }

  hasScript(sha) {
    return this.scripts.has(String(sha).toLowerCase());
  }

  getScript(sha) {
    return this.scripts.get(String(sha).toLowerCase()) || null;
  }

  flushScripts() {
    this.scripts.clear();
  }

  _isWasmTrap(err) {
    if (!err) return false;
    if (typeof WebAssembly !== 'undefined' && err instanceof WebAssembly.RuntimeError) {
      return true;
    }
    const msg = String(err.message || err);
    return msg.includes('memory access out of bounds') ||
           msg.includes('unreachable') ||
           msg.includes('table index out of bounds') ||
           msg.includes('integer overflow');
  }

  execute(client, script, keys = [], argv = []) {
    // Queue execution sequentially to guarantee atomicity and thread safety on the Lua VM
    const task = () => this._executeScript(client, script, keys, argv);
    const promise = this.executionQueue.then(task, task);
    this.executionQueue = promise.catch(() => {});
    return promise;
  }

  async _executeScript(client, script, keys = [], argv = []) {
    const lua = await this.init();

    // Cache the script automatically as Redis does on EVAL
    this.loadScript(script);

    this.currentClient = client;

    try {
      // In Lua, KEYS and ARGV are 1-indexed tables
      lua.global.set('KEYS', keys);
      lua.global.set('ARGV', argv);

      const result = await lua.doString(script);
      return this._luaToRedis(result);
    } catch (err) {
      if (this._isWasmTrap(err)) {
        // Destroy trapped WASM instance so next command can start fresh
        try { if (this.lua && this.lua.global) this.lua.global.close(); } catch {}
        this.lua = null;
        this.initPromise = null;
      }
      const msg = err.message || String(err);
      throw new Error(`ERR Error running script (call to ${this.computeSha1(script)}): ${msg}`);
    } finally {
      this.currentClient = null;
      if (this.lua && this.lua.global) {
        try {
          lua.global.set('KEYS', undefined);
          lua.global.set('ARGV', undefined);
          lua.global.setTop(0);
        } catch (cleanupErr) {
          if (this._isWasmTrap(cleanupErr)) {
            try { this.lua.global.close(); } catch {}
            this.lua = null;
            this.initPromise = null;
          }
        }
      }
    }
  }

  _redisToLua(val) {
    if (val === null || val === undefined) {
      return false;
    }
    if (Buffer.isBuffer(val)) {
      const str = val.toString('utf8');
      if (str.startsWith('+') && str.endsWith('\r\n')) {
        return { ok: str.slice(1, -2) };
      }
      return val;
    }
    if (typeof val === 'object') {
      if (val.type === 'simple') {
        return { ok: val.value };
      }
      if (val.type === 'error') {
        return { err: val.value };
      }
      if (Array.isArray(val)) {
        return val.map((item) => this._redisToLua(item));
      }
    }
    if (typeof val === 'boolean') {
      return val ? 1 : 0;
    }
    return val;
  }

  _luaToRedis(val) {
    if (val === null || val === undefined || val === false) {
      return null;
    }
    if (val === true) {
      return 1;
    }
    if (typeof val === 'number') {
      return Math.floor(val);
    }
    if (typeof val === 'string' || Buffer.isBuffer(val)) {
      return val;
    }
    if (typeof val === 'object') {
      if (val.ok !== undefined) {
        return { type: 'simple', value: String(val.ok) };
      }
      if (val.err !== undefined) {
        throw new Error(String(val.err));
      }
      if (Array.isArray(val)) {
        return val.map((item) => this._luaToRedis(item));
      }
      // If it's a Lua dictionary table
      const result = [];
      for (const [k, v] of Object.entries(val)) {
        result.push(k, this._luaToRedis(v));
      }
      return result;
    }
    return String(val);
  }
}

module.exports = ScriptingEngine;
