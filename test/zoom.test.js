import { describe, it, expect } from 'vitest';
import { zoomRange, zoomPlan, zoomLabel, BASE_GUIDE_WIDTH, MIN_ZOOM, MAX_ZOOM } from '../src/scan/zoom.js';

describe('スライダーの範囲', () => {
  it('端末がズームに対応していればその範囲を使う', () => {
    const r = zoomRange({ zoom: { min: 1, max: 8, step: 0.5 } });
    expect(r).toEqual({ hardware: true, min: 1, max: 8, step: 0.5 });
  });

  it('刻みが申告されていなければ範囲から決める', () => {
    expect(zoomRange({ zoom: { min: 1, max: 5 } }).step).toBeCloseTo(0.1, 5);
  });

  it('対応していなければソフト側の範囲に落ちる', () => {
    for (const caps of [null, undefined, {}, { zoom: {} }, { zoom: { min: 2, max: 2 } }]) {
      const r = zoomRange(caps);
      expect(r.hardware).toBe(false);
      expect(r.min).toBe(MIN_ZOOM);
      expect(r.max).toBe(MAX_ZOOM);
    }
  });
});

describe('スライダーの値から適用するもの', () => {
  const hw = zoomRange({ zoom: { min: 1, max: 8, step: 0.1 } });
  const sw = zoomRange(null);

  it('ハードウェアズームがあるときは枠を動かさない', () => {
    const p = zoomPlan(hw, 3);
    expect(p.hardwareZoom).toBe(3);
    expect(p.guideWidth).toBe(BASE_GUIDE_WIDTH);
  });

  it('無いときは枠を狭めて原寸で切り出す（デジタルズーム）', () => {
    const p = zoomPlan(sw, 2);
    expect(p.hardwareZoom).toBeNull();
    expect(p.guideWidth).toBeCloseTo(BASE_GUIDE_WIDTH / 2, 5);
  });

  it('倍率を上げるほど枠は狭くなる', () => {
    const widths = [1, 2, 3, 4].map(v => zoomPlan(sw, v).guideWidth);
    expect(widths).toEqual([...widths].sort((a, b) => b - a));
    expect(new Set(widths).size).toBe(4);
  });

  it('枠を狭めすぎない（液晶が入らなくなるため）', () => {
    expect(zoomPlan(sw, 100).guideWidth).toBeGreaterThanOrEqual(24);
  });

  it('等倍では基準の枠に戻る', () => {
    expect(zoomPlan(sw, 1).guideWidth).toBe(BASE_GUIDE_WIDTH);
    expect(zoomPlan(hw, 1).hardwareZoom).toBe(1);
  });

  it('範囲外や壊れた値は範囲内に丸める', () => {
    expect(zoomPlan(sw, 99).factor).toBe(MAX_ZOOM);
    expect(zoomPlan(sw, -5).factor).toBe(MIN_ZOOM);
    expect(zoomPlan(sw, 'abc').factor).toBe(MIN_ZOOM);
    expect(zoomPlan(hw, 99).hardwareZoom).toBe(8);
  });

  it('最小値が1でない端末でも実効倍率は1から始まる', () => {
    const r = zoomRange({ zoom: { min: 2, max: 10, step: 0.5 } });
    expect(zoomPlan(r, 2).factor).toBe(1);
    expect(zoomPlan(r, 10).factor).toBe(5);
  });
});

describe('表示', () => {
  it('小数1桁の倍率で出す', () => {
    expect(zoomLabel(1)).toBe('1.0×');
    expect(zoomLabel(2.34)).toBe('2.3×');
    expect(zoomLabel(2.37)).toBe('2.4×');
  });
});
