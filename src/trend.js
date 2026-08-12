// 体重の推移からペースを判定する。純関数。
//
// 日々の体重は水分で±1kg動くので、生の値では判定しない。直近の測定に
// 直線を当てて傾き（kg/週）を出し、測定が足りないときは判定を保留する。

const DAY_MS = 86400000;

/** "YYYY-MM-DD" を通し日数に変換する（時差の影響を受けないよう UTC で扱う） */
export const dayNumber = iso => Math.round(Date.parse(iso + "T00:00:00Z") / DAY_MS);

export const isoOf = (d = new Date()) => {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 記録から体重の時系列を取り出す（日付順） */
export function weightSeries(log) {
  return Object.keys(log || {}).sort()
    .map(date => ({ date, kg: Number((log[date] && log[date].body || {}).weight) }))
    .filter(x => Number.isFinite(x.kg) && x.kg > 0);
}

/** 各項目の最新値。項目ごとに別々の日から拾う（欠けている日があるため）。 */
export function latestBody(log, keys) {
  const dates = Object.keys(log || {}).sort().reverse();
  const out = {};
  for (const key of keys) {
    for (const d of dates) {
      const v = Number((log[d] && log[d].body || {})[key]);
      if (Number.isFinite(v) && v > 0) { out[key] = v; out[`${key}Date`] = d; break; }
    }
  }
  return out;
}

/** 指数移動平均。表示用に日々のぶれをならす。 */
export function ema(series, alpha = 0.25) {
  let prev = null;
  return series.map(p => {
    prev = prev == null ? p.kg : alpha * p.kg + (1 - alpha) * prev;
    return { date: p.date, kg: prev };
  });
}

/** 直近 days 日ぶんを切り出す */
export function recent(series, days = 21, today = isoOf()) {
  const from = dayNumber(today) - days + 1;
  return series.filter(p => dayNumber(p.date) >= from && dayNumber(p.date) <= dayNumber(today));
}

/** 最小二乗法による傾き（kg/週）。2点未満や同日ばかりのときは null。 */
export function slopePerWeek(series) {
  const n = series.length;
  if (n < 2) return null;
  const x0 = dayNumber(series[0].date);
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of series) {
    const x = dayNumber(p.date) - x0;
    sx += x; sy += p.kg; sxx += x * x; sxy += x * p.kg;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  return ((n * sxy - sx * sy) / denom) * 7;
}

/** 判定に必要な最低条件 */
const MIN_POINTS = 4;
const MIN_SPAN_DAYS = 13;

/** 維持を選んでいるときに「動いていない」とみなす幅（kg/週） */
const KEEP_BAND = 0.25;

/**
 * ペースの判定。
 * @param {Array} series weightSeries() の戻り値
 * @param {number} targetKgPerWeek 落としたい量（正の数。0 なら維持）
 * @returns {{status:"none"|"hold"|"on"|"slow"|"fast"|"gain", text:string, adjustKcal:number, slope:number|null, needMore:number}}
 */
export function assessTrend(series, targetKgPerWeek, { days = 21, today = isoOf() } = {}) {
  const win = recent(series, days, today);
  const span = win.length >= 2 ? dayNumber(win[win.length - 1].date) - dayNumber(win[0].date) : 0;

  if (win.length === 0) {
    return { status: "none", text: "体重の記録がまだありません。朝の体重を入れると、ペースを見ます。", adjustKcal: 0, slope: null, needMore: MIN_POINTS };
  }
  if (win.length < MIN_POINTS || span < MIN_SPAN_DAYS) {
    const needMore = Math.max(0, MIN_POINTS - win.length);
    const text = needMore > 0
      ? `まだ判定できません。あと${needMore}回、体重を測ってください。`
      : "まだ判定できません。2週間ぶんたまると出ます。";
    return { status: "hold", text, adjustKcal: 0, slope: null, needMore };
  }

  const slope = slopePerWeek(win);
  if (slope == null) return { status: "hold", text: "まだ判定できません。", adjustKcal: 0, slope: null, needMore: 0 };

  const per = Math.abs(slope).toFixed(2);
  const dir = slope < 0 ? "減" : "増";
  const measured = `直近${span + 1}日は週 ${per}kg ${dir}。`;

  if (!(targetKgPerWeek > 0)) {
    if (Math.abs(slope) <= KEEP_BAND) return { status: "on", text: `${measured}維持できています。`, adjustKcal: 0, slope, needMore: 0 };
    return slope > 0
      ? { status: "gain", text: `${measured}増え続けるようなら食事を見直してください。`, adjustKcal: -100, slope, needMore: 0 }
      : { status: "fast", text: `${measured}維持のつもりで減っています。もう少し食べてください。`, adjustKcal: 150, slope, needMore: 0 };
  }

  const loss = -slope;
  const ratio = loss / targetKgPerWeek;

  if (ratio < 0.2) {
    return { status: loss < 0 ? "gain" : "slow", text: `${measured}目標は週 ${targetKgPerWeek.toFixed(2)}kg 減。ほとんど動いていません。1日150kcal 減らしてみてください。`, adjustKcal: -150, slope, needMore: 0 };
  }
  if (ratio < 0.6) {
    return { status: "slow", text: `${measured}目標は週 ${targetKgPerWeek.toFixed(2)}kg 減。少し遅いので、1日100kcal 減らしてみてください。`, adjustKcal: -100, slope, needMore: 0 };
  }
  if (ratio > 1.6) {
    return { status: "fast", text: `${measured}目標より速すぎます。筋肉が落ちるので、1日150kcal 増やしてください。`, adjustKcal: 150, slope, needMore: 0 };
  }
  return { status: "on", text: `${measured}ペース通りです。このまま。`, adjustKcal: 0, slope, needMore: 0 };
}
