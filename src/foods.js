// タンパク質を数えるためのボタンの初期値。
//
// 食品データベースは持たない。よく食べるものを十数個ボタンにしておけば、
// タップだけで1日の合計が出る。中身はユーザーが編集できる（設定で追加・削除）。
// g は「その1個ぶんのタンパク質量」で、目安として丸めた値。

export const DEFAULT_FOODS = [
  { n: "卵", g: 6 },
  { n: "納豆 1P", g: 8 },
  { n: "豆腐 半丁", g: 10 },
  { n: "牛乳 200ml", g: 7 },
  { n: "ヨーグルト", g: 4 },
  { n: "チーズ 1個", g: 4 },
  { n: "鶏むね 100g", g: 23 },
  { n: "鶏もも 100g", g: 17 },
  { n: "豚肉 100g", g: 19 },
  { n: "牛肉 100g", g: 18 },
  { n: "魚 1切れ", g: 20 },
  { n: "ツナ缶", g: 15 },
  { n: "さば缶", g: 21 },
  { n: "ちくわ 1本", g: 4 },
  { n: "ごはん 1杯", g: 4 },
  { n: "食パン 1枚", g: 6 },
  { n: "枝豆 100g", g: 12 },
  { n: "プロテイン 1杯", g: 20 },
];

export const MAX_FOODS = 30;

/** 合計タンパク質(g) */
export const proteinTotal = entries =>
  (entries || []).reduce((sum, e) => sum + (Number(e.g) || 0), 0);

/** 追加・編集された1件を検証する。名前は必須、量は 1〜100g。 */
export function normalizeFood(name, grams) {
  const n = String(name ?? "").trim().slice(0, 12);
  const g = Math.round(Number(grams));
  if (!n) return null;
  if (!Number.isFinite(g) || g < 1 || g > 100) return null;
  return { n, g };
}
