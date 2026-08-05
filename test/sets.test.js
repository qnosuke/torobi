import { describe, it, expect } from 'vitest';
import { goalFromBase, nextPos, doneSets, isComplete, firstUndone } from '../src/sets.js';

const bilateral = (sets = []) => ({ sets, target: 3 });
const unilateral = (sets = []) => ({ uni: true, sets, target: 2 });
const set = (no, seconds, side = null) => ({ no, seconds, side });

describe('8割の目標', () => {
  it('1セット目の8割を四捨五入する', () => {
    expect(goalFromBase(60)).toBe(48);
    expect(goalFromBase(44)).toBe(35);
    expect(goalFromBase(41)).toBe(33);
  });

  it('どんなに短くても1秒は残す', () => {
    expect(goalFromBase(1)).toBe(1);
  });
});

describe('次にやるセット', () => {
  it('両側種目は番号が進むだけ', () => {
    expect(nextPos(bilateral([]))).toEqual({ setNo: 1, side: null });
    expect(nextPos(bilateral([set(1, 40)]))).toEqual({ setNo: 2, side: null });
  });

  it('片側種目は左→右→次のセットの左', () => {
    expect(nextPos(unilateral([]))).toEqual({ setNo: 1, side: 'L' });
    expect(nextPos(unilateral([set(1, 44, 'L')]))).toEqual({ setNo: 1, side: 'R' });
    expect(nextPos(unilateral([set(1, 44, 'L'), set(1, 41, 'R')]))).toEqual({ setNo: 2, side: 'L' });
  });

  it('右だけ記録されていれば左を埋めにいく', () => {
    expect(nextPos(unilateral([set(1, 41, 'R')]))).toEqual({ setNo: 1, side: 'L' });
  });
});

describe('完了の数え方', () => {
  it('両側種目は記録1件が1セット', () => {
    expect(doneSets(bilateral([set(1, 40), set(2, 32)]))).toBe(2);
  });

  it('片側種目は左右そろって1セット', () => {
    expect(doneSets(unilateral([set(1, 44, 'L')]))).toBe(0);
    expect(doneSets(unilateral([set(1, 44, 'L'), set(1, 41, 'R')]))).toBe(1);
  });

  it('規定セット数に達したら完了', () => {
    expect(isComplete(bilateral([set(1, 40), set(2, 32)]))).toBe(false);
    expect(isComplete(bilateral([set(1, 40), set(2, 32), set(3, 32)]))).toBe(true);
    expect(isComplete(unilateral([
      set(1, 44, 'L'), set(1, 41, 'R'), set(2, 35, 'L'), set(2, 33, 'R'),
    ]))).toBe(true);
  });

  it('ウォームアップは done フラグで判断する', () => {
    expect(isComplete({ warmup: true, done: false })).toBe(false);
    expect(isComplete({ warmup: true, done: true })).toBe(true);
  });
});

describe('開いたとき最初に出す種目', () => {
  const warmup = done => ({ warmup: true, done });

  it('まだ何もしていなければウォームアップから', () => {
    expect(firstUndone([warmup(false), bilateral([]), bilateral([])])).toBe(0);
  });

  it('始めていればウォームアップは飛ばして未完了の種目から', () => {
    const list = [warmup(false), bilateral([set(1, 40), set(2, 32), set(3, 32)]), bilateral([])];
    expect(firstUndone(list)).toBe(2);
  });

  it('全部終わっていれば最後の種目を出す', () => {
    const done = bilateral([set(1, 40), set(2, 32), set(3, 32)]);
    expect(firstUndone([warmup(true), done, done])).toBe(2);
  });
});
