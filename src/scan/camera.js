// カメラ制御とフレーム取得。

let currentStream = null;

/** 背面カメラを起動して video 要素に接続する */
export async function startCamera(videoEl) {
  stopCamera();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      // 体組成計は床にあるので、立って構えると液晶は画面のごく一部にしかならない。
      // ズームで枠を狭めて原寸で切り出しても、元の画素が無ければ桁は読めない
      // （実測: 撮影1080幅だと占有20%で0/7、2160幅なら4/7）。
      // 端末が出せるだけもらい、認識の直前に必要なところまで落とす。
      width: { ideal: 3840 },
      height: { ideal: 2160 },
    },
    audio: false,
  });
  currentStream = stream;
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

/** 現在のストリームの映像トラック（無ければ null） */
function videoTrack() {
  return currentStream ? currentStream.getVideoTracks()[0] ?? null : null;
}

/**
 * カメラの能力。ズームに対応しているかの判定に使う。
 * 取得できない環境（古いSafari等）では null を返す。
 */
export function cameraCapabilities() {
  const track = videoTrack();
  if (!track || typeof track.getCapabilities !== 'function') return null;
  try { return track.getCapabilities(); } catch (e) { return null; }
}

/**
 * センサー側のズームを適用する。対応していなければ何もしない。
 * @returns {Promise<boolean>} 実際に適用できたか
 */
export async function applyZoom(value) {
  const track = videoTrack();
  if (!track || typeof track.applyConstraints !== 'function') return false;
  try {
    await track.applyConstraints({ advanced: [{ zoom: value }] });
    return true;
  } catch (e) {
    return false;   // 端末が拒否しても読み取り自体は続けられる
  }
}

export function stopCamera() {
  if (currentStream) {
    for (const track of currentStream.getTracks()) track.stop();
    currentStream = null;
  }
}

/**
 * フレーム全体を ImageData として取り出す（必要なら縮小する）。
 *
 * 一部だけを切り出して渡すことはしない。切ると二値化の窓が変わって
 * 読み違えるうえ、端で桁が欠けると数字が増える（実機フレームでは
 * 基礎代謝「1538」が「15388」になり、範囲外として捨てられ続けた）。
 * 認識エンジンは元々フレーム全体から数字を見つけられる。
 *
 * @param {HTMLVideoElement} videoEl
 * @param {HTMLCanvasElement} canvas 作業用キャンバス（使い回す）
 * 縮小しすぎると桁に乗る画素が減り、桁数の多い表示から先に読めなくなる
 * （4桁の基礎代謝だけ確定しない）。1280 は実機フレームで1フレームあたり
 * 40ms 前後、ブレたフレームでも 100ms 未満で、10fps の間隔に収まる上限。
 *
 * @param {HTMLVideoElement} videoEl
 * @param {HTMLCanvasElement} canvas 作業用キャンバス（使い回す）
 * @param {number} maxWidth 縮小後の最大幅
 */
/**
 * ガイド枠に対応する映像内の領域を、原寸に近い解像度で切り出す。
 * video は object-fit: contain で表示されている前提で座標を変換する。
 *
 * 液晶が画面の半分を切ると、フレーム全体からの読み取りは成立しなくなる
 * （背景の塊が桁の並びとして競合し、桁に乗る画素も減るため）。枠の中だけを
 * 渡せば「ほぼ全部が液晶」の画像になり、認識の条件が大きく良くなる。
 * ただし枠から桁がはみ出すと欠けて誤読するので、呼び出し側でフレーム全体の
 * 読み取りと突き合わせて使う（pickReading）。
 *
 * 上限が全体より小さいのは、切り出した時点で液晶が画像の大半を占めており、
 * 桁には十分な画素が乗るため。1フレームに2回読むので処理時間を抑える。
 */
export function grabGuideROI(videoEl, containerRect, guideRect, canvas, { margin = 1.2, maxWidth = 960 } = {}) {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (!vw || !vh) return null;

  const scale = Math.min(containerRect.width / vw, containerRect.height / vh); // contain
  const letterX = (containerRect.width - vw * scale) / 2;
  const letterY = (containerRect.height - vh * scale) / 2;

  const cx = guideRect.left - containerRect.left + guideRect.width / 2;
  const cy = guideRect.top - containerRect.top + guideRect.height / 2;
  const w = guideRect.width * margin;
  const h = guideRect.height * margin;

  let sx = Math.max(0, (cx - w / 2 - letterX) / scale);
  let sy = Math.max(0, (cy - h / 2 - letterY) / scale);
  const sw = Math.min(w / scale, vw - sx);
  const sh = Math.min(h / scale, vh - sy);
  if (sw < 40 || sh < 20) return null;

  const k = Math.min(1, maxWidth / sw);
  canvas.width = Math.round(sw * k);
  canvas.height = Math.round(sh * k);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function grabFrame(videoEl, canvas, maxWidth = 1280) {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (!vw || !vh) return null;

  const scale = Math.min(1, maxWidth / vw);
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
