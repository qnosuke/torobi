// 体組成計の液晶をカメラで読み取るシート。
// 認識エンジン（sevenseg / session）は krd-scan から取り込んだものを使う。
// 読み取った値は記録シートの入力欄に流し込むので、確認画面は持たない。
//
// 画面の一部を切り出すことはしない。枠に合わせてもらう必要がなく、
// 切ることで起きる読み違え（端で欠けた桁が増える等）も避けられる。

import { METRICS } from "./metrics.js";
import { CaptureSession } from "./session.js";
import { recognizeFrame } from "./sevenseg.js";
import { startCamera, stopCamera, grabFrame, grabGuideROI, cameraCapabilities, applyZoom } from "./camera.js";
import { pickReading } from "./pickReading.js";
import { zoomRange, zoomPlan, zoomLabel, BASE_GUIDE_WIDTH } from "./zoom.js";

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
  const zoomRow = $("zoomRow");
  const zoomInput = $("zoomRange");
  const zoomValue = $("zoomValue");
  const workCanvas = document.createElement("canvas");

  let session = null;
  let timer = null;
  let running = false;
  let range = zoomRange(null);

  // ---- ズーム ----
  // 端末がセンサー側のズームに対応していればそれを使い、無ければ読む範囲
  // （ガイド枠）を狭めて原寸で切り出す。操作は1本のスライダーに集約する。
  function setupZoom() {
    range = zoomRange(cameraCapabilities());
    zoomInput.min = String(range.min);
    zoomInput.max = String(range.max);
    zoomInput.step = String(range.step);
    zoomInput.value = String(range.min);
    zoomRow.hidden = false;
    applyZoomValue(range.min);
  }

  function applyZoomValue(value) {
    const plan = zoomPlan(range, value);
    guide.style.setProperty("--guide-w", `${plan.guideWidth}%`);
    zoomValue.textContent = zoomLabel(plan.factor);
    if (plan.hardwareZoom != null) applyZoom(plan.hardwareZoom);
  }

  zoomInput.addEventListener("input", () => applyZoomValue(zoomInput.value));

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

  /**
   * カメラ枠を映像の縦横比に合わせる。
   * 端末を縦に持つと映像も縦長で来るため、固定の 16:9 のままだと左右が黒帯になり、
   * 映像が細い帯まで縮んでしまう。何を写しているか見えないので液晶を大きく
   * 捉えられず、ガイド枠も映像の外にはみ出して切り出す範囲がずれる。
   */
  function fitCameraBox() {
    const { videoWidth: w, videoHeight: h } = video;
    if (w > 0 && h > 0) wrap.style.setProperty("--ar", String(w / h));
  }
  video.addEventListener("loadedmetadata", fitCameraBox);
  video.addEventListener("resize", fitCameraBox);   // 端末の回転で縦横が入れ替わる

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
      zoomRow.hidden = true;
      guide.style.setProperty("--guide-w", `${BASE_GUIDE_WIDTH}%`);
      startBtn.hidden = false;
      finishBtn.hidden = true;
      sheet.classList.add("open");
      statusEl.textContent = "カメラ起動中…";
      try {
        await startCamera(video);
        fitCameraBox();   // loadedmetadata を取り逃していても合わせる
        setupZoom();
        statusEl.textContent = "「読み取り開始」を押して体組成計に乗ってください";
      } catch (e) {
        statusEl.textContent = "カメラを起動できません。ブラウザの設定でカメラを許可してください";
        console.error(e);
      }
    },
    close,
  };
}
