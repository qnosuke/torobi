// 書き出したCSVから記録を復元する（純関数。DOM・localStorageに触れない）。
// 検証は全か無か: 1行でも不正なら何も取り込まずに理由を返す。

import { METRICS } from "./scan/metrics.js";

export const HEADER = [
  "日付", "週", "メニュー", "種目", "枠", "セット", "左右", "秒数", "回数換算",
  ...METRICS.map(m => m.label),
  "タンパク質",
];

/** タンパク質はCSVでは1日の合計しか持たないので、戻すときは1件にまとめる */
const PROTEIN_LABEL = "まとめて";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIDE_FROM_JA = { "": null, "左": "L", "右": "R" };

/** 1行をセルに分ける（引用符つきセルに対応） */
export function splitRow(line) {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}

function isRealDate(text) {
  const [y, m, d] = text.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

const isInt = (t, min) => /^\d+$/.test(t) && Number(t) >= min;

/**
 * @returns {{ok:true, days:object, protein:object, rows:number}
 *          | {ok:false, error:{line:number, reason:string}}}
 *   days は storage の記録と同じ形 { "YYYY-MM-DD": { week, day, sets, body } }
 *   protein は { "YYYY-MM-DD": [{ n, g }] }
 */
export function parseCsvText(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  if (lines.length === 0) return { ok: false, error: { line: 1, reason: "ファイルが空です" } };
  if (splitRow(lines[0]).join(",") !== HEADER.join(",")) {
    return { ok: false, error: { line: 1, reason: "TOROBIが書き出したCSVではないようです（見出しが一致しません）" } };
  }

  const days = {};
  const protein = {};
  for (let i = 1; i < lines.length; i++) {
    const line = i + 1;
    const bad = reason => ({ ok: false, error: { line, reason } });
    const c = splitRow(lines[i]);
    if (c.length !== HEADER.length) return bad(`列数が${c.length}です（${HEADER.length}列必要）`);

    const [date, week, menu, ex, slot, no, sideJa, sec] = c;
    if (!DATE_RE.test(date) || !isRealDate(date)) return bad(`日付「${date}」が不正です`);

    // 種目が空の行は「その日の体重・タンパク質だけ」を表す（トレーニングしていない日）
    const bodyOnly = ex === "";
    if (bodyOnly) {
      if (week !== "" && (!isInt(week, 1) || Number(week) > 12)) return bad(`週「${week}」が不正です`);
      if (menu !== "" && menu !== "肩" && menu !== "腕") return bad(`メニュー「${menu}」が不正です`);
    } else {
      if (!isInt(week, 1) || Number(week) > 12) return bad(`週「${week}」が不正です`);
      if (menu !== "肩" && menu !== "腕") return bad(`メニュー「${menu}」が不正です`);
      if (!isInt(no, 1)) return bad(`セット「${no}」が不正です`);
      if (!(sideJa in SIDE_FROM_JA)) return bad(`左右「${sideJa}」が不正です`);
      if (!isInt(sec, 0)) return bad(`秒数「${sec}」が不正です`);
    }

    const body = {};
    METRICS.forEach((m, idx) => {
      const v = c[9 + idx];
      if (v !== "") body[m.key] = v;
    });
    for (const [key, v] of Object.entries(body)) {
      if (!/^\d+(\.\d+)?$/.test(v)) return bad(`${METRICS.find(m => m.key === key).label}「${v}」が数値ではありません`);
    }

    const pro = c[9 + METRICS.length];
    if (pro !== "") {
      if (!/^\d+(\.\d+)?$/.test(pro)) return bad(`タンパク質「${pro}」が数値ではありません`);
      protein[date] = [{ n: PROTEIN_LABEL, g: Number(pro) }];
    }

    const day = days[date] ?? (days[date] = {
      week: week === "" ? null : Number(week),
      day: menu === "" ? null : (menu === "肩" ? "mon" : "thu"),
      sets: [], body: {},
    });
    Object.assign(day.body, body);
    if (bodyOnly) continue;

    // 同じ日に体組成だけの行と種目の行が混ざっていても、週とメニューは種目の行を優先する
    day.week = Number(week);
    day.day = menu === "肩" ? "mon" : "thu";
    const side = SIDE_FROM_JA[sideJa];
    const row = { ex, slot, no: Number(no), sec: Number(sec), ...(side ? { side } : {}) };
    const dup = day.sets.findIndex(s => s.ex === ex && s.no === row.no && (s.side ?? null) === side);
    dup >= 0 ? day.sets[dup] = row : day.sets.push(row);
  }
  return { ok: true, days, protein, rows: lines.length - 1 };
}
