import { describe, it, expect } from 'vitest';
import { buildProgram, phaseIndex, phaseLabel, WARMUP_TOTAL } from '../src/program.js';

const names = list => list.map(e => e.name);

describe('週から段階を決める', () => {
  it('第1〜2週は「火をつける」', () => {
    expect(phaseIndex(1)).toBe(0);
    expect(phaseIndex(2)).toBe(0);
    expect(phaseLabel(2)).toBe('火をつける');
  });

  it('第3〜6週は「とろ火」', () => {
    expect(phaseIndex(3)).toBe(1);
    expect(phaseIndex(6)).toBe(1);
  });

  it('第7週以降は同じ段階の種目を使う（第11〜12週は自分で選ぶ週）', () => {
    expect(phaseIndex(7)).toBe(2);
    expect(phaseIndex(12)).toBe(2);
    expect(phaseLabel(12)).toBe('自分で焚く');
  });
});

describe('その日の6種目', () => {
  it('共通4種目＋単関節2種目', () => {
    const list = buildProgram(1, 'mon');
    expect(list).toHaveLength(6);
    expect(list.slice(0, 4).map(e => e.slot)).toEqual(['押す', '引く', 'しゃがむ', '股関節']);
    expect(list.slice(4).every(e => e.slot === '単関節')).toBe(true);
  });

  it('肩の日と腕の日で違うのは単関節2種目だけ', () => {
    const mon = buildProgram(3, 'mon');
    const thu = buildProgram(3, 'thu');
    expect(names(mon).slice(0, 4)).toEqual(names(thu).slice(0, 4));
    expect(names(mon).slice(4)).toEqual(['サイドレイズ', 'リアレイズ']);
    expect(names(thu).slice(4)).toEqual(['カール', 'キックバック']);
  });

  it('週が進むと種目が入れ替わる', () => {
    expect(names(buildProgram(1, 'mon'))[0]).toBe('膝つき腕立て伏せ');
    expect(names(buildProgram(3, 'mon'))[0]).toBe('腕立て伏せ');
    expect(names(buildProgram(7, 'mon'))[0]).toBe('腕立て伏せ（足を椅子に）');
    expect(names(buildProgram(7, 'mon'))[2]).toBe('ブルガリアンスクワット');
  });

  it('片側種目が正しく印される', () => {
    const w1 = buildProgram(1, 'mon');
    expect(w1.filter(e => e.uni).map(e => e.name))
      .toEqual(['ワンハンドロー', '自重スプリットスクワット']);
    const w7 = buildProgram(7, 'mon');
    expect(w7.filter(e => e.uni).map(e => e.name))
      .toEqual(['ブルガリアンスクワット', '片脚ルーマニアンデッドリフト']);
    // テーブルローやヒップリフトは両側種目
    expect(w7.find(e => e.slot === '引く').uni).toBeUndefined();
  });

  it('セット数は資料の構成どおり（押す・引く3、しゃがむ・股関節2、単関節2）', () => {
    expect(buildProgram(3, 'thu').map(e => e.target)).toEqual([3, 3, 2, 2, 2, 2]);
  });

  it('全種目にやり方と重量がある', () => {
    for (const week of [1, 3, 7]) {
      for (const day of ['mon', 'thu']) {
        for (const e of buildProgram(week, day)) {
          expect(e.howto.length).toBeGreaterThan(10);
          expect(e.weight).toBeTruthy();
        }
      }
    }
  });
});

it('ウォームアップは3分', () => {
  expect(WARMUP_TOTAL).toBe(180);
});
