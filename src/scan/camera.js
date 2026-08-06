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
 * ガイド枠（画面座標）に対応する映像内の領域を ImageData として切り出す。
 * video は object-fit: cover で表示されている前提で座標変換する。
 *
 * @param {HTMLVideoElement} videoEl
 * @param {DOMRect} containerRect カメラ表示領域の getBoundingClientRect()
 * @param {DOMRect} guideRect ガイド枠の getBoundingClientRect()
 * @param {HTMLCanvasElement} canvas 作業用キャンバス（使い回す）
 * @returns {ImageData|null}
 */
export function grabGuideROI(videoEl, containerRect, guideRect, canvas) {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (!vw || !vh) return null;

  const cw = containerRect.width;
  const ch = containerRect.height;
  const scale = Math.max(cw / vw, ch / vh); // cover
  const offsetX = (vw * scale - cw) / 2;
  const offsetY = (vh * scale - ch) / 2;

  // ガイド枠 → 映像ピクセル座標
  const gx = (guideRect.left - containerRect.left + offsetX) / scale;
  const gy = (guideRect.top - containerRect.top + offsetY) / scale;
  const gw = guideRect.width / scale;
  const gh = guideRect.height / scale;

  const sx = Math.max(0, Math.round(gx));
  const sy = Math.max(0, Math.round(gy));
  const sw = Math.min(vw - sx, Math.round(gw));
  const sh = Math.min(vh - sy, Math.round(gh));
  if (sw < 10 || sh < 10) return null;

  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, sw, sh);
  return ctx.getImageData(0, 0, sw, sh);
}

/**
 * 映像内の矩形（映像ピクセル座標）を ImageData として切り出す。
 * rect を省略すると全体。maxWidth を超える場合は縮小して返す。
 * 戻り値の rect は実際に切り出した映像内の領域（座標変換に使う）。
 */
export function grabRegion(videoEl, canvas, rect, maxWidth = 960) {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (!vw || !vh) return null;

  const r = rect ?? { x0: 0, y0: 0, x1: vw - 1, y1: vh - 1 };
  const sx = Math.max(0, Math.round(r.x0));
  const sy = Math.max(0, Math.round(r.y0));
  const sw = Math.min(vw - sx, Math.round(r.x1 - r.x0 + 1));
  const sh = Math.min(vh - sy, Math.round(r.y1 - r.y0 + 1));
  if (sw < 10 || sh < 10) return null;

  const scale = Math.min(1, maxWidth / sw);
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return {
    image: ctx.getImageData(0, 0, canvas.width, canvas.height),
    rect: { x0: sx, y0: sy, x1: sx + sw - 1, y1: sy + sh - 1 },
    scale,
  };
}

/** 切り出し画像内の矩形 → 映像ピクセル座標の矩形 */
export function toVideoRect(box, grab) {
  const { rect, scale } = grab;
  return {
    x0: rect.x0 + box.x0 / scale,
    y0: rect.y0 + box.y0 / scale,
    x1: rect.x0 + box.x1 / scale,
    y1: rect.y0 + box.y1 / scale,
  };
}

/** 映像ピクセル座標の矩形 → 表示上の位置（object-fit: cover 前提のCSS px） */
export function toScreenRect(videoRect, videoEl) {
  const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
  const cw = videoEl.clientWidth, ch = videoEl.clientHeight;
  if (!vw || !vh || !cw || !ch) return null;
  const scale = Math.max(cw / vw, ch / vh);   // cover
  const offsetX = (vw * scale - cw) / 2;
  const offsetY = (vh * scale - ch) / 2;
  return {
    left: videoRect.x0 * scale - offsetX,
    top: videoRect.y0 * scale - offsetY,
    width: (videoRect.x1 - videoRect.x0 + 1) * scale,
    height: (videoRect.y1 - videoRect.y0 + 1) * scale,
  };
}

/**
 * 見つけた数字の矩形から、次のフレームで処理する範囲を決める（純関数）。
 *
 * 二値化の窓は画像の短辺から決まるため、切り出しが小さすぎると数字が
 * 背景ごと潰れて先頭桁を落とす（実機フレームで確認）。余白を広く取り、
 * さらにフレームに対する最小サイズを下限として持たせる。
 */
export function trackRect(r, frameW, frameH, { margin = 1.5, minRatio = 0.4 } = {}) {
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
  const halfW = Math.max((r.x1 - r.x0 + 1) * (0.5 + margin), frameW * minRatio / 2);
  const halfH = Math.max((r.y1 - r.y0 + 1) * (0.5 + margin), frameH * minRatio / 2);
  return {
    x0: Math.max(0, Math.round(cx - halfW)),
    y0: Math.max(0, Math.round(cy - halfH)),
    x1: Math.min(frameW - 1, Math.round(cx + halfW)),
    y1: Math.min(frameH - 1, Math.round(cy + halfH)),
  };
}
