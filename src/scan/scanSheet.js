// 体組成計の液晶をカメラで読み取るシート。
// 認識エンジン（sevenseg / session）は krd-scan から取り込んだものを使う。
// 読み取った値は記録シートの入力欄に流し込むので、確認画面は持たない。
//
// 枠に合わせてもらう代わりに、数字の位置を自分で見つけて追いかける:
//   見失っている間はフレーム全体から探し（取得）、
//   見つかったらその周りだけを切り出して読む（追跡）。
//   追跡中は処理する画素が減るので、速く・安定して読める。

import { METRICS } from "./metrics.js";
import { CaptureSession } from "./session.js";
import { recognizeFrame, boundsOf } from "./sevenseg.js";
import {
  startCamera, stopCamera, grabRegion, toVideoRect, toScreenRect, trackRect,
} from "./camera.js";

const INTERVAL_MS = 100;   // 目標の間隔。処理が長引いたぶんは自動で間引く
const LOST_AFTER = 5;      // 連続で読めなかったら全体から探し直す
// 追跡時の切り出し方は camera.js の trackRect（実機フレームで余白を決めた）

export function createScanSheet({ onDone, onClose }) {
  const $ = id => document.getElementById(id);
  const sheet = $("scanSheet");
  const video = $("scanVideo");
  const trackBox = $("scanTrack");
  const statusEl = $("scanStatus");
  const chipsEl = $("scanChips");
  const startBtn = $("scanStart");
  const finishBtn = $("scanFinish");
  const closeBtn = $("scanClose");
  const workCanvas = document.createElement("canvas");

  let session = null;
  let timer = null;
  let running = false;
  let roi = null;      // 追跡中の矩形（映像ピクセル座標）
  let misses = 0;

  function renderChips(results) {
    chipsEl.innerHTML = METRICS.map(m => {
      const v = results?.[m.key];
      return `<span class="scan-chip${v ? " done" : ""}">${m.label}${v ? " " + v : ""}</span>`;
    }).join("");
  }

  function showTrack(videoRect) {
    const s = videoRect && toScreenRect(videoRect, video);
    if (!s) { trackBox.classList.remove("on"); return; }
    trackBox.style.left = `${s.left}px`;
    trackBox.style.top = `${s.top}px`;
    trackBox.style.width = `${s.width}px`;
    trackBox.style.height = `${s.height}px`;
    trackBox.classList.add("on");
  }

  function stopLoop() {
    running = false;
    clearTimeout(timer);
    timer = null;
    roi = null;
    misses = 0;
    trackBox.classList.remove("on");
    startBtn.hidden = false;
    finishBtn.hidden = true;
  }

  function finish() {
    const results = session ? session.getResults() : {};
    stopLoop();
    session = null;
    close();
    if (Object.keys(results).length > 0) onDone(results);
  }

  function tick() {
    if (!running) return;
    const started = performance.now();

    // 見失っていればフレーム全体から探す。960px幅は実機で検証済みの解像度。
    const tracking = roi && misses < LOST_AFTER;
    const region = tracking ? trackRect(roi, video.videoWidth, video.videoHeight) : null;
    const grab = grabRegion(video, workCanvas, region, 960);
    if (grab) {
      const { text, boxes } = recognizeFrame(grab.image);
      const bounds = boundsOf(boxes);
      if (bounds) {
        roi = toVideoRect(bounds, grab);
        misses = 0;
        showTrack(roi);
      } else {
        misses++;
        if (misses >= LOST_AFTER) { roi = null; trackBox.classList.remove("on"); }
      }

      const { captured, complete } = session.feed(text);
      statusEl.textContent = text
        ? `読み取り中: ${text}`
        : (roi ? "数字を追いかけています" : "液晶が映るように向けてください");
      if (captured) renderChips(session.getResults());
      if (complete) {
        statusEl.textContent = "7項目すべて読み取りました";
        if (navigator.vibrate) navigator.vibrate(200);
        finish();
        return;
      }
    }
    // 前の認識が長引いた分は詰めずに待つ（処理が溜まって固まるのを防ぐ）
    const wait = Math.max(16, INTERVAL_MS - (performance.now() - started));
    timer = setTimeout(tick, wait);
  }

  startBtn.addEventListener("click", () => {
    session = new CaptureSession({ stableFrames: 3 });
    renderChips({});
    statusEl.textContent = "液晶が映るように向けてください";
    startBtn.hidden = true;
    finishBtn.hidden = false;
    roi = null;
    misses = 0;
    running = true;
    tick();
  });
  finishBtn.addEventListener("click", finish);
  closeBtn.addEventListener("click", () => { stopLoop(); session = null; close(); });

  function close() {
    stopLoop();
    stopCamera();
    sheet.classList.remove("open");
    onClose?.();
  }

  return {
    async open() {
      renderChips({});
      startBtn.hidden = false;
      finishBtn.hidden = true;
      trackBox.classList.remove("on");
      sheet.classList.add("open");
      statusEl.textContent = "カメラ起動中…";
      try {
        await startCamera(video);
        statusEl.textContent = "「読み取り開始」を押して体組成計に乗ってください";
      } catch (e) {
        statusEl.textContent = "カメラを起動できません。ブラウザの設定でカメラを許可してください";
        console.error(e);
      }
    },
    close,
  };
}
