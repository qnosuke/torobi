// ズームの決め方。純関数（DOM・カメラAPIに触れない）。
//
// 体組成計は床に置く。立ったまま構えると液晶は画面のごく一部にしかならず、
// その状態ではどう頑張っても読めない（実測で、液晶が画面幅の22%を切ると
// 全項目が読めなくなる）。しゃがまずに液晶を大きく捉える手段が要る。
//
// 端末がカメラのズームに対応していればそれを使う（センサー側で拡大するので
// 画素が減らない）。対応していない端末では、読む範囲＝ガイド枠を狭めて
// 原寸で切り出す。どちらも「ズームを上げると液晶が枠いっぱいになる」という
// 同じ操作感になる。

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** ガイド枠の基準の幅（カメラ表示に対する割合）。デジタルズームはここを狭める */
export const BASE_GUIDE_WIDTH = 84;

/** 枠を狭めすぎると液晶が入らないので下限を置く */
const MIN_GUIDE_WIDTH = 24;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * カメラの能力からスライダーの範囲を決める。
 * @param {object|null} caps track.getCapabilities() の戻り値（無い環境では null）
 * @returns {{hardware: boolean, min: number, max: number, step: number}}
 */
export function zoomRange(caps) {
  const z = caps && caps.zoom;
  if (z && Number.isFinite(z.min) && Number.isFinite(z.max) && z.max > z.min) {
    return {
      hardware: true,
      min: z.min,
      max: z.max,
      // 刻みが未申告なら、範囲を40分割した値を使う
      step: Number.isFinite(z.step) && z.step > 0 ? z.step : (z.max - z.min) / 40,
    };
  }
  return { hardware: false, min: MIN_ZOOM, max: MAX_ZOOM, step: 0.1 };
}

/**
 * スライダーの値から、実際に適用するものを決める。
 * ハードウェアズームがあるときは枠を動かさず、無いときだけ枠を狭める。
 * @returns {{hardwareZoom: number|null, guideWidth: number, factor: number}}
 *   guideWidth はカメラ表示に対する割合(%)、factor は実効倍率（表示用）
 */
export function zoomPlan(range, value) {
  const v = clamp(Number(value) || range.min, range.min, range.max);
  if (range.hardware) {
    return {
      hardwareZoom: v,
      guideWidth: BASE_GUIDE_WIDTH,
      factor: range.min > 0 ? v / range.min : v,
    };
  }
  return {
    hardwareZoom: null,
    guideWidth: clamp(BASE_GUIDE_WIDTH / v, MIN_GUIDE_WIDTH, BASE_GUIDE_WIDTH),
    factor: v,
  };
}

/** 表示用の倍率ラベル（1.0倍 → "1.0×"） */
export const zoomLabel = factor => `${factor.toFixed(1)}×`;
