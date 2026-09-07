'use strict';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Streaming RESP2 / Inline parser for Redis commands.
 * Handles partial TCP packets, pipelined commands, multi-bulk commands,
 * and inline telnet-style commands.
 */
class RespParser {
  constructor(onCommand) {
    this.onCommand = onCommand;
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Feed new incoming chunk of data from TCP socket.
   * @param {Buffer} chunk
   */
  feed(chunk) {
    if (this.buffer.length === 0) {
      this.buffer = chunk;
    } else {
      this.buffer = Buffer.concat([this.buffer, chunk]);
    }

    this._parse();
  }

  _parse() {
    while (this.buffer.length > 0) {
      const firstByte = this.buffer[0];

      if (firstByte === 42) { // '*' Multi-bulk (Array)
        const parsed = this._parseArray(0);
        if (parsed === null) {
          // Incomplete packet, wait for more data
          break;
        }
        const { value, nextPos } = parsed;
        this.buffer = this.buffer.subarray(nextPos);
        if (Array.isArray(value) && value.length > 0) {
          this.onCommand(value);
        }
      } else {
        // Inline command (e.g. "PING\r\n" or "SET foo bar\r\n")
        const parsed = this._parseInline(0);
        if (parsed === null) {
          // Incomplete inline command, wait for more data
          break;
        }
        const { value, nextPos } = parsed;
        this.buffer = this.buffer.subarray(nextPos);
        if (Array.isArray(value) && value.length > 0) {
          this.onCommand(value);
        }
      }
    }
  }

  /**
   * Find index of CRLF (\r\n) starting from offset.
   * @param {number} offset
   * @returns {number} Index of \r, or -1 if not found
   */
  _findCRLF(offset) {
    for (let i = offset; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === 13 && this.buffer[i + 1] === 10) { // \r = 13, \n = 10
        return i;
      }
    }
    return -1;
  }

  /**
   * Parse inline command separated by CRLF.
   * @param {number} startPos
   */
  _parseInline(startPos) {
    const crlf = this._findCRLF(startPos);
    if (crlf === -1) {
      return null;
    }

    const line = this.buffer.toString('utf8', startPos, crlf).trim();
    const nextPos = crlf + 2;

    if (!line) {
      return { value: [], nextPos };
    }

    // Split line respecting quotes if any
    const args = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === quoteChar) {
          inQuote = false;
        } else {
          current += ch;
        }
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (/\s/.test(ch)) {
        if (current.length > 0) {
          args.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }
    if (current.length > 0) {
      args.push(current);
    }

    return { value: args, nextPos };
  }

  /**
   * Parse RESP Array at startPos.
   * @param {number} startPos
   */
  _parseArray(startPos) {
    const crlf = this._findCRLF(startPos);
    if (crlf === -1) {
      return null;
    }

    const countStr = this.buffer.toString('utf8', startPos + 1, crlf);
    const count = parseInt(countStr, 10);
    if (isNaN(count)) {
      throw new Error(`Protocol error: invalid multibulk length "${countStr}"`);
    }

    if (count === -1) {
      return { value: null, nextPos: crlf + 2 };
    }

    let pos = crlf + 2;
    const elements = [];

    for (let i = 0; i < count; i++) {
      if (pos >= this.buffer.length) {
        return null; // Need more data
      }

      const elemType = this.buffer[pos];
      if (elemType === 36) { // '$' Bulk string
        const parsed = this._parseBulkString(pos);
        if (parsed === null) {
          return null; // Incomplete
        }
        elements.push(parsed.value);
        pos = parsed.nextPos;
      } else if (elemType === 42) { // '*' Nested array
        const parsed = this._parseArray(pos);
        if (parsed === null) {
          return null;
        }
        elements.push(parsed.value);
        pos = parsed.nextPos;
      } else if (elemType === 43) { // '+' Simple string
        const parsed = this._parseSimpleString(pos);
        if (parsed === null) {
          return null;
        }
        elements.push(parsed.value);
        pos = parsed.nextPos;
      } else if (elemType === 58) { // ':' Integer
        const parsed = this._parseInteger(pos);
        if (parsed === null) {
          return null;
        }
        elements.push(parsed.value);
        pos = parsed.nextPos;
      } else {
        throw new Error(`Protocol error: unsupported element type "${String.fromCharCode(elemType)}"`);
      }
    }

    return { value: elements, nextPos: pos };
  }

  /**
   * Parse Bulk String ($<len>\r\n<data>\r\n).
   * @param {number} startPos
   */
  _parseBulkString(startPos) {
    const crlf = this._findCRLF(startPos);
    if (crlf === -1) {
      return null;
    }

    const lenStr = this.buffer.toString('utf8', startPos + 1, crlf);
    const len = parseInt(lenStr, 10);
    if (isNaN(len)) {
      throw new Error(`Protocol error: invalid bulk length "${lenStr}"`);
    }

    if (len === -1) {
      return { value: null, nextPos: crlf + 2 };
    }

    const dataStart = crlf + 2;
    const dataEnd = dataStart + len;
    const fullEnd = dataEnd + 2; // Including trailing \r\n

    if (this.buffer.length < fullEnd) {
      return null; // Incomplete
    }

    // Verify trailing \r\n
    if (this.buffer[dataEnd] !== 13 || this.buffer[dataEnd + 1] !== 10) {
      throw new Error('Protocol error: bulk string not terminated by CRLF');
    }

    const rawBuf = this.buffer.subarray(dataStart, dataEnd);
    let value;
    try {
      value = utf8Decoder.decode(rawBuf);
    } catch {
      value = Buffer.from(rawBuf);
    }
    return { value, nextPos: fullEnd };
  }

  /**
   * Parse Simple String (+<data>\r\n).
   * @param {number} startPos
   */
  _parseSimpleString(startPos) {
    const crlf = this._findCRLF(startPos);
    if (crlf === -1) return null;
    const value = this.buffer.toString('utf8', startPos + 1, crlf);
    return { value, nextPos: crlf + 2 };
  }

  /**
   * Parse Integer (:<num>\r\n).
   * @param {number} startPos
   */
  _parseInteger(startPos) {
    const crlf = this._findCRLF(startPos);
    if (crlf === -1) return null;
    const numStr = this.buffer.toString('utf8', startPos + 1, crlf);
    const value = parseInt(numStr, 10);
    return { value, nextPos: crlf + 2 };
  }
}

module.exports = RespParser;
