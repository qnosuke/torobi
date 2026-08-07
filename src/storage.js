// localStorage への保存と読み出し。DOM には触らない。

// ---- 週 ----
const WEEK_KEY = "torobi.week";

const mondayOf = d => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - (x.getDay() + 6) % 7);
  return x;
};

export function loadWeek() {
  try {
    const s = JSON.parse(localStorage.getItem(WEEK_KEY));
    if (s && s.week && s.anchor) {
      const diff = Math.round((mondayOf(new Date()) - new Date(s.anchor)) / 604800000);
      return Math.min(12, Math.max(1, s.week + diff));
    }
  } catch (e) { /* 壊れた保存値は無視 */ }
  return 1;
}

export function saveWeek(w) {
  try {
    localStorage.setItem(WEEK_KEY, JSON.stringify({ week: w, anchor: mondayOf(new Date()).toISOString() }));
  } catch (e) { /* プライベートブラウズ等では保存しない */ }
}

// ---- 記録 ----
// { "2026-08-03": { week, day, sets:[{ex,slot,no,sec,side}], body:{...} } }
const LOG_KEY = "torobi.log";

export const WDAY = ["日", "月", "火", "水", "木", "金", "土"];
export const SIDE_JA = { L: "左", R: "右" };

export const todayKey = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function loadLog() {
  let log;
  try { log = JSON.parse(localStorage.getItem(LOG_KEY)) || {}; }
  catch (e) { return {}; }
  for (const day of Object.values(log)) day.body = migrateBody(day.body);
  return log;
}

function saveLog(log) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); }
  catch (e) { /* 保存できない環境では黙って続行 */ }
}

// 旧形式 { w, f, m } を体組成計の項目キーに読み替える（保存済みの記録を読めるように）。
// 旧形式は数値で保存されていたので、値は文字列に揃える。
const LEGACY_BODY = { w: "weight", f: "bodyFat", m: "skeletalMuscle" };
export function migrateBody(body) {
  if (!body) return {};
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (v == null || v === "") continue;
    out[LEGACY_BODY[k] ?? k] = String(v);
  }
  return out;
}

function todayEntry(log, ctx) {
  const k = todayKey();
  if (!log[k]) log[k] = { week: ctx.week, day: ctx.day, sets: [], body: {} };
  log[k].week = ctx.week;
  log[k].day = ctx.day;
  return log[k];
}

/** 同じ種目・同じセット番号・同じ側は上書きする（やり直しに対応） */
export function recordSet(ctx, exName, slot, no, sec, side = null) {
  const log = loadLog();
  const e = todayEntry(log, ctx);
  const i = e.sets.findIndex(s => s.ex === exName && s.no === no && (s.side || null) === side);
  const row = { ex: exName, slot, no, sec, ...(side ? { side } : {}) };
  i >= 0 ? e.sets[i] = row : e.sets.push(row);
  saveLog(log);
}

export function clearRecordedExercise(ctx, exName) {
  const log = loadLog();
  const e = todayEntry(log, ctx);
  e.sets = e.sets.filter(s => s.ex !== exName);
  saveLog(log);
}

/** 体組成を保存する。値が空/未指定の項目は消す。 */
export function saveBody(ctx, body) {
  const log = loadLog();
  const e = todayEntry(log, ctx);
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (v != null && v !== "") out[k] = String(v);
  }
  e.body = out;
  saveLog(log);
}

export function loadTodayBody() {
  return (loadLog()[todayKey()] || {}).body || {};
}

/**
 * 書き出したCSVから記録を戻す。今ある日の記録は消さず、無い日だけ足す。
 * @returns {{added: number, kept: number}}
 */
export function mergeLog(days) {
  const log = loadLog();
  let added = 0, kept = 0;
  for (const [date, entry] of Object.entries(days)) {
    if (log[date]) { kept++; continue; }
    log[date] = entry;
    added++;
  }
  saveLog(log);
  return { added, kept };
}

/** 同じ種目・同じ側の直近（今日より前）の1セット目の秒数 */
export function lastTimeSeconds(exName, side = null) {
  const log = loadLog();
  const k = todayKey();
  const days = Object.keys(log).filter(d => d < k).sort().reverse();
  for (const d of days) {
    const hit = (log[d].sets || []).find(
      s => s.ex === exName && s.no === 1 && (s.side || null) === side);
    if (hit) return { sec: hit.sec, date: d };
  }
  return null;
}

function lastSessionDay() {
  const log = loadLog();
  const days = Object.keys(log).filter(d => (log[d].sets || []).length > 0).sort();
  if (days.length === 0) return null;
  const date = days[days.length - 1];
  return { date, day: log[date].day };
}

/** 初期選択は「前回やった方の逆」。記録がなければ曜日から（前半＝肩、後半＝腕） */
export function autoDay() {
  const last = lastSessionDay();
  if (last) return last.date === todayKey() ? last.day : (last.day === "mon" ? "thu" : "mon");
  const d = new Date().getDay();
  return (d >= 1 && d <= 3) ? "mon" : "thu";
}

// ---- 文字の大きさ ----
const TEXT_KEY = "torobi.textSize";
const SIZES = ["normal", "large"];

/** 保存済みの設定。まだ選んでいなければ null（初回の選択画面を出す合図） */
export function loadTextSize() {
  try {
    const v = localStorage.getItem(TEXT_KEY);
    return SIZES.includes(v) ? v : null;
  } catch (e) { return null; }
}

export function saveTextSize(size) {
  if (!SIZES.includes(size)) return;
  try { localStorage.setItem(TEXT_KEY, size); } catch (e) { /* 保存できなくても動く */ }
}
