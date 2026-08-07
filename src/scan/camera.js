// カメラ制御とフレーム取得。

let currentStream = null;

/** 背面カメラを起動して video 要素に接続する */
export async function startCamera(videoEl) {
  stopCamera();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  currentStream = stream;
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
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
 * @param {number} maxWidth 縮小後の最大幅。960は実機フレームで検証済みの解像度
 */
export function grabFrame(videoEl, canvas, maxWidth = 960) {
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
