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

  rangeByScore(minVal, maxVal, { rev = false, withScores = false, offset = 0, count = -1 } = {}) {
    const parseBound = (v) => {
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
      return { num, inclusive };
    };

    const min = parseBound(minVal);
    const max = parseBound(maxVal);

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
}

module.exports = {
  RedisList,
  RedisSet,
  RedisHash,
  RedisSortedSet,
};
