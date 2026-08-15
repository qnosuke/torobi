// ガイド枠の中とフレーム全体、2つの読み取り結果からどちらを採るか決める。純関数。
//
// 枠の中は「ほぼ全部が液晶」の画像になるので普段はこちらが正確だが、桁が枠から
// はみ出すと端が欠ける。欠けた桁は消えるか（1538→538）、部分的に残って別の桁に
// 化ける（1538→15388）。どちらも「端が1文字ちがうだけ」の形に必ずなるので、
// その関係になっているときだけ、切り出していない全体の読み取りを信じる。

/** ユーザー番号画面や細長い影の誤読。セッション側でも無視される値 */
const IGNORED = "1";

/** a と b が「端の1文字だけ違う」関係か（＝切り出しで桁が欠けた形） */
function edgeDiff(a, b) {
  if (a.length < 2 || b.length < 2) return false;
  if (Math.abs(a.length - b.length) !== 1) return false;
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.startsWith(short) || long.endsWith(short);
}

/**
 * @param {string|null} roiText ガイド枠の中の読み取り
 * @param {string|null} fullText フレーム全体の読み取り
 * @returns {string|null} セッションに渡す値
 */
export function pickReading(roiText, fullText) {
  const roi = roiText === IGNORED ? null : (roiText ?? null);
  const full = fullText === IGNORED ? null : (fullText ?? null);
  if (roi == null) return full;
  if (full == null) return roi;
  if (roi === full) return roi;
  // 端の桁が欠けた／増えた関係なら、切り出していない全体を信じる
  if (edgeDiff(roi, full)) return full;
  // それ以外の食い違いは、桁に乗る画素が多い枠の中を採る
  return roi;
}
