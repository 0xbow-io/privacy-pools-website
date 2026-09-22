/**
 * Completes `blockTimestamp` on the rows of an `eth_getLogs` response.
 *
 * The hypersync RPC puts `blockTimestamp` on only part of the rows it returns
 * for a range (measured 37-49% on mainnet; every row of a block is dated or
 * none is, and which blocks depends on how the upstream pages the range
 * internally, not on the block). Its query API joins `number` + `timestamp`
 * for every block that holds a matching log. So for one `eth_getLogs` the
 * proxy runs one query over the SAME range and filter, and copies the
 * timestamps onto the rows that came back without one. The request stream
 * stays a function of the range and the pool address only.
 *
 * Everything here is fail-open: on any error the rows are returned as the
 * RPC produced them and the client interpolates (see `blockTimestamps.ts`).
 */

export type LogsFilter = {
  fromBlock?: unknown;
  toBlock?: unknown;
  address?: unknown;
  topics?: unknown;
  blockHash?: unknown;
};

export type LogSelection = { address: string[]; topics?: string[][] };

export type BlockRange = { from: number; to: number }; // inclusive

type QueryPage = {
  data?: { blocks?: { number?: number; timestamp?: string }[] }[];
  next_block?: number;
};

type LogRow = { blockNumber?: unknown; blockTimestamp?: unknown };

/** A JSON-RPC block tag as a number, or null for `latest`/`pending`/garbage. */
export const parseBlockTag = (tag: unknown): number | null => {
  if (typeof tag === 'number') return Number.isSafeInteger(tag) && tag >= 0 ? tag : null;
  if (typeof tag !== 'string') return null;
  if (/^0x[0-9a-fA-F]+$/.test(tag)) {
    const n = Number.parseInt(tag, 16);
    return Number.isSafeInteger(n) ? n : null;
  }
  if (/^[0-9]+$/.test(tag)) {
    const n = Number.parseInt(tag, 10);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
};

const isHexTopic = (t: unknown): t is string => typeof t === 'string' && /^0x[0-9a-fA-F]{64}$/.test(t);

/**
 * The hypersync log selection equivalent to an `eth_getLogs` filter, or null
 * when the filter has no address (the join would then cover every block in
 * the range) or names a block hash.
 */
export const logSelectionFor = (filter: LogsFilter): LogSelection | null => {
  if (filter.blockHash != null) return null;
  const addresses = (Array.isArray(filter.address) ? filter.address : [filter.address]).filter(
    (a): a is string => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a),
  );
  if (addresses.length === 0) return null;
  const selection: LogSelection = { address: addresses };
  if (Array.isArray(filter.topics) && filter.topics.length > 0) {
    // JSON-RPC: position i is null (any), a topic, or a list of alternatives.
    // Hypersync: position i is a list, empty for any.
    const topics: string[][] = [];
    for (const t of filter.topics as unknown[]) {
      if (t == null) {
        topics.push([]);
        continue;
      }
      const alternatives = (Array.isArray(t) ? t : [t]).filter(isHexTopic);
      if (alternatives.length === 0) return null; // unreadable position: do not over-select
      topics.push(alternatives);
    }
    if (topics.some((t) => t.length > 0)) selection.topics = topics;
  }
  return selection;
};

export const parseRange = (filter: LogsFilter): BlockRange | null => {
  const from = parseBlockTag(filter.fromBlock);
  const to = parseBlockTag(filter.toBlock);
  if (from === null || to === null || to < from) return null;
  return { from, to };
};

export const splitRange = (range: BlockRange, size: number): BlockRange[] => {
  const out: BlockRange[] = [];
  for (let from = range.from; from <= range.to; from += size)
    out.push({ from, to: Math.min(range.to, from + size - 1) });
  return out;
};

/** Block numbers of the rows that carry no `blockTimestamp`. */
export const undatedBlockNumbers = (logs: readonly unknown[]): Set<number> => {
  const out = new Set<number>();
  for (const raw of logs) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as LogRow;
    if (row.blockTimestamp != null) continue;
    const n = parseBlockTag(row.blockNumber);
    if (n !== null) out.add(n);
  }
  return out;
};

/** Sets `blockTimestamp` (hex) on every undated row whose block is known. Returns rows filled. */
export const applyBlockTimestamps = (logs: readonly unknown[], timestamps: ReadonlyMap<number, string>): number => {
  let filled = 0;
  for (const raw of logs) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as LogRow;
    if (row.blockTimestamp != null) continue;
    const n = parseBlockTag(row.blockNumber);
    const ts = n === null ? undefined : timestamps.get(n);
    if (ts === undefined) continue;
    row.blockTimestamp = ts;
    filled++;
  }
  return filled;
};

export type FetchBlockTimestampsOptions = {
  queryUrl: string;
  token: string;
  range: BlockRange;
  selection: LogSelection;
  /** Absolute `Date.now()` after which no new page is requested. */
  deadline: number;
  fetchImpl?: typeof fetch;
  /** Blocks per sub-range, each walked page by page. The upstream pages at roughly 128k blocks. */
  subRangeSize?: number;
  concurrency?: number;
};

const DEFAULT_SUB_RANGE = 131_072;
const DEFAULT_CONCURRENCY = 4;

const toHexQuantity = (value: unknown): string | null => {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return `0x${value.toString(16)}`;
  return null;
};

/**
 * `number -> timestamp (hex)` for every block in `range` that holds a log
 * matching `selection`, from the hypersync query API. Sub-ranges run
 * concurrently; each one follows `next_block` until the sub-range is covered
 * or the deadline passes. Whatever was learnt before an error is kept.
 */
export const fetchBlockTimestamps = async (options: FetchBlockTimestampsOptions): Promise<Map<number, string>> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const out = new Map<number, string>();
  const queue = splitRange(options.range, options.subRangeSize ?? DEFAULT_SUB_RANGE);

  const walk = async (sub: BlockRange) => {
    let from = sub.from;
    while (from <= sub.to) {
      const remaining = options.deadline - Date.now();
      if (remaining <= 0) return;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const response = await fetchImpl(options.queryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.token}` },
          body: JSON.stringify({
            from_block: from,
            to_block: sub.to + 1, // exclusive upstream
            logs: [options.selection],
            field_selection: { block: ['number', 'timestamp'] },
          }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const page = (await response.json()) as QueryPage;
        for (const chunk of page.data ?? []) {
          for (const block of chunk.blocks ?? []) {
            const ts = toHexQuantity(block.timestamp);
            if (typeof block.number === 'number' && ts !== null) out.set(block.number, ts);
          }
        }
        if (typeof page.next_block !== 'number' || page.next_block <= from) return; // no progress: stop
        from = page.next_block;
      } catch {
        return;
      } finally {
        clearTimeout(timer);
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY) }, async () => {
    for (let sub = queue.shift(); sub !== undefined; sub = queue.shift()) await walk(sub);
  });
  await Promise.all(workers);
  return out;
};

export type CompleteLogTimestampsOptions = Omit<FetchBlockTimestampsOptions, 'range' | 'selection'>;

/**
 * Fills the undated rows of an `eth_getLogs` result in place.
 * Returns how many rows were undated and how many of them got a timestamp.
 */
export const completeLogTimestamps = async (
  filter: LogsFilter,
  logs: readonly unknown[],
  options: CompleteLogTimestampsOptions,
): Promise<{ undated: number; filled: number }> => {
  const undatedRows = logs.filter((row) => row && typeof row === 'object' && (row as LogRow).blockTimestamp == null);
  if (undatedRows.length === 0) return { undated: 0, filled: 0 };
  const range = parseRange(filter);
  const selection = logSelectionFor(filter);
  if (range === null || selection === null) return { undated: undatedRows.length, filled: 0 };
  // Only the blocks that need it: narrow the query to their span.
  const missing = undatedBlockNumbers(logs);
  if (missing.size === 0) return { undated: undatedRows.length, filled: 0 };
  const span = { from: Math.max(range.from, Math.min(...missing)), to: Math.min(range.to, Math.max(...missing)) };
  const timestamps = await fetchBlockTimestamps({ ...options, range: span, selection });
  return { undated: undatedRows.length, filled: applyBlockTimestamps(logs, timestamps) };
};
