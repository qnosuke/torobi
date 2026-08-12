import { describe, it, expect } from 'vitest';
import {
  weightSeries, latestBody, ema, recent, slopePerWeek, assessTrend, dayNumber,
} from '../src/trend.js';

/** start から days 日ぶん、1週あたり lossPerWeek kg 減る記録を作る */
function makeLog(start, days, from, lossPerWeek, step = 1) {
  const log = {};
  const base = dayNumber(start);
  for (let i = 0; i < days; i += step) {
    const d = new Date((base + i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    log[key] = { body: { weight: (from - lossPerWeek * i / 7).toFixed(1) } };
  }
  return log;
}

const TODAY = '2026-08-12';

describe('体重の時系列', () => {
  it('体重のある日だけを日付順に取り出す', () => {
    const log = {
      '2026-08-03': { body: { weight: '62.4' } },
      '2026-08-01': { body: { weight: '62.8' } },
      '2026-08-02': { body: { bodyFat: '22.0' } },
      '2026-08-04': { body: {} },
      '2026-08-05': {},
    };
    expect(weightSeries(log)).toEqual([
      { date: '2026-08-01', kg: 62.8 },
      { date: '2026-08-03', kg: 62.4 },
    ]);
  });

  it('記録がなくても落ちない', () => {
    expect(weightSeries({})).toEqual([]);
    expect(weightSeries(null)).toEqual([]);
  });

  it('項目ごとに最新の値を拾う（測った日が違ってもよい）', () => {
    const log = {
      '2026-08-01': { body: { weight: '63.0', bodyFat: '23.0' } },
      '2026-08-10': { body: { weight: '62.0' } },
    };
    expect(latestBody(log, ['weight', 'bodyFat'])).toEqual({
      weight: 62, weightDate: '2026-08-10',
      bodyFat: 23, bodyFatDate: '2026-08-01',
    });
  });
});

describe('ならしと傾き', () => {
  it('指数移動平均は日々のぶれを吸収する', () => {
    const series = [{ date: 'a', kg: 60 }, { date: 'b', kg: 62 }, { date: 'c', kg: 60 }];
    const out = ema(series, 0.25);
    expect(out[0].kg).toBe(60);
    expect(out[1].kg).toBeCloseTo(60.5, 3);
    expect(out[2].kg).toBeLessThan(61);
  });

  it('傾きは kg/週 で返る', () => {
    const s = weightSeries(makeLog('2026-07-23', 21, 62, 0.3));
    expect(slopePerWeek(s)).toBeCloseTo(-0.3, 1);
  });

  it('2点未満では出せない', () => {
    expect(slopePerWeek([])).toBeNull();
    expect(slopePerWeek([{ date: '2026-08-01', kg: 62 }])).toBeNull();
  });

  it('同じ日ばかりでは出せない', () => {
    expect(slopePerWeek([{ date: '2026-08-01', kg: 62 }, { date: '2026-08-01', kg: 63 }])).toBeNull();
  });

  it('直近の窓だけを見る', () => {
    const s = weightSeries(makeLog('2026-06-01', 80, 65, 0.3));
    expect(recent(s, 21, TODAY).length).toBeLessThanOrEqual(21);
    expect(recent(s, 21, TODAY).every(p => p.date <= TODAY)).toBe(true);
  });
});

describe('ペースの判定', () => {
  const assess = (log, target) => assessTrend(weightSeries(log), target, { today: TODAY });

  it('記録がなければその旨を出す', () => {
    expect(assess({}, 0.25).status).toBe('none');
  });

  it('測定が足りないうちは判定しない', () => {
    const log = makeLog('2026-08-10', 3, 62, 0.3);
    const a = assess(log, 0.25);
    expect(a.status).toBe('hold');
    expect(a.adjustKcal).toBe(0);
    expect(a.text).toContain('あと');
  });

  it('期間が短ければ、回数がそろっていても判定しない', () => {
    const log = makeLog('2026-08-08', 5, 62, 0.3);
    expect(assess(log, 0.25).status).toBe('hold');
  });

  it('目標どおりなら「そのまま」', () => {
    const log = makeLog('2026-07-23', 21, 62, 0.25);
    const a = assess(log, 0.25);
    expect(a.status).toBe('on');
    expect(a.adjustKcal).toBe(0);
  });

  it('遅ければ減らす提案を出す', () => {
    const a = assess(makeLog('2026-07-23', 21, 62, 0.1), 0.25);
    expect(a.status).toBe('slow');
    expect(a.adjustKcal).toBeLessThan(0);
  });

  it('まったく動いていなければ強めに提案する', () => {
    const a = assess(makeLog('2026-07-23', 21, 62, 0), 0.25);
    expect(a.status).toBe('slow');
    expect(a.adjustKcal).toBe(-150);
  });

  it('速すぎれば増やす提案を出す（筋肉が落ちるため）', () => {
    const a = assess(makeLog('2026-07-23', 21, 62, 0.8), 0.25);
    expect(a.status).toBe('fast');
    expect(a.adjustKcal).toBeGreaterThan(0);
  });

  it('増えていれば減らす提案になる', () => {
    const a = assess(makeLog('2026-07-23', 21, 62, -0.4), 0.25);
    expect(a.status).toBe('gain');
    expect(a.adjustKcal).toBeLessThan(0);
  });

  it('週2回の計量でも判定できる', () => {
    const log = makeLog('2026-07-23', 21, 62, 0.25, 3);
    expect(assess(log, 0.25).status).toBe('on');
  });

  describe('維持を選んでいるとき', () => {
    it('動いていなければ成功', () => {
      expect(assess(makeLog('2026-07-23', 21, 62, 0.05), 0).status).toBe('on');
    });
    it('増え続けていれば知らせる', () => {
      expect(assess(makeLog('2026-07-23', 21, 62, -0.5), 0).status).toBe('gain');
    });
    it('減り続けていれば食べるよう促す', () => {
      const a = assess(makeLog('2026-07-23', 21, 62, 0.5), 0);
      expect(a.status).toBe('fast');
      expect(a.adjustKcal).toBeGreaterThan(0);
    });
  });
});
