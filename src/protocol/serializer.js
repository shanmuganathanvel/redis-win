'use strict';

const CRLF = '\r\n';
const CRLF_BUF = Buffer.from('\r\n');
const NULL_BULK = Buffer.from('$-1\r\n');
const NULL_ARRAY = Buffer.from('*-1\r\n');
const OK = Buffer.from('+OK\r\n');
const PONG = Buffer.from('+PONG\r\n');
const QUEUED = Buffer.from('+QUEUED\r\n');

/**
 * Serializes a simple string.
 * @param {string} str
 * @returns {Buffer}
 */
function serializeSimpleString(str) {
  return Buffer.from(`+${str}${CRLF}`);
}

/**
 * Serializes an error message.
 * @param {string|Error} err
 * @returns {Buffer}
 */
function serializeError(err) {
  const msg = typeof err === 'string' ? err : err.message || 'ERR unknown error';
  if (msg.startsWith('ERR') || msg.startsWith('WRONGTYPE') || msg.startsWith('NOAUTH') || msg.startsWith('NOSCRIPT')) {
    return Buffer.from(`-${msg}${CRLF}`);
  }
  return Buffer.from(`-ERR ${msg}${CRLF}`);
}

/**
 * Serializes an integer.
 * @param {number|bigint} num
 * @returns {Buffer}
 */
function serializeInteger(num) {
  return Buffer.from(`:${Math.floor(Number(num))}${CRLF}`);
}

/**
 * Serializes a bulk string (supports string, Buffer, or null).
 * @param {string|Buffer|null|undefined} val
 * @returns {Buffer}
 */
function serializeBulkString(val) {
  if (val === null || val === undefined) {
    return NULL_BULK;
  }

  let buf;
  if (Buffer.isBuffer(val)) {
    buf = val;
  } else {
    buf = Buffer.from(String(val));
  }

  const prefix = Buffer.from(`$${buf.length}${CRLF}`);
  return Buffer.concat([prefix, buf, CRLF_BUF]);
}

/**
 * Serializes an array of RESP elements.
 * @param {Array<any>|null|undefined} arr
 * @returns {Buffer}
 */
function serializeArray(arr) {
  if (arr === null || arr === undefined) {
    return NULL_ARRAY;
  }

  const header = Buffer.from(`*${arr.length}${CRLF}`);
  const chunks = [header];

  for (let i = 0; i < arr.length; i++) {
    chunks.push(serialize(arr[i]));
  }

  return Buffer.concat(chunks);
}

/**
 * Automatically infers RESP type and serializes.
 * @param {any} val
 * @returns {Buffer}
 */
function serialize(val) {
  if (val === null || val === undefined) {
    return NULL_BULK;
  }
  if (Buffer.isBuffer(val)) {
    return serializeBulkString(val);
  }
  if (typeof val === 'number' || typeof val === 'bigint') {
    return serializeInteger(val);
  }
  if (typeof val === 'boolean') {
    return serializeInteger(val ? 1 : 0);
  }
  if (Array.isArray(val)) {
    return serializeArray(val);
  }
  if (val instanceof Error) {
    return serializeError(val);
  }
  if (typeof val === 'object') {
    if (val.type === 'simple') {
      return serializeSimpleString(val.value);
    }
    if (val.type === 'error') {
      return serializeError(val.value);
    }
    if (val.type === 'raw' && Buffer.isBuffer(val.value)) {
      return val.value;
    }
  }
  return serializeBulkString(val);
}

module.exports = {
  CRLF,
  CRLF_BUF,
  NULL_BULK,
  NULL_ARRAY,
  OK,
  PONG,
  QUEUED,
  serializeSimpleString,
  serializeError,
  serializeInteger,
  serializeBulkString,
  serializeArray,
  serialize,
};
