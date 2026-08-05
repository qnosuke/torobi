// セットの進み方（純関数）。片側種目は「左→右」で1セット。

/** 1セット目の秒数から、2セット目以降の目標（8割）を出す */
export const goalFromBase = sec => Math.max(1, Math.round(sec * 0.8));

/** 次にやるべきセット番号と側を、記録済みのセットから求める */
export function nextPos(ex) {
  if (!ex.uni) return { setNo: ex.sets.reduce((m, s) => Math.max(m, s.no), 0) + 1, side: null };
  const has = (no, side) => ex.sets.some(s => s.no === no && s.side === side);
  let no = 1;
  while (has(no, "L") && has(no, "R")) no++;
  return { setNo: no, side: has(no, "L") ? "R" : "L" };
}

/** 両側種目は1セット=1記録、片側種目は左右そろって1セット */
export function doneSets(ex) {
  if (ex.warmup) return ex.done ? 1 : 0;
  if (!ex.uni) return ex.sets.length;
  const nos = [...new Set(ex.sets.map(s => s.no))];
  return nos.filter(n => ex.sets.some(s => s.no === n && s.side === "L")
                      && ex.sets.some(s => s.no === n && s.side === "R")).length;
}

export const isComplete = ex => ex.warmup ? ex.done : doneSets(ex) >= ex.target;

/** 開いたとき最初に出す種目。すでに始めていれば、ウォームアップは飛ばして続きから */
export function firstUndone(exercises) {
  const started = exercises.some(e => !e.warmup && e.sets.length > 0);
  const from = started ? 1 : 0;
  const i = exercises.findIndex((e, idx) => idx >= from && !isComplete(e));
  return i < 0 ? exercises.length - 1 : i;
}
