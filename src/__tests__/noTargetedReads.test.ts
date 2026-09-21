import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Privacy ratchet: no request on a user-reachable path may be keyed on a value
 * derived from this user's notes. In this app that means no block lookup per
 * deposit (the block number IS the note's public footprint) and no receipt,
 * transaction or trace fetch for a RELAYED transaction hash. Receipt polling
 * of a hash the user's own wallet broadcast is fine: the provider saw it arrive
 * from this client already. Those files are allow-listed by name.
 *
 * A second shape is held here too: a poll's cadence is a literal. The wallet
 * balance read in ChainProvider is pinned to one interval with the focus,
 * background and reconnect refetches off, so it fires the same way whatever
 * the user is doing.
 *
 * Comments are stripped before matching so the rules can be explained in code.
 */

type Rule = { pattern: RegExp; reason: string; allow?: string[] };

const RULES: Rule[] = [
  {
    pattern: /getTimestampFromBlockNumber|\.getBlock\(/,
    reason: 'a block lookup keyed on a note. Dates come from utils/blockTimestamps.ts (bulk).',
    allow: ['src/utils/relayedReceipt.ts'], // walks NEW blocks by number, never by hash
  },
  {
    pattern: /eth_getTransactionReceipt|eth_getTransactionByHash|trace_transaction|debug_traceTransaction/,
    reason: 'a raw RPC call that names a transaction hash.',
  },
  {
    pattern: /\.getTransactionReceipt\(|\.getTransaction\(/,
    reason: 'a viem call that names a transaction hash.',
  },
  {
    pattern: /waitForTransactionReceipt\(/,
    reason: 'receipt polling. Allowed only for a hash THIS wallet broadcast; relayed hashes use waitForRelayedReceipt.',
    allow: ['src/hooks/useDeposit.ts', 'src/hooks/useExit.ts'],
  },
  {
    // `refetchInterval: 30_000` passes; `refetchInterval: busy ? false : 30_000` does not.
    pattern: /refetchInterval:(?!\s*\d[\d_]*\s*(,|\}|$))/,
    reason:
      'a poll whose cadence is not a literal. A cadence that changes with state times requests to what the user is doing.',
  },
];

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const sourceFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === '__tests__' || entry === 'node_modules') continue;
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
};

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('no request keyed on a note (privacy ratchet)', () => {
  const files = sourceFiles(SRC);

  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const rule of RULES) {
    it(`forbids ${rule.pattern} outside ${rule.allow?.join(', ') || 'anywhere'}: ${rule.reason}`, () => {
      const violations: string[] = [];
      for (const file of files) {
        const rel = relative(ROOT, file);
        if (rule.allow?.includes(rel)) continue;
        const code = stripComments(readFileSync(file, 'utf8'));
        const lines = code.split('\n');
        lines.forEach((line, index) => {
          if (rule.pattern.test(line)) violations.push(`${rel}:${index + 1}: ${line.trim()}`);
        });
      }
      expect(violations).toEqual([]);
    });
  }

  it('polls the wallet balance on a fixed cadence with the focus, background and reconnect triggers off', () => {
    // The interval must be the ONLY trigger of this read. React Query's
    // defaults refetch on window focus and pause the interval in a hidden tab,
    // so each option has to be spelled out on the call.
    const code = stripComments(readFileSync(join(SRC, 'providers/ChainProvider.tsx'), 'utf8'));
    const call = code.match(/useBalance\(\{[\s\S]*?\n {2}\}\);/)?.[0];
    expect(call).toBeDefined();
    expect(call).toMatch(/refetchInterval:\s*30_000\s*,/);
    expect(call).toMatch(/refetchIntervalInBackground:\s*true\s*,/);
    expect(call).toMatch(/refetchOnWindowFocus:\s*false\s*,/);
    expect(call).toMatch(/refetchOnReconnect:\s*false\s*,/);
    expect(call).not.toMatch(/enabled:/);
  });

  it('keeps the allow-list honest: every allow-listed file still exists and still uses the pattern', () => {
    for (const rule of RULES) {
      for (const rel of rule.allow ?? []) {
        const code = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
        expect(rule.pattern.test(code)).toBe(true);
      }
    }
  });
});
