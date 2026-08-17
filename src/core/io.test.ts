import { describe, expect, it } from 'vitest';
import { betsToCsv, csvToBets, parseBackup, buildBackup, parseCsv } from './io';
import { settleBet } from './settlement';
import type { Bet } from './types';

function makeBet(overrides: Partial<Bet> = {}): Bet {
  return {
    id: 'bet_1',
    bankrollId: 'bk1',
    structure: 'single',
    selections: [
      {
        id: 'sel_1',
        event: 'Galatasaray - Fenerbahçe',
        sport: 'football',
        competition: 'Süper Lig',
        picks: [{ id: 'pk_1', market: '1X2', pick: 'Galatasaray' }],
        odds: 2.4,
        side: 'back',
        status: 'won',
        closingOdds: 2.1,
      },
    ],
    unitStake: 100,
    bookmaker: 'Bet365',
    commission: 0,
    tags: ['value'],
    note: 'Comma, and "quotes" inside',
    placedAt: Date.parse('2026-01-15T12:00:00.000Z'),
    settledAt: Date.parse('2026-01-15T14:00:00.000Z'),
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('csv parsing', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseCsv('a,b\n"x, y","he said ""hi"""');
    expect(rows[1]).toEqual(['x, y', 'he said "hi"']);
  });

  it('accepts semicolon separators', () => {
    const rows = parseCsv('a;b\n1;2');
    expect(rows[1]).toEqual(['1', '2']);
  });

  it('drops blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toHaveLength(2);
  });
});

describe('csv round trip', () => {
  it('preserves a single bet through export and import', () => {
    const original = makeBet();
    const csv = betsToCsv([original]);
    const { bets, skipped, errors } = csvToBets(csv, { bankrollId: 'bk2' });

    expect(errors).toHaveLength(0);
    expect(skipped).toHaveLength(0);
    expect(bets).toHaveLength(1);

    const imported = bets[0]!;
    expect(imported.bankrollId).toBe('bk2');
    expect(imported.unitStake).toBe(100);
    expect(imported.bookmaker).toBe('Bet365');
    expect(imported.tags).toEqual(['value']);
    expect(imported.note).toBe('Comma, and "quotes" inside');
    expect(imported.selections[0]!.picks[0]!.pick).toBe('Galatasaray');
    expect(imported.selections[0]!.odds).toBeCloseTo(2.4);
    expect(imported.selections[0]!.closingOdds).toBeCloseTo(2.1);
    expect(settleBet(imported).profit).toBeCloseTo(140);
  });

  it('reassembles a multi-leg accumulator from grouped rows', () => {
    const acca = makeBet({
      structure: 'accumulator',
      selections: [
        { ...makeBet().selections[0]!, id: 'a', odds: 2, status: 'won' },
        { ...makeBet().selections[0]!, id: 'b', odds: 1.5, status: 'won' },
        { ...makeBet().selections[0]!, id: 'c', odds: 3, status: 'won' },
      ],
      unitStake: 10,
    });

    const { bets } = csvToBets(betsToCsv([acca]), { bankrollId: 'bk1' });
    expect(bets).toHaveLength(1);
    expect(bets[0]!.structure).toBe('accumulator');
    expect(bets[0]!.selections).toHaveLength(3);
    expect(settleBet(bets[0]!).profit).toBeCloseTo(80);
  });

  it('keeps system sizes intact', () => {
    const system = makeBet({
      structure: 'system',
      system: { sizes: [2, 3], preset: 'trixie' },
      selections: [
        { ...makeBet().selections[0]!, id: 'a', odds: 2, status: 'won' },
        { ...makeBet().selections[0]!, id: 'b', odds: 2, status: 'won' },
        { ...makeBet().selections[0]!, id: 'c', odds: 2, status: 'won' },
      ],
      unitStake: 10,
    });

    const { bets } = csvToBets(betsToCsv([system]), { bankrollId: 'bk1' });
    expect(bets[0]!.system?.sizes).toEqual([2, 3]);
    expect(settleBet(bets[0]!).profit).toBeCloseTo(160);
  });

  it('keeps a bet builder\'s several picks under one price', () => {
    const builder = makeBet({
      selections: [
        {
          ...makeBet().selections[0]!,
          picks: [
            { id: 'p1', market: '1X2', pick: 'Galatasaray' },
            { id: 'p2', market: 'Over/Under 2.5', pick: 'Over 2.5' },
            { id: 'p3', market: 'Anytime Goalscorer', pick: 'Icardi' },
          ],
          odds: 4.5,
        },
      ],
    });

    const { bets } = csvToBets(betsToCsv([builder]), { bankrollId: 'bk1' });
    const leg = bets[0]!.selections[0]!;

    // One leg, one price, three picks.
    expect(bets[0]!.selections).toHaveLength(1);
    expect(leg.odds).toBeCloseTo(4.5);
    expect(leg.picks).toHaveLength(3);
    expect(leg.picks.map((p) => p.pick)).toEqual(['Galatasaray', 'Over 2.5', 'Icardi']);
    expect(leg.picks.map((p) => p.market)).toEqual([
      '1X2',
      'Over/Under 2.5',
      'Anytime Goalscorer',
    ]);
    expect(settleBet(bets[0]!).profit).toBeCloseTo(350);
  });

  it('reads a legacy CSV that has one market and pick per row', () => {
    const csv = ['bet_id,event,market,pick,odds,stake,status', 'a,A - B,1X2,Home,2.0,100,won'].join(
      '\n',
    );
    const { bets } = csvToBets(csv, { bankrollId: 'bk1' });
    expect(bets[0]!.selections[0]!.picks).toEqual([
      expect.objectContaining({ market: '1X2', pick: 'Home' }),
    ]);
  });

  it('skips unusable rows instead of failing the whole import', () => {
    const csv = ['bet_id,date,odds,stake,status', 'x,2026-01-01,notodds,100,won', 'y,2026-01-01,2.0,50,won'].join('\n');
    const result = csvToBets(csv, { bankrollId: 'bk1' });
    expect(result.skipped).toEqual([2]);
    expect(result.bets).toHaveLength(1);
  });

  it('recognises status words in Turkish and English', () => {
    const csv = [
      'bet_id,odds,stake,status',
      'a,2.0,100,kazandı',
      'b,2.0,100,LOSS',
      'c,2.0,100,iade',
    ].join('\n');
    const { bets } = csvToBets(csv, { bankrollId: 'bk1' });
    expect(bets.map((b) => b.selections[0]!.status)).toEqual(['won', 'lost', 'void']);
  });

  it('reports missing required columns', () => {
    const result = csvToBets('foo,bar\n1,2', { bankrollId: 'bk1' });
    expect(result.errors).toContain('missingRequiredColumns');
  });
});

describe('json backup', () => {
  it('round-trips through build and parse', () => {
    const backup = buildBackup({ bankrolls: [], bets: [makeBet()], transactions: [] });
    const result = parseBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);
    expect(result.data?.bets).toHaveLength(1);
  });

  it('rejects malformed and foreign files', () => {
    expect(parseBackup('{oops').error).toBe('invalidJson');
    expect(parseBackup('{"format":"something-else"}').error).toBe('invalidFormat');
    expect(
      parseBackup('{"format":"bettracker-backup","version":99,"bets":[],"bankrolls":[]}').error,
    ).toBe('unsupportedVersion');
  });
});
