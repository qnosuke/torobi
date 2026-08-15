// 体組成計の液晶をカメラで読み取るシート。
// 認識エンジン（sevenseg / session）は krd-scan から取り込んだものを使う。
// 読み取った値は記録シートの入力欄に流し込むので、確認画面は持たない。
//
// 画面の一部を切り出すことはしない。枠に合わせてもらう必要がなく、
// 切ることで起きる読み違え（端で欠けた桁が増える等）も避けられる。

import { METRICS } from "./metrics.js";
import { CaptureSession } from "./session.js";
import { recognizeFrame } from "./sevenseg.js";
import { startCamera, stopCamera, grabFrame, grabGuideROI } from "./camera.js";
import { pickReading } from "./pickReading.js";

// 1フレームにつき枠の中と全体の2回読むので、間隔は広めに取る
const INTERVAL_MS = 150;

export function createScanSheet({ onDone, onClose }) {
  const $ = id => document.getElementById(id);
  const sheet = $("scanSheet");
  const video = $("scanVideo");
  const statusEl = $("scanStatus");
  const chipsEl = $("scanChips");
  const startBtn = $("scanStart");
  const finishBtn = $("scanFinish");
  const closeBtn = $("scanClose");
  const wrap = sheet.querySelector(".camera-wrap");
  const guide = sheet.querySelector(".scan-guide");
  const workCanvas = document.createElement("canvas");

  let session = null;
  let timer = null;
  let running = false;

  function renderChips(results) {
    chipsEl.innerHTML = METRICS.map(m => {
      const v = results?.[m.key];
      return `<span class="scan-chip${v ? " done" : ""}">${m.label}${v ? " " + v : ""}</span>`;
    }).join("");
  }

  /** 何が残っているかを出す。1〜2項目で止まったとき、どこに寄せればよいか分かる */
  function remaining(results) {
    const missing = METRICS.filter(m => !results[m.key]).map(m => m.label);
    if (missing.length === 0) return "";
    return missing.length <= 2 ? `残り ${missing.join("・")}` : `残り ${missing.length}項目`;
  }

  function stopLoop() {
    running = false;
    clearTimeout(timer);
    timer = null;
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

  /** 枠の中（原寸に近い）と全体の両方を読み、確からしい方を返す */
  function readFrame() {
    const roi = grabGuideROI(video, wrap.getBoundingClientRect(), guide.getBoundingClientRect(), workCanvas);
    const roiText = roi ? recognizeFrame(roi).text : null;
    const frame = grabFrame(video, workCanvas);
    if (!frame && !roi) return undefined;          // まだ映像が来ていない
    const fullText = frame ? recognizeFrame(frame).text : null;
    return pickReading(roiText, fullText);
  }

  function tick() {
    if (!running) return;
    const started = performance.now();

    const text = readFrame();
    if (text !== undefined) {
      const { captured, complete } = session.feed(text);
      const results = session.getResults();
      statusEl.textContent = [text ? `読み取り中: ${text}` : "", remaining(results)]
        .filter(Boolean).join("　／　");
      if (captured) renderChips(results);
      if (complete) {
        statusEl.textContent = "7項目すべて読み取りました";
        if (navigator.vibrate) navigator.vibrate(200);
        finish();
        return;
      }
    }
    // 前の認識が長引いた分は詰めずに待つ（処理が溜まって固まるのを防ぐ）
    timer = setTimeout(tick, Math.max(16, INTERVAL_MS - (performance.now() - started)));
  }

  startBtn.addEventListener("click", () => {
    session = new CaptureSession({ stableFrames: 3 });
    renderChips({});
    statusEl.textContent = "液晶が大きく映るように近づけてください";
    startBtn.hidden = true;
    finishBtn.hidden = false;
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
