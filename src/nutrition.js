// 体組成から1日の目標（カロリーとPFC）を出す。純関数。DOM・localStorage には触らない。
//
// 方針
//   - 体脂肪率があれば Katch-McArdle（除脂肪体重だけを使う式）。無ければ Mifflin-St Jeor。
//   - タンパク質は「体重×係数」ではなく「除脂肪体重×係数」で出す。体脂肪率が高い人ほど
//     体重比は過大になるため（120kg/42% で 192g になってしまう）。
//   - 減量ペースは体重比だけで決めず、体脂肪量による上限で必ず頭を打たせる。
//   - 安全ガードに1つでも block が立ったら、不足を作らず維持カロリーを返す。

/** 脂肪1kgあたりの熱量 */
const KCAL_PER_KG_FAT = 7700;

/** 体脂肪1kgが1日に供給できる熱量の目安（kcal）。これを超えて削ると筋肉から出る。 */
const FAT_MOBILIZATION = 31;

// 上の理論値は「これを超えると不足分が筋肉から出る」という限界なので、余裕を持たせて使う。
// 低くしすぎると誰にでも上限が効いてペースの選択が効かなくなるため、0.8 に置く。
// 体脂肪率が高い人は選んだペースがそのまま通り、絞れている人だけ自動的に遅くなる。
const MOBILIZATION_SAFETY = 0.8;

/** 1日の摂取量の下限。計算結果がどうなってもここを下回る提案はしない。 */
export const KCAL_FLOOR = { male: 1500, female: 1200 };

/** これ以上減らす段階ではない、と判断する体脂肪率 */
const BODY_FAT_FLOOR = { male: 8, female: 16 };

/** 減量目標を出さない BMI */
const BMI_FLOOR = 18.5;

/** 体重比のタンパク質を使うとき、この BMI を超えたら基準体重（BMI25相当）に置き換える */
const ADJUSTED_WEIGHT_BMI = 27;

export const ACTIVITY = [
  { key: "low", factor: 1.2, label: "ほとんど動かない" },
  { key: "light", factor: 1.375, label: "軽く動く" },
  { key: "medium", factor: 1.55, label: "よく歩く" },
  { key: "high", factor: 1.725, label: "立ち仕事" },
];

/** 減量ペース。体重に対する週あたりの割合で持つ（体格によって kg が変わる） */
export const PACE = [
  { key: "slow", pct: 0.004, label: "ゆっくり" },
  { key: "normal", pct: 0.006, label: "標準" },
  { key: "fast", pct: 0.009, label: "速め" },
  { key: "keep", pct: 0, label: "維持" },
];

const byKey = (list, key, fallback) => list.find(x => x.key === key) ?? fallback;
export const activityFactor = key => byKey(ACTIVITY, key, ACTIVITY[1]).factor;
export const pacePct = key => byKey(PACE, key, PACE[1]).pct;

const num = v => (typeof v === "number" ? v : Number(v));
const positive = v => { const n = num(v); return Number.isFinite(n) && n > 0 ? n : null; };

/** 生年から満年齢。誕生日は考慮しない（月日を訊かないため、最大1歳の誤差は許容する）。 */
export function ageFromBirthYear(birthYear, today = new Date()) {
  const y = positive(birthYear);
  if (y == null) return null;
  const age = today.getFullYear() - y;
  return age >= 0 && age < 130 ? age : null;
}

export function bmi(p) {
  const w = positive(p.weight), h = positive(p.height);
  if (w == null || h == null) return null;
  return w / (h / 100) ** 2;
}

/** 除脂肪体重。骨格筋率ではなく体脂肪率から出す（骨格筋量は除脂肪体重の一部でしかない）。 */
export function leanMass(p) {
  const w = positive(p.weight), f = positive(p.bodyFat);
  if (w == null || f == null || f >= 100) return null;
  return w * (1 - f / 100);
}

export function fatMass(p) {
  const w = positive(p.weight), f = positive(p.bodyFat);
  if (w == null || f == null || f >= 100) return null;
  return w * (f / 100);
}

/**
 * 基礎代謝。体脂肪率があるときは除脂肪体重だけを入力とする式を使う。
 * @returns {{value:number, source:"katch"|"mifflin"}|null}
 */
export function bmr(p) {
  const lbm = leanMass(p);
  if (lbm != null) return { value: 370 + 21.6 * lbm, source: "katch" };

  const w = positive(p.weight), h = positive(p.height), a = positive(p.age);
  if (w == null || h == null || a == null || !p.sex) return null;
  const base = 10 * w + 6.25 * h - 5 * a;
  return { value: p.sex === "male" ? base + 5 : base - 161, source: "mifflin" };
}

/** 体脂肪量から決まる1日の不足の上限（kcal）。体脂肪率が無いときは上限なし。 */
export function deficitCeiling(p) {
  const fm = fatMass(p);
  return fm == null ? Infinity : fm * FAT_MOBILIZATION * MOBILIZATION_SAFETY;
}

// ---- 安全ガード ----
// level: "block" = 減量目標そのものを出さない / "note" = 出すが理由を添える

const GUARD = {
  minor: {
    code: "minor", level: "block",
    text: "18歳未満のあいだは減量の目標を出しません。成長期に必要な量は大人と違います。維持の目安だけ表示します。",
  },
  pregnant: {
    code: "pregnant", level: "block",
    text: "妊娠中・授乳中は減量の目標を出しません。必要な量はかかりつけの医師に確認してください。",
  },
  underweight: {
    code: "underweight", level: "block",
    text: `BMIが${BMI_FLOOR}を下回っています。減らす段階ではないので、維持の目安を表示します。`,
  },
  lowBodyFat: {
    code: "lowBodyFat", level: "block",
    text: "体脂肪率がすでに低い範囲です。これ以上減らす段階ではないので、維持の目安を表示します。",
  },
  paceClamped: {
    code: "paceClamped", level: "note",
    text: "体脂肪の量から見て速すぎるため、ペースを落として計算しました。",
  },
  kcalFloor: {
    code: "kcalFloor", level: "note",
    text: "計算値が下限を下回ったので、下限のカロリーに揃えました。",
  },
  bmrFloor: {
    code: "bmrFloor", level: "note",
    text: "基礎代謝を下回らないところで止めました。",
  },
};

/** プロフィールに対する安全ガードの一覧。block が1つでもあれば減量目標は出さない。 */
export function checkGuards(p) {
  const out = [];
  const age = positive(p.age);
  if (age != null && age < 18) out.push(GUARD.minor);
  if (p.pregnant) out.push(GUARD.pregnant);

  const b = bmi(p);
  if (b != null && b < BMI_FLOOR) out.push(GUARD.underweight);

  const f = positive(p.bodyFat);
  const floor = BODY_FAT_FLOOR[p.sex];
  if (f != null && floor != null && f < floor) out.push(GUARD.lowBodyFat);

  return out;
}

export const isBlocked = guards => guards.some(g => g.level === "block");

/** 目標タンパク質(g)。除脂肪体重が分かるならそれを基準にする。 */
function proteinTarget(p) {
  const lbm = leanMass(p);
  if (lbm != null) return { g: lbm * 2.0, source: "lbm" };

  const w = positive(p.weight), h = positive(p.height);
  if (w == null) return null;
  // 高BMIでは体重比が過大になるので、BMI25相当の体重に置き換える
  const b = bmi(p);
  const ref = (b != null && b > ADJUSTED_WEIGHT_BMI && h != null) ? 25 * (h / 100) ** 2 : w;
  return { g: ref * 1.6, source: "weight" };
}

/** 手入力のタンパク質目標。極端な打ち間違いだけ弾く。 */
export function clampProteinOverride(grams, weight) {
  const g = positive(grams);
  if (g == null) return null;
  const w = positive(weight);
  const max = w == null ? 400 : Math.min(400, w * 4);
  return Math.round(Math.min(Math.max(g, 20), max));
}

const REQUIRED = [
  ["sex", "性別"],
  ["age", "年齢"],
  ["height", "身長"],
  ["weight", "体重"],
];

/**
 * 1日の目標を出す。
 * @param {object} p sex, age, height, weight, bodyFat?, activity, pace, pregnant?, proteinOverride?
 * @returns {{ok:false, missing:string[]} | {ok:true, ...}}
 */
export function computeTargets(p = {}) {
  const missing = REQUIRED.filter(([k]) => (k === "sex" ? !p.sex : positive(p[k]) == null))
    .map(([, label]) => label);
  if (missing.length) return { ok: false, missing };

  const guards = checkGuards(p);
  const blocked = isBlocked(guards);

  const b = bmr(p);
  if (!b) return { ok: false, missing: ["体重"] };
  const tdee = b.value * activityFactor(p.activity);

  // 望むペースと、体脂肪量から決まる上限の小さい方を採る
  const wantKcal = positive(p.weight) * pacePct(p.pace) * KCAL_PER_KG_FAT / 7;
  const ceiling = deficitCeiling(p);
  let deficit = blocked ? 0 : Math.min(wantKcal, ceiling);
  if (!blocked && wantKcal - deficit > 1) guards.push(GUARD.paceClamped);

  // 下限。ここを割る提案は出さない
  const floor = KCAL_FLOOR[p.sex] ?? KCAL_FLOOR.female;
  let kcal = tdee - deficit;
  if (kcal < floor) { kcal = floor; guards.push(GUARD.kcalFloor); }
  if (kcal < b.value) { kcal = b.value; guards.push(GUARD.bmrFloor); }
  // 下限を割らないよう、10kcal 単位への丸めは必ず切り上げる
  kcal = Math.ceil(kcal / 10) * 10;

  // 丸めのあとで、実際に適用された不足とペースを出し直す。
  // 10kcal 未満のずれは丸めの余りなので、不足としては数えない。
  deficit = Math.max(0, Math.round(tdee) - kcal);
  if (deficit < 10) deficit = 0;
  const paceKgPerWeek = deficit * 7 / KCAL_PER_KG_FAT;

  const pt = proteinTarget(p);
  const override = clampProteinOverride(p.proteinOverride, p.weight);
  const protein = override ?? Math.round(pt.g);
  const fat = Math.max(40, Math.round(kcal * 0.22 / 9));
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return {
    ok: true,
    guards,
    blocked,
    bmi: bmi(p),
    leanMass: leanMass(p),
    fatMass: fatMass(p),
    bmr: Math.round(b.value),
    bmrSource: b.source,
    tdee: Math.round(tdee),
    deficit,
    paceKgPerWeek,
    kcal,
    protein,
    proteinSource: override != null ? "manual" : pt.source,
    fat,
    carb,
  };
}
