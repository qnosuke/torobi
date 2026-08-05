import { describe, it, expect } from 'vitest';
import { parseCsvText, splitRow, HEADER } from '../src/csvImport.js';
import { buildCsv } from '../src/exportData.js';

const head = HEADER.join(',');

describe('行の分解', () => {
  it('引用符つきのセルを扱える', () => {
    expect(splitRow('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    expect(splitRow('"""quoted""",x')).toEqual(['"quoted"', 'x']);
    expect(splitRow('a,,b')).toEqual(['a', '', 'b']);
  });
});

describe('書き出したCSVを読み戻す', () => {
  const log = {
    '2026-08-03': {
      week: 1, day: 'thu',
      sets: [
        { ex: '膝つき腕立て伏せ', slot: '押す', no: 1, sec: 42 },
        { ex: 'ワンハンドロー', slot: '引く', no: 1, sec: 44, side: 'L' },
        { ex: 'ワンハンドロー', slot: '引く', no: 1, sec: 41, side: 'R' },
      ],
      body: { weight: '61.8', bodyFat: '22.4', skeletalMuscle: '33.8' },
    },
    '2026-08-06': {
      week: 1, day: 'mon',
      sets: [{ ex: 'サイドレイズ', slot: '単関節', no: 1, sec: 33 }],
      body: {},
    },
  };

  it('書き出して読み戻すと元の記録に戻る', () => {
    const parsed = parseCsvText(buildCsv(log));
    expect(parsed.ok).toBe(true);
    expect(parsed.days).toEqual(log);
  });

  it('BOM付きでも読める', () => {
    const parsed = parseCsvText('﻿' + buildCsv(log));
    expect(parsed.ok).toBe(true);
    expect(Object.keys(parsed.days)).toEqual(['2026-08-03', '2026-08-06']);
  });

  it('行数を返す', () => {
    expect(parseCsvText(buildCsv(log)).rows).toBe(4);
  });
});

describe('壊れたCSVは取り込まない', () => {
  const row = '2026-08-03,1,腕,腕立て伏せ,押す,1,,42,10,,,,,,,';
  const bad = (text, line) => {
    const r = parseCsvText(text);
    expect(r.ok).toBe(false);
    expect(r.error.line).toBe(line);
    return r.error.reason;
  };

  it('空のファイル', () => {
    expect(bad('', 1)).toContain('空');
  });

  it('見出しが違う', () => {
    expect(bad('日付,体重\n2026-08-03,61.8', 1)).toContain('見出し');
  });

  it('列数が足りない', () => {
    expect(bad(`${head}\n2026-08-03,1,腕`, 2)).toContain('列数');
  });

  it('ありえない日付', () => {
    expect(bad(`${head}\n2026-02-30,1,腕,腕立て伏せ,押す,1,,42,10,,,,,,,`, 2)).toContain('日付');
    expect(bad(`${head}\n2026/08/03,1,腕,腕立て伏せ,押す,1,,42,10,,,,,,,`, 2)).toContain('日付');
  });

  it('週の範囲外', () => {
    expect(bad(`${head}\n2026-08-03,13,腕,腕立て伏せ,押す,1,,42,10,,,,,,,`, 2)).toContain('週');
  });

  it('メニューが肩でも腕でもない', () => {
    expect(bad(`${head}\n2026-08-03,1,脚,腕立て伏せ,押す,1,,42,10,,,,,,,`, 2)).toContain('メニュー');
  });

  it('左右が不正', () => {
    expect(bad(`${head}\n2026-08-03,1,腕,腕立て伏せ,押す,1,両,42,10,,,,,,,`, 2)).toContain('左右');
  });

  it('秒数が数値でない', () => {
    expect(bad(`${head}\n2026-08-03,1,腕,腕立て伏せ,押す,1,,約42,10,,,,,,,`, 2)).toContain('秒数');
  });

  it('体組成が数値でない', () => {
    expect(bad(`${head}\n2026-08-03,1,腕,腕立て伏せ,押す,1,,42,10,えらい,,,,,,`, 2)).toContain('体重');
  });

  it('2行目が正しくても3行目が不正なら取り込まない', () => {
    expect(bad(`${head}\n${row}\n2026-08-04,1,腕,腕立て伏せ,押す,ゼロ,,42,10,,,,,,,`, 3)).toContain('セット');
  });
});
