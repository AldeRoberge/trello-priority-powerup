// Durable Object holding the Power-Up data for /work (what Trello keeps as "plugin data", which its
// REST API cannot write) and a short-lived cache of the Trello board snapshot. One instance, SQLite
// backed, strongly consistent: every read after a write sees it. No setup besides the migration in
// wrangler.jsonc.

import { DurableObject } from 'cloudflare:workers';

export class WorkStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv (bucket TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (bucket, key))');
    this.sql.exec('CREATE INDEX IF NOT EXISTS kv_updated ON kv (updated)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)');
  }

  getValue(bucket, key) {
    const rows = this.sql.exec('SELECT value FROM kv WHERE bucket = ? AND key = ?', bucket, key).toArray();
    return rows.length ? JSON.parse(rows[0].value) : null;
  }

  getBucket(bucket) {
    const out = {};
    for (const r of this.sql.exec('SELECT key, value FROM kv WHERE bucket = ?', bucket)) out[r.key] = JSON.parse(r.value);
    return out;
  }

  /** Every bucket: the browser loads this once and then reads plugin data from memory. */
  getAllBuckets() {
    const out = {};
    for (const r of this.sql.exec("SELECT bucket, key, value FROM kv WHERE bucket != 'meta' AND bucket != 'secret'")) (out[r.bucket] = out[r.bucket] || {})[r.key] = JSON.parse(r.value);
    return out;
  }

  /** values: { key: value }; a null or undefined value removes the key. Returns the update time. */
  setValues(bucket, values) {
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      for (const [key, value] of Object.entries(values)) {
        if (value === null || value === undefined) this.sql.exec('DELETE FROM kv WHERE bucket = ? AND key = ?', bucket, key);
        else this.sql.exec('INSERT OR REPLACE INTO kv (bucket, key, value, updated) VALUES (?, ?, ?, ?)', bucket, key, JSON.stringify(value), now);
      }
    });
    return now;
  }

  /** Every entry changed after `since` (ms): lets another client (the Power-Up inside Trello) catch up. */
  changesSince(since) {
    return this.sql.exec('SELECT bucket, key, value, updated FROM kv WHERE updated > ? ORDER BY updated LIMIT 2000', Number(since) || 0)
      .toArray()
      .map((r) => ({ bucket: r.bucket, key: r.key, value: JSON.parse(r.value), updated: r.updated }));
  }

  isEmpty() {
    return this.sql.exec('SELECT 1 FROM kv LIMIT 1').toArray().length === 0;
  }

  /** buckets: { bucket: { key: value } }; existing keys are kept (the import never overwrites newer work). */
  importBuckets(buckets) {
    const now = Date.now();
    let count = 0;
    this.ctx.storage.transactionSync(() => {
      for (const [bucket, values] of Object.entries(buckets)) {
        for (const [key, value] of Object.entries(values)) {
          if (value === null || value === undefined) continue;
          const had = this.sql.exec('SELECT 1 FROM kv WHERE bucket = ? AND key = ?', bucket, key).toArray().length;
          if (had) continue;
          this.sql.exec('INSERT INTO kv (bucket, key, value, updated) VALUES (?, ?, ?, ?)', bucket, key, JSON.stringify(value), now);
          count += 1;
        }
      }
    });
    return count;
  }

  cacheGet(k) {
    const rows = this.sql.exec('SELECT v, at FROM cache WHERE k = ?', k).toArray();
    return rows.length ? { value: JSON.parse(rows[0].v), at: rows[0].at } : null;
  }

  cachePut(k, value) {
    this.sql.exec('INSERT OR REPLACE INTO cache (k, v, at) VALUES (?, ?, ?)', k, JSON.stringify(value), Date.now());
  }

  cacheDrop(k) {
    this.sql.exec('DELETE FROM cache WHERE k = ?', k);
  }
}
