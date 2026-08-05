// 音と画面スリープ防止。
// iOS Safariは消音スイッチでWeb Audioがミュートされるため、セッションを
// playback扱いにし、無音ループでメディア再生セッションを維持する。

let audioCtx = null, silentEl = null;
let enabled = true;

const SILENT_WAV = "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

export function setSoundEnabled(on) { enabled = on; }
export function isSoundEnabled() { return enabled; }

export function ensureAudio() {
  try { if ("audioSession" in navigator) navigator.audioSession.type = "playback"; }
  catch (e) { /* 未対応ブラウザは無視 */ }
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  if (!silentEl) {
    silentEl = new Audio(SILENT_WAV);
    silentEl.loop = true;
    silentEl.setAttribute("playsinline", "");
  }
  silentEl.play().catch(() => {});
  const buf = audioCtx.createBuffer(1, 1, 22050);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  src.start(0);
}

export const stopSilentLoop = () => { if (silentEl) silentEl.pause(); };

export function beep(freq, dur, gainVal) {
  if (!audioCtx || !enabled) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(gainVal, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const beepDown = () => beep(440, 0.12, 0.5);   // 下ろし始め
export const beepUp = () => beep(880, 0.12, 0.5);     // 上げ始め
export const beepPrep = () => beep(660, 0.1, 0.4);    // 準備カウント
export const beepStep = () => beep(990, 0.2, 0.6);    // ウォームアップの切り替え

export function alarm() {
  [0, 0.18, 0.36, 0.54].forEach((d, i) => {
    setTimeout(() => beep(i === 3 ? 1320 : 990, 0.15, 0.6), d * 1000);
  });
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
}

// ---- 画面スリープ防止 ----
let wakeLock = null;

export async function acquireWakeLock() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); }
  catch (e) { /* 取れなくても致命的ではない */ }
}

export function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

/** 画面に戻ったとき、まだ動いていれば取り直す */
export function reacquireWakeLockOnVisible(isRunning) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isRunning()) acquireWakeLock();
  });
}
