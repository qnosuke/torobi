// 液晶の位置を自動で見つけて追いかけるための土台のテスト。
// 実機フレーム（足・床・ベゼル込みの全体）から数字の位置が取れることを見る。
import { describe, it, expect } from 'vitest';
import { recognizeGray, boundsOf } from '../src/scan/sevenseg.js';
import { trackRect, toVideoRect, toScreenRect } from '../src/scan/camera.js';
import { loadGrayFixture, FIXTURE_W, FIXTURE_H } from './helpers/loadFixture.js';

const CASES = [
  ['real_t11.gray.gz', '64.2'],
  ['real_t13.gray.gz', '20.8'],
  ['real_t17.gray.gz', '36.2'],
  ['real_t21.gray.gz', '1538'],
];

describe('桁の位置を返す', () => {
  for (const [file, expected] of CASES) {
    it(`${file} は読み取りと一緒に位置も返す`, () => {
      const { text, boxes } = recognizeGray(loadGrayFixture(file));
      expect(text).toBe(expected);
      expect(boxes.length).toBeGreaterThan(0);
      const b = boundsOf(boxes);
      // フレーム内に収まっている
      expect(b.x0).toBeGreaterThanOrEqual(0);
      expect(b.y0).toBeGreaterThanOrEqual(0);
      expect(b.x1).toBeLessThan(FIXTURE_W);
      expect(b.y1).toBeLessThan(FIXTURE_H);
      // 数字の並びなので、フレーム全体より十分小さく、点でもない
      const area = (b.x1 - b.x0) * (b.y1 - b.y0);
      expect(area).toBeGreaterThan(500);
      expect(area).toBeLessThan(FIXTURE_W * FIXTURE_H * 0.5);
      // 横並びの数字なので横長になる
      expect(b.x1 - b.x0).toBeGreaterThan(b.y1 - b.y0);
    });
  }

  it('読めないフレームでは位置も返さない', () => {
    const r = recognizeGray(loadGrayFixture('real_t2.gray.gz'));
    expect(r.text).toBeNull();
    expect(boundsOf(r.boxes)).toBeNull();
  });
});

describe('追跡中の切り出しでも同じ値を読める', () => {
  // アプリが次のフレームで処理する範囲を、そのまま同じ関数で作る
  function crop(gray, rect) {
    const w = rect.x1 - rect.x0 + 1, h = rect.y1 - rect.y0 + 1;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) out[y * w + x] = gray.data[(rect.y0 + y) * gray.width + rect.x0 + x];
    return { width: w, height: h, data: out };
  }

  const ALL = [
    ['real_t11.gray.gz', '64.2'], ['real_t13.gray.gz', '20.8'], ['real_t15.gray.gz', '8'],
    ['real_t17.gray.gz', '36.2'], ['real_t19.gray.gz', '41'],
    ['real_t21.gray.gz', '1538'], ['real_t23.gray.gz', '22.7'],
  ];

  for (const [file, expected] of ALL) {
    it(`${file} は追跡範囲だけでも "${expected}" を読む`, () => {
      const gray = loadGrayFixture(file);
      const b = boundsOf(recognizeGray(gray).boxes);
      const rect = trackRect(b, gray.width, gray.height);
      expect(recognizeGray(crop(gray, rect)).text).toBe(expected);
    });
  }

  it('追跡範囲は必ずフレーム内に収まる', () => {
    const r = trackRect({ x0: 0, y0: 0, x1: 20, y1: 10 }, 960, 540);
    expect(r.x0).toBeGreaterThanOrEqual(0);
    expect(r.y0).toBeGreaterThanOrEqual(0);
    expect(r.x1).toBeLessThan(960);
    expect(r.y1).toBeLessThan(540);
  });

  it('小さすぎる範囲は最小サイズまで広げる', () => {
    // 数字が小さく写っていても、二値化が壊れない大きさを確保する
    const r = trackRect({ x0: 470, y0: 265, x1: 490, y1: 275 }, 960, 540);
    expect(r.x1 - r.x0).toBeGreaterThanOrEqual(960 * 0.4 - 1);
    expect(r.y1 - r.y0).toBeGreaterThanOrEqual(540 * 0.4 - 1);
  });
});

describe('座標の変換', () => {
  // 切り出し画像内の座標 → 映像内の座標
  it('縮小して切り出した画像の座標を映像の座標に戻せる', () => {
    const grab = { rect: { x0: 100, y0: 50, x1: 739, y1: 409 }, scale: 0.5 };
    expect(toVideoRect({ x0: 10, y0: 20, x1: 110, y1: 70 }, grab))
      .toEqual({ x0: 120, y0: 90, x1: 320, y1: 190 });
  });

  // 映像内の座標 → 画面上の位置（object-fit: cover）
  it('横長の映像を縦長の枠に cover 表示したときの位置', () => {
    const video = { videoWidth: 1280, videoHeight: 720, clientWidth: 300, clientHeight: 225 };
    // cover: scale = max(300/1280, 225/720) = 0.3125、横に食み出す
    const s = toScreenRect({ x0: 640, y0: 360, x1: 639 + 320, y1: 359 + 180 }, video);
    expect(s.width).toBeCloseTo(100, 5);
    expect(s.height).toBeCloseTo(56.25, 5);
    expect(s.left).toBeCloseTo(640 * 0.3125 - (1280 * 0.3125 - 300) / 2, 5);
    expect(s.top).toBeCloseTo(360 * 0.3125 - (720 * 0.3125 - 225) / 2, 5);
  });

  it('映像の大きさが分からないうちは位置を返さない', () => {
    expect(toScreenRect({ x0: 0, y0: 0, x1: 1, y1: 1 },
      { videoWidth: 0, videoHeight: 0, clientWidth: 300, clientHeight: 225 })).toBeNull();
  });
});
