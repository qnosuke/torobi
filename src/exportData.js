// 記録の書き出し（純関数）。log は storage.loadLog() の戻り値。

import { WDAY, SIDE_JA, todayKey } from "./storage.js";
import { METRICS } from "./scan/metrics.js";

/** メソッドの記録形式。1セット目の秒数と、体組成の主要3項目だけを書く。 */
export function buildTodayText(log, key = todayKey()) {
  const e = log[key];
  if (!e || (e.sets || []).length === 0) return null;
  const firsts = e.sets.filter(s => s.no === 1);
  const line = rows => {
    const order = [], byEx = {};
    rows.forEach(s => {
      if (!order.includes(s.ex)) { order.push(s.ex); byEx[s.ex] = []; }
      byEx[s.ex].push(s);
    });
    return order.map(name => {
      const rs = byEx[name];
      const val = rs[0].side
        ? ["L", "R"].map(sd => {
            const hit = rs.find(r => r.side === sd);
            return hit ? `${SIDE_JA[sd]}${hit.sec}` : null;
          }).filter(Boolean).join(" ")
        : String(rs[0].sec);
      return `${name} ${val}`;
    }).join(" / ");
  };
  const lines = [`${key}（${WDAY[new Date(key + "T00:00:00").getDay()]}）`];
  const main = firsts.filter(s => s.slot !== "単関節");
  const iso = firsts.filter(s => s.slot === "単関節");
  if (main.length) lines.push(line(main));
  if (iso.length) lines.push(line(iso));
  const b = e.body || {};
  const body = [
    b.weight != null ? `体重 ${b.weight}` : null,
    b.bodyFat != null ? `体脂肪 ${b.bodyFat}` : null,
    b.skeletalMuscle != null ? `骨格筋 ${b.skeletalMuscle}` : null,
  ].filter(Boolean);
  if (body.length) lines.push(body.join(" / "));
  return lines.join("\n");
}

/** 1行 = 1セット。体組成はその日の値を各行に付ける。 */
export function buildCsv(log) {
  const head = ["日付", "週", "メニュー", "種目", "枠", "セット", "左右", "秒数", "回数換算"];
  const rows = [[...head, ...METRICS.map(m => m.label)]];
  Object.keys(log).sort().forEach(date => {
    const e = log[date];
    const b = e.body || {};
    const body = METRICS.map(m => b[m.key] ?? "");
    const order = [];
    (e.sets || []).forEach(s => { if (!order.includes(s.ex)) order.push(s.ex); });
    (e.sets || []).slice().sort((a, c) =>
      order.indexOf(a.ex) - order.indexOf(c.ex) || a.no - c.no || (a.side || "").localeCompare(c.side || "")
    ).forEach(s => {
      rows.push([
        date, e.week, e.day === "mon" ? "肩" : "腕", s.ex, s.slot, s.no,
        s.side ? SIDE_JA[s.side] : "", s.sec, Math.floor(s.sec / 4), ...body,
      ]);
    });
  });
  if (rows.length === 1) return null;
  const esc = v => {
    const t = String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return rows.map(r => r.map(esc).join(",")).join("\r\n");
}
