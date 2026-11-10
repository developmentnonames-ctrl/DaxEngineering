import {
  BinBulkInput,
  binCode,
  normalizePartNo,
} from '@dax/inventory-contract';
import {
  binParts,
  bulkBinParts,
  BULK_BIN_LIMIT,
  splitExisting,
} from './bin-codes';
import { newQrToken } from './common';
import { looksLikeBinCode, parseScanCode } from './scan-code';
import { isBelowMin, qtyString, stockFigures } from './stock-math';
import { createsCycle, latestReplacementId } from './supersession';

const ZONE = '0190a000-0000-7000-8000-000000000010';

describe('part numbers and bin codes', () => {
  it('normalizes part numbers to upper-case letters and digits', () => {
    expect(normalizePartNo(' 1r-0750 / a ')).toBe('1R0750A');
    expect(normalizePartNo('--//')).toBe('');
  });

  it('builds structured bin codes with padded rack and shelf', () => {
    expect(binCode({ zone: 'a', rack: '1', shelf: '3', position: 'b' })).toBe(
      'A-01-03-B',
    );
    expect(binParts('a', '001', '3', 'b')).toEqual({
      rack: '01',
      shelf: '03',
      position: 'B',
      code: 'A-01-03-B',
    });
    expect(binParts('X', 0, 0, 'RCV').code).toBe('X-00-00-RCV');
    expect(binParts('B', 120, 12, '1').code).toBe('B-120-12-1');
  });
});

describe('bulk bins', () => {
  const input = {
    racks: { from: 1, to: 2 },
    shelves: { from: 1, to: 3 },
    positions: ['A', 'b', 'A'],
  };

  it('generates the cartesian product in order without duplicate positions', () => {
    const codes = bulkBinParts('A', input).map((p) => p.code);
    expect(codes).toHaveLength(12);
    expect(codes.slice(0, 3)).toEqual(['A-01-01-A', 'A-01-01-B', 'A-01-02-A']);
    expect(codes.at(-1)).toBe('A-02-03-B');
  });

  it('skips codes that already exist', () => {
    const parts = bulkBinParts('A', input);
    const { create, skipped } = splitExisting(
      parts,
      new Set(['A-01-01-A', 'A-02-03-B']),
    );
    expect(skipped).toEqual(['A-01-01-A', 'A-02-03-B']);
    expect(create).toHaveLength(10);
  });

  it('caps a request at 500 bins', () => {
    const big = {
      racks: { from: 1, to: 10 },
      shelves: { from: 1, to: 10 },
      positions: ['A', 'B', 'C', 'D', 'E', 'F'],
    };
    expect(() => bulkBinParts('A', big)).toThrow(RangeError);
    expect(BinBulkInput.safeParse({ zoneId: ZONE, ...big }).success).toBe(
      false,
    );
    const max = { ...big, positions: ['A', 'B', 'C', 'D', 'E'] };
    expect(bulkBinParts('A', max)).toHaveLength(BULK_BIN_LIMIT);
    expect(BinBulkInput.safeParse({ zoneId: ZONE, ...max }).success).toBe(true);
  });
});

describe('stock figures', () => {
  it('computes free stock with exact decimals', () => {
    const { figures } = stockFigures({
      onHand: '0.3',
      held: '0.1',
      quarantine: '0',
    });
    expect(figures).toEqual({
      onHand: '0.3',
      held: '0.1',
      quarantine: '0',
      receiving: '0',
      free: '0.2',
    });
  });

  it('keeps quarantine and receiving stock out of free stock', () => {
    const { figures } = stockFigures({
      onHand: '10',
      held: '2',
      quarantine: '1.5',
      receiving: '3',
    });
    expect(figures.free).toBe('3.5');
  });

  it('shows zeros when there is no balance row', () => {
    expect(stockFigures(null).figures).toEqual({
      onHand: '0',
      held: '0',
      quarantine: '0',
      receiving: '0',
      free: '0',
    });
  });

  it('keeps at most three decimals and never uses exponent notation', () => {
    expect(qtyString('12.5000')).toBe('12.5');
    expect(qtyString('0.0001')).toBe('0');
    expect(qtyString('99999999999.999')).toBe('99999999999.999');
    expect(qtyString('0.0000001')).toBe('0');
  });

  it('flags below minimum only when a minimum is set', () => {
    expect(isBelowMin('4.999', '5')).toBe(true);
    expect(isBelowMin('5', '5')).toBe(false);
    expect(isBelowMin('0', '0')).toBe(false);
    expect(isBelowMin('0', '0.001')).toBe(true);
  });
});

describe('supersession', () => {
  const chain = (links: Record<string, string>) => async (id: string) =>
    links[id] ?? null;

  it('follows the chain to the newest replacement', async () => {
    const next = chain({ A: 'B', B: 'C' });
    expect(await latestReplacementId('B', next)).toBe('C');
    expect(await latestReplacementId('C', next)).toBe('C');
    expect(await latestReplacementId(null, next)).toBeNull();
  });

  it('stops at a loop already present in the data', async () => {
    expect(await latestReplacementId('B', chain({ B: 'C', C: 'B' }))).toBe('C');
  });

  it('detects cycles before they are saved', async () => {
    const next = chain({ A: 'B', B: 'C' });
    expect(await createsCycle('C', 'A', next)).toBe(true);
    expect(await createsCycle('A', 'A', next)).toBe(true);
    expect(await createsCycle('D', 'A', next)).toBe(false);
    expect(await createsCycle('A', 'C', next)).toBe(false);
  });
});

describe('scan codes', () => {
  it('reads item and bin QR URLs on any host', () => {
    expect(
      parseScanCode('https://stores.example.com/q/i/AbC123xyZ789'),
    ).toEqual({
      kind: 'qr',
      type: 'item',
      token: 'AbC123xyZ789',
    });
    expect(parseScanCode('http://localhost:3000/q/b/AbC123xyZ789/')).toEqual({
      kind: 'qr',
      type: 'bin',
      token: 'AbC123xyZ789',
    });
    expect(parseScanCode('/q/i/AbC123xyZ789').kind).toBe('qr');
  });

  it('ignores unrelated URLs and bad tokens', () => {
    expect(parseScanCode('https://example.com/q/z/AbC123xyZ789').kind).toBe(
      'empty',
    );
    expect(parseScanCode('https://example.com/q/i/short').kind).toBe('empty');
    expect(parseScanCode('   ').kind).toBe('empty');
  });

  it('treats other text as a token candidate, barcode or part number', () => {
    expect(parseScanCode('AbC123xyZ789')).toEqual({
      kind: 'text',
      value: 'AbC123xyZ789',
      maybeToken: true,
    });
    expect(parseScanCode(' 5012345678900 ')).toEqual({
      kind: 'text',
      value: '5012345678900',
      maybeToken: false,
    });
    expect(parseScanCode('1R-0750')).toEqual({
      kind: 'text',
      value: '1R-0750',
      maybeToken: false,
    });
  });

  it('recognizes bin codes', () => {
    expect(looksLikeBinCode('a-01-03-b')).toBe(true);
    expect(looksLikeBinCode('1R-0750')).toBe(false);
  });
});

describe('tokens', () => {
  it('makes 12-character base62 tokens', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => newQrToken()));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9]{12}$/);
  });
});
