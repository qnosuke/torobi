import { describe, it, expect } from 'vitest';
import { grabGuideROI } from '../src/scan/camera.js';

/** drawImage に渡された切り出し範囲を記録するだけのキャンバス */
function fakeCanvas() {
  const calls = [];
  return {
    width: 0,
    height: 0,
    calls,
    getContext: () => ({
      drawImage: (...args) => calls.push(args.slice(1)),
      getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    }),
  };
}

const rect = (left, top, width, height) => ({ left, top, width, height });

describe('ガイド枠から映像内の範囲を求める', () => {
  // 映像 1920x1080 を 16:9 の表示領域（360x202.5）に contain で表示した場合。
  // 余白は出ないので、表示上の比率がそのまま映像の比率になる。
  const video = { videoWidth: 1920, videoHeight: 1080 };
  const container = rect(0, 0, 360, 202.5);

  it('中央の枠は映像の中央を、余白1.2倍で切り出す', () => {
    const gw = 360 * 0.62;              // CSS の width: 62%
    const gh = gw / 2.5;                // CSS の aspect-ratio: 5 / 2
    const guide = rect((360 - gw) / 2, (202.5 - gh) / 2, gw, gh);
    const canvas = fakeCanvas();
    grabGuideROI(video, container, guide, canvas);

    const [sx, sy, sw, sh] = canvas.calls[0];
    expect(sw).toBeCloseTo(1920 * 0.62 * 1.2, 0);          // 枠の幅 × 余白
    expect(sh).toBeCloseTo(1920 * 0.62 / 2.5 * 1.2, 0);
    expect(sx + sw / 2).toBeCloseTo(1920 / 2, 0);          // 中央に来る
    expect(sy + sh / 2).toBeCloseTo(1080 / 2, 0);
  });

  it('枠が左上に寄っていれば、切り出しも同じ割合で寄る', () => {
    const guide = rect(0, 0, 360 * 0.5, 202.5 * 0.5);
    const canvas = fakeCanvas();
    grabGuideROI(video, container, guide, canvas, { margin: 1 });

    const [sx, sy, sw, sh] = canvas.calls[0];
    expect(sx).toBeCloseTo(0, 0);
    expect(sy).toBeCloseTo(0, 0);
    expect(sw).toBeCloseTo(960, 0);
    expect(sh).toBeCloseTo(540, 0);
  });

  it('映像が表示領域より縦長なら、左右の余白ぶんを差し引く', () => {
    // 4:3 の映像を 16:9 の枠に contain → 左右に余白が出る
    const v43 = { videoWidth: 1440, videoHeight: 1080 };
    const scale = 202.5 / 1080;              // 高さ基準で収まる
    const shown = 1440 * scale;              // 表示上の映像幅 = 270
    const letter = (360 - shown) / 2;        // 片側の余白 = 45
    const guide = rect(letter, 0, shown, 202.5);
    const canvas = fakeCanvas();
    grabGuideROI(v43, container, guide, canvas, { margin: 1 });

    const [sx, sy, sw, sh] = canvas.calls[0];
    expect(sx).toBeCloseTo(0, 0);            // 余白を引くと映像の左端
    expect(sy).toBeCloseTo(0, 0);
    expect(sw).toBeCloseTo(1440, 0);
    expect(sh).toBeCloseTo(1080, 0);
  });

  it('切り出しは映像の外にはみ出さない', () => {
    const guide = rect(-100, -50, 360 * 1.5, 202.5 * 1.5);
    const canvas = fakeCanvas();
    grabGuideROI(video, container, guide, canvas);

    const [sx, sy, sw, sh] = canvas.calls[0];
    expect(sx).toBeGreaterThanOrEqual(0);
    expect(sy).toBeGreaterThanOrEqual(0);
    expect(sx + sw).toBeLessThanOrEqual(1920);
    expect(sy + sh).toBeLessThanOrEqual(1080);
  });

  it('大きすぎる切り出しは上限まで縮める（処理時間を抑えるため）', () => {
    const guide = rect(0, 0, 360, 202.5);
    const canvas = fakeCanvas();
    grabGuideROI(video, container, guide, canvas, { margin: 1, maxWidth: 1280 });
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
  });

  it('映像がまだ来ていなければ null', () => {
    expect(grabGuideROI({ videoWidth: 0, videoHeight: 0 }, container, rect(0, 0, 10, 10), fakeCanvas())).toBeNull();
  });

  it('枠が小さすぎるときは切り出さない', () => {
    const guide = rect(0, 0, 2, 1);
    expect(grabGuideROI(video, container, guide, fakeCanvas())).toBeNull();
  });
});
