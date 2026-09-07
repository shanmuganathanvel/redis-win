'use strict';

class RedisList {
  constructor(initialItems = []) {
    this.items = [...initialItems];
  }

  pushLeft(...elements) {
    // LPUSH adds elements from left to right at the head
    for (const el of elements) {
      this.items.unshift(String(el));
    }
    return this.items.length;
  }

  pushRight(...elements) {
    for (const el of elements) {
      this.items.push(String(el));
    }
    return this.items.length;
  }

  popLeft(count = 1) {
    if (this.items.length === 0) return null;
    if (count === 1) {
      return this.items.shift();
    }
    const popped = [];
    for (let i = 0; i < count && this.items.length > 0; i++) {
      popped.push(this.items.shift());
    }
    return popped;
  }

  popRight(count = 1) {
    if (this.items.length === 0) return null;
    if (count === 1) {
      return this.items.pop();
    }
    const popped = [];
    for (let i = 0; i < count && this.items.length > 0; i++) {
      popped.push(this.items.pop());
    }
    return popped;
  }

  popRightPushLeft(destinationList) {
    if (this.items.length === 0) return null;
    const item = this.items.pop();
    destinationList.pushLeft(item);
    return item;
  }

  move(destinationList, whereFrom = 'LEFT', whereTo = 'RIGHT') {
    if (this.items.length === 0) return null;
    const item = whereFrom.toUpperCase() === 'LEFT' ? this.items.shift() : this.items.pop();
    if (whereTo.toUpperCase() === 'LEFT') {
      destinationList.pushLeft(item);
    } else {
      destinationList.pushRight(item);
    }
    return item;
  }

  len() {
    return this.items.length;
  }

  get(index) {
    let idx = index;
    if (idx < 0) idx = this.items.length + idx;
    if (idx < 0 || idx >= this.items.length) return null;
    return this.items[idx];
  }

  set(index, element) {
    let idx = index;
    if (idx < 0) idx = this.items.length + idx;
    if (idx < 0 || idx >= this.items.length) {
      throw new Error('ERR index out of range');
    }
    this.items[idx] = String(element);
  }

  range(start, stop) {
    const len = this.items.length;
    let s = start < 0 ? len + start : start;
    let e = stop < 0 ? len + stop : stop;
    if (s < 0) s = 0;
    if (s >= len || s > e) return [];
    if (e >= len) e = len - 1;
    return this.items.slice(s, e + 1);
  }

  rem(count, element) {
    const target = String(element);
    let removed = 0;

    if (count === 0) {
      // Remove all occurrences
      const originalLen = this.items.length;
      this.items = this.items.filter((item) => item !== target);
      return originalLen - this.items.length;
    }

    if (count > 0) {
      // Remove first count occurrences head to tail
      const newItems = [];
      for (let i = 0; i < this.items.length; i++) {
        if (this.items[i] === target && removed < count) {
          removed++;
        } else {
          newItems.push(this.items[i]);
        }
      }
      this.items = newItems;
      return removed;
    }

    // count < 0: Remove |count| occurrences tail to head
    const limit = Math.abs(count);
    const newItems = [];
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i] === target && removed < limit) {
        removed++;
      } else {
        newItems.unshift(this.items[i]);
      }
    }
    this.items = newItems;
    return removed;
  }
}

class RedisSet {
  constructor(initialMembers = []) {
    this.members = new Set(initialMembers.map(String));
  }

  add(...members) {
    let added = 0;
    for (const m of members) {
      const str = String(m);
      if (!this.members.has(str)) {
        this.members.add(str);
        added++;
      }
    }
    return added;
  }

  rem(...members) {
    let removed = 0;
    for (const m of members) {
      const str = String(m);
      if (this.members.delete(str)) {
        removed++;
      }
    }
    return removed;
  }

  has(member) {
    return this.members.has(String(member));
  }

  getAll() {
    return Array.from(this.members);
  }

  size() {
    return this.members.size;
  }

  pop(count = 1) {
    const arr = Array.from(this.members);
    if (arr.length === 0) return null;
    const popped = [];
    const limit = Math.min(count, arr.length);
    for (let i = 0; i < limit; i++) {
      const idx = Math.floor(Math.random() * this.members.size);
      const current = Array.from(this.members)[idx];
      this.members.delete(current);
      popped.push(current);
    }
    return count === 1 ? popped[0] : popped;
  }

  randomMember(count = 1) {
    const arr = Array.from(this.members);
    if (arr.length === 0) return null;
    if (count === 1) {
      return arr[Math.floor(Math.random() * arr.length)];
    }
    const result = [];
    for (let i = 0; i < Math.abs(count); i++) {
      result.push(arr[Math.floor(Math.random() * arr.length)]);
    }
    return result;
  }
}

class RedisHash {
  constructor() {
    this.fields = new Map();
  }

  set(field, value) {
    const key = String(field);
    const isNew = !this.fields.has(key);
    this.fields.set(key, String(value));
    return isNew ? 1 : 0;
  }

  get(field) {
    const key = String(field);
    return this.fields.has(key) ? this.fields.get(key) : null;
  }

  del(...fields) {
    let deleted = 0;
    for (const f of fields) {
      if (this.fields.delete(String(f))) {
        deleted++;
      }
    }
    return deleted;
  }

  has(field) {
    return this.fields.has(String(field));
  }

  getAll() {
    const entries = [];
    for (const [k, v] of this.fields.entries()) {
      entries.push(k, v);
    }
    return entries;
  }

  keys() {
    return Array.from(this.fields.keys());
  }

  values() {
    return Array.from(this.fields.values());
  }

  len() {
    return this.fields.size;
  }
}

class RedisSortedSet {
  constructor() {
    this.memberScores = new Map(); // member -> score (float)
    this.sorted = []; // array of { member: string, score: number }
  }

  _sort() {
    this.sorted.sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      return a.member.localeCompare(b.member);
    });
  }

  add(score, member, options = {}) {
    const strMember = String(member);
    const numScore = parseFloat(score);
    if (isNaN(numScore)) {
      throw new Error('ERR value is not a valid float');
    }

    const exists = this.memberScores.has(strMember);

    if (options.nx && exists) return 0;
    if (options.xx && !exists) return 0;

    const oldScore = this.memberScores.get(strMember);
    if (options.gt && exists && numScore <= oldScore) return 0;
    if (options.lt && exists && numScore >= oldScore) return 0;

    this.memberScores.set(strMember, numScore);

    const existingIdx = this.sorted.findIndex((x) => x.member === strMember);
    if (existingIdx !== -1) {
      this.sorted[existingIdx].score = numScore;
    } else {
      this.sorted.push({ member: strMember, score: numScore });
    }
    this._sort();

    return exists ? (options.ch ? 1 : 0) : 1;
  }

  rem(...members) {
    let removed = 0;
    for (const m of members) {
      const str = String(m);
      if (this.memberScores.delete(str)) {
        removed++;
        const idx = this.sorted.findIndex((x) => x.member === str);
        if (idx !== -1) {
          this.sorted.splice(idx, 1);
        }
      }
    }
    return removed;
  }

  score(member) {
    const str = String(member);
    return this.memberScores.has(str) ? String(this.memberScores.get(str)) : null;
  }

  rank(member, rev = false) {
    const str = String(member);
    if (!this.memberScores.has(str)) return null;
    const idx = this.sorted.findIndex((x) => x.member === str);
    if (idx === -1) return null;
    return rev ? this.sorted.length - 1 - idx : idx;
  }

  card() {
    return this.sorted.length;
  }

  range(start, stop, { rev = false, withScores = false } = {}) {
    let items = rev ? [...this.sorted].reverse() : this.sorted;
    const len = items.length;
    let s = start < 0 ? len + start : start;
    let e = stop < 0 ? len + stop : stop;
    if (s < 0) s = 0;
    if (s >= len || s > e) return [];
    if (e >= len) e = len - 1;

    const sliced = items.slice(s, e + 1);
    if (!withScores) {
      return sliced.map((x) => x.member);
    }
    const result = [];
    for (const item of sliced) {
      result.push(item.member, String(item.score));
    }
    return result;
  }

  static parseScoreBound(v) {
    let val = String(v).trim();
    let inclusive = true;
    if (val.startsWith('(')) {
      inclusive = false;
      val = val.substring(1);
    }
    let num;
    if (val === '+inf') num = Infinity;
    else if (val === '-inf') num = -Infinity;
    else num = parseFloat(val);
    if (isNaN(num)) {
      throw new Error('ERR min or max is not a float');
    }
    return { num, inclusive };
  }

  static parseLexBound(v) {
    const val = String(v);
    if (val === '-') return { type: 'min_inf' };
    if (val === '+') return { type: 'max_inf' };
    if (val.startsWith('[')) return { type: 'inc', str: val.substring(1) };
    if (val.startsWith('(')) return { type: 'exc', str: val.substring(1) };
    throw new Error('ERR min or max not valid string range item');
  }

  remRangeByRank(start, stop) {
    const len = this.sorted.length;
    if (len === 0) return 0;
    let s = start < 0 ? len + start : start;
    let e = stop < 0 ? len + stop : stop;
    if (s < 0) s = 0;
    if (s >= len || s > e) return 0;
    if (e >= len) e = len - 1;

    const count = e - s + 1;
    const removed = this.sorted.splice(s, count);
    for (const item of removed) {
      this.memberScores.delete(item.member);
    }
    return removed.length;
  }

  remRangeByScore(minVal, maxVal) {
    const min = RedisSortedSet.parseScoreBound(minVal);
    const max = RedisSortedSet.parseScoreBound(maxVal);

    const toKeep = [];
    let removed = 0;
    for (const item of this.sorted) {
      const gte = min.inclusive ? item.score >= min.num : item.score > min.num;
      const lte = max.inclusive ? item.score <= max.num : item.score < max.num;
      if (gte && lte) {
        this.memberScores.delete(item.member);
        removed++;
      } else {
        toKeep.push(item);
      }
    }
    this.sorted = toKeep;
    return removed;
  }

  remRangeByLex(minVal, maxVal) {
    const min = RedisSortedSet.parseLexBound(minVal);
    const max = RedisSortedSet.parseLexBound(maxVal);

    const toKeep = [];
    let removed = 0;
    for (const item of this.sorted) {
      let matchMin = false;
      if (min.type === 'min_inf') matchMin = true;
      else if (min.type === 'inc') matchMin = item.member >= min.str;
      else if (min.type === 'exc') matchMin = item.member > min.str;

      let matchMax = false;
      if (max.type === 'max_inf') matchMax = true;
      else if (max.type === 'inc') matchMax = item.member <= max.str;
      else if (max.type === 'exc') matchMax = item.member < max.str;

      if (matchMin && matchMax) {
        this.memberScores.delete(item.member);
        removed++;
      } else {
        toKeep.push(item);
      }
    }
    this.sorted = toKeep;
    return removed;
  }

  rangeByScore(minVal, maxVal, { rev = false, withScores = false, offset = 0, count = -1 } = {}) {
    const min = RedisSortedSet.parseScoreBound(minVal);
    const max = RedisSortedSet.parseScoreBound(maxVal);

    let filtered = this.sorted.filter((item) => {
      const gte = min.inclusive ? item.score >= min.num : item.score > min.num;
      const lte = max.inclusive ? item.score <= max.num : item.score < max.num;
      return gte && lte;
    });

    if (rev) {
      filtered.reverse();
    }

    if (offset > 0 || count >= 0) {
      const end = count >= 0 ? offset + count : filtered.length;
      filtered = filtered.slice(offset, end);
    }

    if (!withScores) {
      return filtered.map((x) => x.member);
    }
    const result = [];
    for (const item of filtered) {
      result.push(item.member, String(item.score));
    }
    return result;
  }

  count(minVal, maxVal) {
    const list = this.rangeByScore(minVal, maxVal);
    return list.length;
  }

  incrby(increment, member) {
    const str = String(member);
    const inc = parseFloat(increment);
    if (isNaN(inc)) {
      throw new Error('ERR value is not a valid float');
    }
    const currentScore = this.memberScores.get(str) || 0;
    const newScore = currentScore + inc;
    this.add(newScore, str);
    return String(newScore);
  }

  popMin(count = 1) {
    if (this.sorted.length === 0) return [];
    const limit = Math.min(count, this.sorted.length);
    const popped = this.sorted.splice(0, limit);
    const result = [];
    for (const item of popped) {
      this.memberScores.delete(item.member);
      result.push(item.member, String(item.score));
    }
    return result;
  }

  popMax(count = 1) {
    if (this.sorted.length === 0) return [];
    const limit = Math.min(count, this.sorted.length);
    const popped = this.sorted.splice(this.sorted.length - limit, limit);
    const result = [];
    for (let i = popped.length - 1; i >= 0; i--) {
      const item = popped[i];
      this.memberScores.delete(item.member);
      result.push(item.member, String(item.score));
    }
    return result;
  }
}

class RedisStream {
  constructor(initialEntries = []) {
    this.entries = [...initialEntries]; // array of { id: string, ms: number, seq: number, fields: string[] }
    this.lastMs = 0;
    this.lastSeq = 0;
    if (this.entries.length > 0) {
      const last = this.entries[this.entries.length - 1];
      this.lastMs = last.ms;
      this.lastSeq = last.seq;
    }
  }

  _parseId(idStr) {
    const parts = String(idStr).split('-');
    const ms = parseInt(parts[0], 10);
    const seq = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    return { ms, seq };
  }

  generateId(idPattern = '*') {
    if (idPattern === '*') {
      const now = Date.now();
      let ms = now;
      let seq = 0;
      if (ms === this.lastMs) {
        seq = this.lastSeq + 1;
      } else if (ms < this.lastMs) {
        ms = this.lastMs;
        seq = this.lastSeq + 1;
      }
      this.lastMs = ms;
      this.lastSeq = seq;
      return `${ms}-${seq}`;
    }

    if (idPattern.endsWith('-*')) {
      const ms = parseInt(idPattern.slice(0, -2), 10);
      let seq = 0;
      if (ms === this.lastMs) {
        seq = this.lastSeq + 1;
      }
      this.lastMs = ms;
      this.lastSeq = seq;
      return `${ms}-${seq}`;
    }

    const { ms, seq } = this._parseId(idPattern);
    if (ms < this.lastMs || (ms === this.lastMs && seq <= this.lastSeq)) {
      throw new Error('ERR The ID specified in XADD is equal or smaller than the target stream top item');
    }
    this.lastMs = ms;
    this.lastSeq = seq;
    return `${ms}-${seq}`;
  }

  add(id, fields = []) {
    const generatedId = this.generateId(id);
    const { ms, seq } = this._parseId(generatedId);
    const entry = { id: generatedId, ms, seq, fields: fields.map(String) };
    this.entries.push(entry);
    return generatedId;
  }

  len() {
    return this.entries.length;
  }

  range(start = '-', end = '+', count = -1) {
    let list = this.entries;
    if (start !== '-') {
      const s = this._parseId(start);
      list = list.filter((e) => e.ms > s.ms || (e.ms === s.ms && e.seq >= s.seq));
    }
    if (end !== '+') {
      const e = this._parseId(end);
      list = list.filter((item) => item.ms < e.ms || (item.ms === e.ms && item.seq <= e.seq));
    }
    if (count >= 0) {
      list = list.slice(0, count);
    }
    return list.map((e) => [e.id, e.fields]);
  }

  revRange(end = '+', start = '-', count = -1) {
    let list = [...this.entries].reverse();
    if (end !== '+') {
      const e = this._parseId(end);
      list = list.filter((item) => item.ms < e.ms || (item.ms === e.ms && item.seq <= e.seq));
    }
    if (start !== '-') {
      const s = this._parseId(start);
      list = list.filter((item) => item.ms > s.ms || (item.ms === s.ms && item.seq >= s.seq));
    }
    if (count >= 0) {
      list = list.slice(0, count);
    }
    return list.map((e) => [e.id, e.fields]);
  }

  del(...ids) {
    const idSet = new Set(ids.map(String));
    const initial = this.entries.length;
    this.entries = this.entries.filter((e) => !idSet.has(e.id));
    return initial - this.entries.length;
  }

  trim(maxLen) {
    const max = parseInt(maxLen, 10);
    if (isNaN(max) || max < 0) return 0;
    if (this.entries.length <= max) return 0;
    const toRemove = this.entries.length - max;
    this.entries = this.entries.slice(toRemove);
    return toRemove;
  }
}

module.exports = {
  RedisList,
  RedisSet,
  RedisHash,
  RedisSortedSet,
  RedisStream,
};
