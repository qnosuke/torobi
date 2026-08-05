// 画面と操作。計測ロジックとデータはそれぞれのモジュールに置く。

import {
  phaseLabel, buildProgram, WARMUP_STEPS, WARMUP_TOTAL,
} from "./program.js";
import {
  goalFromBase, nextPos, doneSets, isComplete, firstUndone,
} from "./sets.js";
import {
  loadWeek, saveWeek, loadLog, recordSet, clearRecordedExercise,
  saveBody, loadTodayBody, lastTimeSeconds, autoDay, todayKey, SIDE_JA,
} from "./storage.js";
import { buildTodayText, buildCsv } from "./exportData.js";
import {
  ensureAudio, stopSilentLoop, setSoundEnabled, beepDown, beepUp, beepPrep,
  beepStep, alarm, acquireWakeLock, releaseWakeLock, reacquireWakeLockOnVisible,
} from "./audio.js";
import { METRICS } from "./scan/metrics.js";
import { createScanSheet } from "./scan/scanSheet.js";

// Service Worker 登録（vite-plugin-pwa。dev では no-op）
if (import.meta.env.PROD) {
  import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}

// 記録シートでの体組成の並び。メソッドが記録する3項目を先に置く。
const BODY_ORDER = ["weight", "bodyFat", "skeletalMuscle", "visceralFat", "bmi", "basalMetabolism", "bodyAge"];

// ---- state ----
const state = {
  week: loadWeek(),
  day: null,
  exercises: [],
  exIndex: 0,
  running: false,
  mode: "up",          // "warmup" | "prep" | "up"(1セット目) | "down"(2セット目以降)
  prep: 3,
  lastPrepSec: -1,
  lastWuStep: -1,
  startTime: 0,
  elapsed: 0,
  tempoDown: 2,
  tempoUp: 2,
  rafId: null,
  lastBeatIndex: -1,
};
state.day = autoDay();

function buildExercises() {
  state.exercises = [
    { warmup: true, name: "ウォームアップ", weight: "3分", done: false },
    ...buildProgram(state.week, state.day).map(e => ({
      ...e,
      sets: [], base: { L: null, R: null }, goal: { L: null, R: null },
      setNo: 1, side: e.uni ? "L" : null,
    })),
  ];
  restoreToday();
  state.exIndex = firstUndone(state.exercises);
}

const cur = () => state.exercises[state.exIndex];
const repSeconds = () => state.tempoDown + state.tempoUp;
const toReps = sec => Math.floor(sec / repSeconds());
const fmt = sec => String(Math.max(0, Math.ceil(sec)));
const curBase = ex => ex.uni ? ex.base[ex.side] : ex.base.L;
const curGoal = ex => ex.uni ? ex.goal[ex.side] : ex.goal.L;

/** 記録の保存先を決める文脈（その日の週とメニュー） */
const ctx = () => ({ week: state.week, day: state.day });

function restoreToday() {
  const e = loadLog()[todayKey()];
  if (!e) return;
  state.exercises.forEach(ex => {
    if (ex.warmup) return;
    const mine = (e.sets || []).filter(s => s.ex === ex.name).sort((a, b) => a.no - b.no);
    if (mine.length === 0) return;
    ex.sets = mine.map(s => ({ no: s.no, seconds: s.sec, side: s.side || null }));
    ["L", "R"].forEach(side => {
      const first = mine.find(s => s.no === 1 && (s.side || "L") === side);
      if (first) {
        ex.base[side] = first.sec;
        ex.goal[side] = goalFromBase(first.sec);
      }
    });
    Object.assign(ex, nextPos(ex));
  });
}

// ---- elements ----
const $ = id => document.getElementById(id);
const dots = $("dots"), helpBtn = $("helpBtn"), exNameText = $("exNameText");
const exMeta = $("exMeta"), howto = $("howto"), timeDisp = $("timeDisp");
const phaseDisp = $("phaseDisp"), subDisp = $("subDisp"), mainBtn = $("mainBtn");
const beatFlash = $("beatFlash"), extraSetBtn = $("extraSetBtn"), stage = document.querySelector(".stage");
const weekDisp = $("weekDisp"), daySeg = $("daySeg"), prepSeg = $("prepSeg"), soundSeg = $("soundSeg");
const exportMsg = $("exportMsg"), recToday = $("recToday");
const sheetBg = $("sheetBg"), settingsSheet = $("settingsSheet"), recordSheet = $("recordSheet");
const bodyGrid = $("bodyGrid");

// ---- テンポは週と種目から自動 ----
function autoTempo() {
  state.tempoDown = (cur().isolation && state.week >= 7) ? 4 : 2;
}

// ---- rendering ----
function renderDots() {
  dots.innerHTML = state.exercises.map((e, i) =>
    `<button data-i="${i}" class="${isComplete(e) ? "done" : ""}${i === state.exIndex ? " on" : ""}" aria-label="${e.name}"><i></i></button>`
  ).join("");
}

function renderIdle() {
  const ex = cur();
  renderDots();
  howto.textContent = ex.warmup
    ? WARMUP_STEPS.map((s, i) => `${i + 1}. ${s.name}（${s.sec}秒）`).join("\n")
    : ex.howto;
  exNameText.textContent = ex.name;
  phaseDisp.textContent = "";
  mainBtn.classList.remove("running");
  timeDisp.classList.remove("tiny");

  if (ex.warmup) {
    exMeta.textContent = ex.done ? "3分 ─ 完了 ✓" : "3分・4ステップ";
    timeDisp.textContent = String(WARMUP_TOTAL);
    timeDisp.className = "time";
    subDisp.textContent = ex.done ? "" : "音が切り替わったら次の動きへ";
    mainBtn.textContent = ex.done ? "次の種目へ ▸" : "ウォームアップ開始";
    extraSetBtn.classList.add("hide");
    return;
  }

  const side = ex.uni ? SIDE_JA[ex.side] : "";
  exMeta.textContent = `${ex.weight}${ex.uni ? "・左右" : ""}`;

  if (isComplete(ex)) {
    const first = ex.sets.filter(s => s.no === 1);
    timeDisp.textContent = ex.uni
      ? `${(first.find(s => s.side === "L") || {}).seconds ?? "-"} / ${(first.find(s => s.side === "R") || {}).seconds ?? "-"}`
      : String(first.length ? first[0].seconds : "-");
    timeDisp.className = "time done" + (ex.uni ? " tiny" : "");
    subDisp.innerHTML = `${ex.target}セット完了${ex.uni ? "（左 / 右）" : ""}`;
    mainBtn.textContent = state.exIndex < state.exercises.length - 1 ? "次の種目へ ▸" : "今日は終わり";
    extraSetBtn.classList.remove("hide");
    return;
  }

  extraSetBtn.classList.add("hide");
  const setInfo = `セット${ex.setNo}/${ex.target}${side ? "・" + side : ""}`;
  if (ex.setNo === 1) {
    const prev = lastTimeSeconds(ex.name, ex.side);
    timeDisp.textContent = "0";
    timeDisp.className = "time";
    subDisp.innerHTML = prev
      ? `${setInfo}　全力<br>前回${side} <b>${prev.sec}秒</b> を上回る`
      : `${setInfo}　全力<br>崩れる直前まで`;
    mainBtn.textContent = `開始${side ? `（${side}）` : ""}`;
  } else {
    timeDisp.textContent = fmt(curGoal(ex));
    timeDisp.className = "time count-down";
    subDisp.innerHTML = `${setInfo}　8割<br>1セット目${side} <b>${curBase(ex)}秒</b> → <b>${curGoal(ex)}秒</b>`;
    mainBtn.textContent = `開始${side ? `（${side}）` : ""}`;
  }
}

// ---- metronome ----
function handleBeats(elapsed) {
  const rep = repSeconds();
  const inRep = elapsed % rep;
  const down = inRep < state.tempoDown;
  phaseDisp.textContent = down ? "↓ 下ろす" : "↑ 上げる";
  const beatIndex = Math.floor(elapsed / rep) * 2 + (down ? 0 : 1);
  if (beatIndex !== state.lastBeatIndex) {
    state.lastBeatIndex = beatIndex;
    if (elapsed > 0.05) (down ? beepDown : beepUp)();
    flashBeat();
  }
}
function flashBeat() {
  beatFlash.classList.add("flash");
  setTimeout(() => beatFlash.classList.remove("flash"), 100);
}

// ---- loop ----
function tick() {
  if (!state.running) return;
  const elapsed = (performance.now() - state.startTime) / 1000;
  state.elapsed = elapsed;

  if (state.mode === "warmup") {
    if (elapsed >= WARMUP_TOTAL) { finishWarmup(); return; }
    let acc = 0, idx = 0, remain = 0;
    for (let i = 0; i < WARMUP_STEPS.length; i++) {
      if (elapsed < acc + WARMUP_STEPS[i].sec) { idx = i; remain = acc + WARMUP_STEPS[i].sec - elapsed; break; }
      acc += WARMUP_STEPS[i].sec;
    }
    timeDisp.textContent = fmt(remain);
    exMeta.textContent = `${idx + 1} / ${WARMUP_STEPS.length}`;
    subDisp.innerHTML = `<b>${WARMUP_STEPS[idx].name}</b>`;
    if (idx !== state.lastWuStep) {
      state.lastWuStep = idx;
      if (elapsed > 0.05) beepStep();
      if (navigator.vibrate) navigator.vibrate(150);
      flashBeat();
    }
  } else if (state.mode === "prep") {
    const remain = state.prep - elapsed;
    if (remain <= 0) { startWork(); }
    else {
      const shown = Math.ceil(remain);
      timeDisp.textContent = String(shown);
      if (shown !== state.lastPrepSec) { state.lastPrepSec = shown; beepPrep(); flashBeat(); }
    }
  } else if (state.mode === "up") {
    timeDisp.textContent = fmt(Math.floor(elapsed));
    subDisp.innerHTML = `約 <b>${toReps(elapsed)}</b> 回`;
    handleBeats(elapsed);
  } else {
    const remain = curGoal(cur()) - elapsed;
    if (remain <= 0) { finishCountdown(); return; }
    timeDisp.textContent = fmt(remain);
    handleBeats(elapsed);
  }
  state.rafId = requestAnimationFrame(tick);
}

// ---- flow ----
function start() {
  const ex = cur();
  if (isComplete(ex)) { advance(); return; }
  ensureAudio();
  acquireWakeLock();
  state.running = true;
  state.lastBeatIndex = -1;
  howto.classList.remove("open");     // 計測中は数字だけにする
  helpBtn.classList.remove("open");
  timeDisp.classList.remove("tiny");
  extraSetBtn.classList.add("hide");
  if (ex.warmup) {
    state.mode = "warmup";
    state.startTime = performance.now();
    state.lastWuStep = -1;
    timeDisp.className = "time count-down";
    phaseDisp.textContent = "";
    mainBtn.textContent = "中断";
  } else if (state.prep > 0) {
    state.mode = "prep";
    state.startTime = performance.now();
    state.lastPrepSec = -1;
    timeDisp.className = "time prep";
    timeDisp.textContent = String(state.prep);
    phaseDisp.textContent = "構えて";
    subDisp.textContent = "";
    mainBtn.textContent = "キャンセル";
  } else {
    startWork();
  }
  mainBtn.classList.add("running");
  state.rafId = requestAnimationFrame(tick);
}

function startWork() {
  const ex = cur();
  state.mode = ex.setNo === 1 ? "up" : "down";
  state.startTime = performance.now();
  state.lastBeatIndex = -1;
  timeDisp.className = state.mode === "down" ? "time count-down" : "time";
  mainBtn.textContent = "終了";
  beepDown();
}

function halt() {
  state.running = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  releaseWakeLock();
}

function cancel() {
  halt();
  stopSilentLoop();
  renderIdle();
}

function finishWarmup() {
  halt();
  alarm();
  setTimeout(stopSilentLoop, 1500);
  cur().done = true;
  advance();
}

function stop() {
  halt();
  stopSilentLoop();
  const ex = cur();
  const seconds = Math.round(state.elapsed);
  const side = ex.side;
  const sideJa = ex.uni ? SIDE_JA[side] : "";
  let msg;
  if (state.mode === "up") {
    const key = ex.uni ? side : "L";
    ex.base[key] = seconds;
    ex.goal[key] = goalFromBase(seconds);
    ex.sets.push({ no: ex.setNo, seconds, side });
    const prev = lastTimeSeconds(ex.name, side);
    const diff = prev ? seconds - prev.sec : null;
    const cmp = diff == null ? ""
      : diff > 0 ? `前回より <b>+${diff}秒</b> 🔥<br>` : diff < 0 ? `前回より ${diff}秒<br>` : "前回と同じ<br>";
    msg = `${cmp}<b>${seconds}秒</b> ＝ 約${toReps(seconds)}回`;
  } else {
    ex.sets.push({ no: ex.setNo, seconds, side });
    msg = `${sideJa}${seconds}秒で終了`;
  }
  recordSet(ctx(), ex.name, ex.slot, ex.setNo, seconds, side);
  Object.assign(ex, nextPos(ex));
  renderIdle();
  timeDisp.textContent = String(seconds);
  timeDisp.className = "time done";
  subDisp.innerHTML = msg;
}

function finishCountdown() {
  halt();
  alarm();
  setTimeout(stopSilentLoop, 1500);
  const ex = cur();
  const done = curGoal(ex);
  ex.sets.push({ no: ex.setNo, seconds: done, side: ex.side });
  recordSet(ctx(), ex.name, ex.slot, ex.setNo, done, ex.side);
  Object.assign(ex, nextPos(ex));
  renderIdle();
  timeDisp.textContent = "0";
  timeDisp.className = "time done";
  subDisp.innerHTML = `<b>${done}秒</b> 完了。ここで止めるのが正解`;
}

function goto(i, dir = 0) {
  if (state.running) cancel();
  const next = Math.max(0, Math.min(i, state.exercises.length - 1));
  if (next === state.exIndex && dir) return false;
  state.exIndex = next;
  howto.classList.remove("open");
  helpBtn.classList.remove("open");
  autoTempo();
  renderIdle();
  if (dir) {
    stage.classList.remove("enter-l", "enter-r");
    void stage.offsetWidth;               // アニメーションを確実に再生させる
    stage.classList.add(dir > 0 ? "enter-l" : "enter-r");
  }
  return true;
}
function advance() {
  if (state.exIndex < state.exercises.length - 1) goto(state.exIndex + 1, 1);
  else {
    renderIdle();
    subDisp.innerHTML = "今日はここまで。<b>おつかれさまでした 🔥</b>";
  }
}

// ---- 書き出し ----
function flash(msg, ok = true) {
  exportMsg.textContent = msg;
  exportMsg.style.color = ok ? "var(--green)" : "var(--ember)";
  setTimeout(() => { exportMsg.textContent = ""; }, 4000);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

async function exportCsv() {
  const csv = buildCsv(loadLog());
  if (!csv) { flash("まだ書き出す記録がありません", false); return; }
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const file = new File([blob], `torobi-${todayKey()}.csv`, { type: "text/csv" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "TOROBI 記録" }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  flash("CSVを書き出しました");
}

function renderRecord() {
  const e = loadLog()[todayKey()];
  const sets = (e && e.sets) || [];
  if (sets.length === 0) {
    recToday.innerHTML = `<div class="rec-day">今日</div><div class="empty">まだ記録がありません</div>`;
    return;
  }
  const order = [];
  sets.forEach(s => { if (!order.includes(s.ex)) order.push(s.ex); });
  const rows = order.map(name => {
    const mine = sets.filter(s => s.ex === name).sort((a, b) => a.no - b.no || (a.side || "").localeCompare(b.side || ""));
    return mine.map(s => `<div class="rec-row">
      <span class="n">${name}${s.side ? " " + SIDE_JA[s.side] : ""}　セット${s.no}</span>
      <span class="s">${s.sec}秒</span>
      <span class="r">${s.no === 1 ? "基準値" : ""}</span>
    </div>`).join("");
  }).join("");
  recToday.innerHTML = `<div class="rec-day">${todayKey()}</div>${rows}`;
}

// ---- sheets ----
function openSheet(el) {
  if (el === recordSheet) renderRecord();
  sheetBg.classList.add("open");
  el.classList.add("open");
}
function closeSheets() {
  sheetBg.classList.remove("open");
  settingsSheet.classList.remove("open");
  recordSheet.classList.remove("open");
}

// ---- events ----
mainBtn.addEventListener("click", () => {
  if (!state.running) { start(); return; }
  (state.mode === "prep" || state.mode === "warmup") ? cancel() : stop();
});

extraSetBtn.addEventListener("click", () => {
  const ex = cur();
  ex.target += 1;          // その日だけ1セット増やす
  renderIdle();
});

dots.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  const i = Number(b.dataset.i);
  goto(i, i === state.exIndex ? 0 : (i > state.exIndex ? 1 : -1));
});

// 左右スワイプで種目を移動（計測中とシート表示中は無効）
(() => {
  let x0 = null, y0 = null, dragging = false;
  const target = document.querySelector(".app");
  const active = () => !state.running && !sheetBg.classList.contains("open");
  target.addEventListener("touchstart", e => {
    if (!active() || e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    dragging = false;
  }, { passive: true });
  target.addEventListener("touchmove", e => {
    if (x0 == null) return;
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      dragging = true;
      stage.classList.add("dragging");
    }
    if (dragging) stage.style.transform = `translateX(${dx * 0.4}px)`;
  }, { passive: true });
  target.addEventListener("touchend", e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    stage.classList.remove("dragging");
    stage.style.transform = "";
    x0 = null;
    if (!dragging) return;
    dragging = false;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      const dir = dx < 0 ? 1 : -1;
      goto(state.exIndex + dir, dir);
    }
  });
})();

helpBtn.addEventListener("click", () => {
  howto.classList.toggle("open");
  helpBtn.classList.toggle("open");
});

$("openSettings").addEventListener("click", () => openSheet(settingsSheet));
$("openRecord").addEventListener("click", () => openSheet(recordSheet));
sheetBg.addEventListener("click", closeSheets);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheets(); });

// 下方向スワイプで閉じる（一番上までスクロールしているときだけ）
[settingsSheet, recordSheet].forEach(sheet => {
  sheet.querySelector(".grab").addEventListener("click", closeSheets);
  let y0 = null;
  sheet.addEventListener("touchstart", e => {
    y0 = sheet.scrollTop <= 0 ? e.touches[0].clientY : null;
  }, { passive: true });
  sheet.addEventListener("touchmove", e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener("touchend", e => {
    if (y0 == null) return;
    const dy = (e.changedTouches[0].clientY - y0);
    sheet.style.transform = "";
    if (dy > 70) closeSheets();
    y0 = null;
  });
});

$("weekMinus").addEventListener("click", () => changeWeek(-1));
$("weekPlus").addEventListener("click", () => changeWeek(1));
function changeWeek(d) {
  const w = Math.min(12, Math.max(1, state.week + d));
  if (w === state.week) return;
  if (state.running) cancel();
  state.week = w;
  saveWeek(w);
  renderWeek();
  buildExercises();
  autoTempo();
  renderIdle();
}
function renderWeek() {
  weekDisp.innerHTML = `第${state.week}週 <small>／ ${phaseLabel(state.week)}</small>`;
}

daySeg.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b || b.dataset.day === state.day) return;
  if (state.running) cancel();
  state.day = b.dataset.day;
  daySeg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x.dataset.day === state.day));
  buildExercises();
  autoTempo();
  renderIdle();
});

prepSeg.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  state.prep = Number(b.dataset.prep);
  prepSeg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
});

soundSeg.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  const on = b.dataset.sound === "on";
  setSoundEnabled(on);
  soundSeg.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
  if (on) {
    ensureAudio();
    beepUp();
    if (!state.running) setTimeout(stopSilentLoop, 500);
  }
});

// ---- 体組成（手入力とスキャン結果の受け皿）----
function renderBodyInputs() {
  const saved = loadTodayBody();
  bodyGrid.innerHTML = BODY_ORDER.map(key => {
    const m = METRICS.find(x => x.key === key);
    const v = saved[key] ?? "";
    return `<label><span>${m.label}${m.unit ? " " + m.unit : ""}</span>
      <input type="number" inputmode="decimal" step="${m.decimals ? "0.1" : "1"}"
        data-key="${m.key}" value="${v}"></label>`;
  }).join("");
}

function persistBody() {
  const body = {};
  bodyGrid.querySelectorAll("input").forEach(el => { body[el.dataset.key] = el.value; });
  saveBody(ctx(), body);
}

/** 読み取り結果を入力欄に流し込む。確認と修正は入力欄そのものでできる。 */
function applyScanResults(results) {
  bodyGrid.querySelectorAll("input").forEach(el => {
    const v = results[el.dataset.key];
    if (v != null && v !== "") el.value = v;
  });
  persistBody();
}

bodyGrid.addEventListener("change", persistBody);

// シートは1枚ずつ。読み取り中は記録シートを隠し、閉じたら戻す。
const scanSheet = createScanSheet({
  onDone: results => {
    applyScanResults(results);
    flash(`${Object.keys(results).length}項目を読み取りました。数字を確認してください`);
  },
  onClose: () => {
    recordSheet.classList.add("open");
    renderRecord();
  },
});
$("scanBtn").addEventListener("click", () => {
  recordSheet.classList.remove("open");
  scanSheet.open();
});

$("copyBtn").addEventListener("click", async () => {
  const text = buildTodayText(loadLog());
  if (!text) { flash("今日の記録がまだありません", false); return; }
  const ok = await copyText(text);
  flash(ok ? "今日の記録をコピーしました" : "コピーできませんでした", ok);
});
$("csvBtn").addEventListener("click", exportCsv);

$("resetExBtn").addEventListener("click", () => {
  const ex = cur();
  if (state.running) cancel();
  if (ex.warmup) ex.done = false;
  else {
    clearRecordedExercise(ctx(), ex.name);
    ex.sets = [];
    ex.base = { L: null, R: null };
    ex.goal = { L: null, R: null };
    ex.setNo = 1;
    ex.side = ex.uni ? "L" : null;
  }
  renderRecord();
  renderIdle();
  closeSheets();
});

// ---- init ----
reacquireWakeLockOnVisible(() => state.running);
daySeg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.day === state.day));
saveWeek(state.week);
renderWeek();
buildExercises();
autoTempo();
renderIdle();
renderBodyInputs();
