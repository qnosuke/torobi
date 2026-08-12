import { describe, it, expect } from 'vitest';
import {
  leanMass, fatMass, bmi, bmr, deficitCeiling, checkGuards, isBlocked,
  computeTargets, clampProteinOverride, ageFromBirthYear, KCAL_FLOOR,
} from '../src/nutrition.js';

// 体脂肪率まで測れている人／体重しか分からない人
const withFat = { sex: 'female', age: 45, height: 165, weight: 62, bodyFat: 22.4, activity: 'medium', pace: 'normal' };
const weightOnly = { sex: 'male', age: 40, height: 172, weight: 70, activity: 'light', pace: 'normal' };

const codes = t => t.guards.map(g => g.code);

describe('体組成の分解', () => {
  it('除脂肪体重は体脂肪率から出す（骨格筋率ではない）', () => {
    expect(leanMass(withFat)).toBeCloseTo(48.1, 1);
    expect(fatMass(withFat)).toBeCloseTo(13.9, 1);
  });

  it('体脂肪率がなければ出せない', () => {
    expect(leanMass(weightOnly)).toBeNull();
    expect(fatMass(weightOnly)).toBeNull();
  });

  it('BMI', () => {
    expect(bmi(withFat)).toBeCloseTo(22.8, 1);
  });
});

describe('基礎代謝', () => {
  it('体脂肪率があれば除脂肪体重だけの式を使う', () => {
    const b = bmr(withFat);
    expect(b.source).toBe('katch');
    expect(b.value).toBeCloseTo(370 + 21.6 * 48.1, 0);
  });

  it('体脂肪率がなければ身長・体重・年齢の式に落とす', () => {
    const b = bmr(weightOnly);
    expect(b.source).toBe('mifflin');
    expect(b.value).toBeCloseTo(10 * 70 + 6.25 * 172 - 5 * 40 + 5, 0);
  });

  it('性別と年齢で結果が変わる', () => {
    const male = bmr(weightOnly).value;
    const female = bmr({ ...weightOnly, sex: 'female' }).value;
    expect(male - female).toBeCloseTo(166, 0);
  });

  it('材料が足りなければ null', () => {
    expect(bmr({ weight: 70 })).toBeNull();
  });
});

describe('不足の上限は体脂肪量で決まる', () => {
  it('体脂肪1kgあたり1日31kcalの8割', () => {
    expect(deficitCeiling(withFat)).toBeCloseTo(13.9 * 31 * 0.8, 0);
  });

  it('体脂肪率が分からなければ上限を掛けない', () => {
    expect(deficitCeiling(weightOnly)).toBe(Infinity);
  });

  it('脂肪が多い人ほど速く落としてよい', () => {
    const heavy = computeTargets({ ...withFat, weight: 95, bodyFat: 40, height: 165 });
    const lean = computeTargets(withFat);
    expect(heavy.paceKgPerWeek).toBeGreaterThan(lean.paceKgPerWeek);
  });

  it('脂肪に余裕がある人は選んだペースがそのまま通る', () => {
    const t = computeTargets({ ...withFat, weight: 90, bodyFat: 34, pace: 'normal' });
    expect(codes(t)).not.toContain('paceClamped');
    expect(t.paceKgPerWeek).toBeCloseTo(90 * 0.006, 2);
  });

  it('絞れている人は希望より遅いペースに落とされる', () => {
    const t = computeTargets({ ...withFat, bodyFat: 17, pace: 'fast' });
    expect(codes(t)).toContain('paceClamped');
    expect(t.deficit).toBeLessThan(62 * 0.009 * 7700 / 7);
  });
});

describe('安全ガード', () => {
  it('18歳未満には減量目標を出さない', () => {
    const t = computeTargets({ ...withFat, age: 17 });
    expect(codes(t)).toContain('minor');
    expect(t.blocked).toBe(true);
    expect(t.deficit).toBe(0);
  });

  it('妊娠中・授乳中には減量目標を出さない', () => {
    const t = computeTargets({ ...withFat, pregnant: true });
    expect(codes(t)).toContain('pregnant');
    expect(t.deficit).toBe(0);
  });

  it('BMIが18.5未満なら減量目標を出さない', () => {
    const t = computeTargets({ ...withFat, weight: 48 });
    expect(codes(t)).toContain('underweight');
    expect(t.deficit).toBe(0);
  });

  it('体脂肪率が下限を切っていれば減量目標を出さない', () => {
    expect(codes(computeTargets({ ...withFat, bodyFat: 14 }))).toContain('lowBodyFat');
    expect(codes(computeTargets({ ...weightOnly, bodyFat: 7 }))).toContain('lowBodyFat');
  });

  it('男女で体脂肪率の下限が違う', () => {
    expect(checkGuards({ sex: 'male', bodyFat: 14, weight: 70, height: 172, age: 40 })).toEqual([]);
    expect(isBlocked(checkGuards({ sex: 'female', bodyFat: 14, weight: 50, height: 165, age: 40 }))).toBe(true);
  });

  it('止めた場合も維持の目安は出す（何も出さないのではない）', () => {
    const t = computeTargets({ ...withFat, age: 16 });
    expect(t.ok).toBe(true);
    expect(t.kcal).toBeGreaterThan(0);
    expect(t.protein).toBeGreaterThan(0);
    expect(t.kcal).toBe(Math.ceil(t.tdee / 10) * 10);
  });

  it('カロリーの下限を割る提案は出さない', () => {
    const t = computeTargets({ sex: 'female', age: 30, height: 150, weight: 46.5, bodyFat: 30, activity: 'low', pace: 'fast' });
    expect(t.kcal).toBeGreaterThanOrEqual(Math.min(KCAL_FLOOR.female, t.bmr));
    expect(codes(t).some(c => c === 'kcalFloor' || c === 'bmrFloor' || c === 'underweight')).toBe(true);
  });

  it('基礎代謝を下回る提案は出さない', () => {
    const t = computeTargets({ sex: 'male', age: 30, height: 185, weight: 130, bodyFat: 45, activity: 'low', pace: 'fast' });
    expect(t.kcal).toBeGreaterThanOrEqual(t.bmr);
  });
});

describe('PFC', () => {
  it('材料が足りなければ何が足りないかを返す', () => {
    const t = computeTargets({ weight: 62 });
    expect(t.ok).toBe(false);
    expect(t.missing).toEqual(['性別', '年齢', '身長']);
  });

  it('体脂肪率があれば除脂肪体重ベースのタンパク質になる', () => {
    const t = computeTargets(withFat);
    expect(t.proteinSource).toBe('lbm');
    expect(t.protein).toBe(Math.round(48.1 * 2.0));
  });

  it('体脂肪率がなければ体重ベースに落ちる', () => {
    const t = computeTargets(weightOnly);
    expect(t.proteinSource).toBe('weight');
    expect(t.protein).toBe(Math.round(70 * 1.6));
  });

  it('高BMIでは体重比を使わず基準体重に置き換える（過大なタンパク質を出さない）', () => {
    const t = computeTargets({ sex: 'male', age: 40, height: 170, weight: 120, activity: 'light', pace: 'normal' });
    expect(t.protein).toBeLessThan(120 * 1.6);
    expect(t.protein).toBe(Math.round(25 * 1.7 ** 2 * 1.6));
  });

  it('脂質には下限があり、PFCの合計はカロリーに収まる', () => {
    for (const p of [withFat, weightOnly, { ...withFat, pace: 'keep' }]) {
      const t = computeTargets(p);
      expect(t.fat).toBeGreaterThanOrEqual(40);
      expect(t.carb).toBeGreaterThanOrEqual(0);
      expect(Math.abs(t.protein * 4 + t.fat * 9 + t.carb * 4 - t.kcal)).toBeLessThan(12);
    }
  });

  it('維持を選べば不足を作らない', () => {
    const t = computeTargets({ ...withFat, pace: 'keep' });
    expect(t.deficit).toBe(0);
    expect(t.paceKgPerWeek).toBe(0);
  });
});

describe('タンパク質の手入力', () => {
  it('自動計算より優先される', () => {
    const t = computeTargets({ ...withFat, proteinOverride: 110 });
    expect(t.protein).toBe(110);
    expect(t.proteinSource).toBe('manual');
  });

  it('打ち間違いの桁は弾く', () => {
    expect(clampProteinOverride(1100, 62)).toBe(248);
    expect(clampProteinOverride(2, 62)).toBe(20);
    expect(clampProteinOverride('', 62)).toBeNull();
    expect(clampProteinOverride(null, 62)).toBeNull();
  });
});

describe('生まれ年から年齢', () => {
  it('その年に何歳になるかで数える', () => {
    expect(ageFromBirthYear(1980, new Date('2026-08-12'))).toBe(46);
  });
  it('入っていなければ null', () => {
    expect(ageFromBirthYear(null)).toBeNull();
    expect(ageFromBirthYear('abc')).toBeNull();
  });
});
