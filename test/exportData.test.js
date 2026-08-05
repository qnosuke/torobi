import { describe, it, expect } from 'vitest';
import { buildTodayText, buildCsv } from '../src/exportData.js';
import { migrateBody } from '../src/storage.js';

const log = {
  '2026-08-03': {
    week: 1, day: 'thu',
    sets: [
      { ex: '膝つき腕立て伏せ', slot: '押す', no: 1, sec: 42 },
      { ex: '膝つき腕立て伏せ', slot: '押す', no: 2, sec: 34 },
      { ex: 'ワンハンドロー', slot: '引く', no: 1, sec: 44, side: 'L' },
      { ex: 'ワンハンドロー', slot: '引く', no: 1, sec: 41, side: 'R' },
      { ex: 'カール', slot: '単関節', no: 1, sec: 33 },
    ],
    body: { weight: '61.8', bodyFat: '22.4', skeletalMuscle: '33.8', bmi: '21.9' },
  },
};

describe('今日の記録テキスト', () => {
  it('メソッドの記録形式で1セット目だけを書く', () => {
    expect(buildTodayText(log, '2026-08-03')).toBe(
      '2026-08-03（月）\n' +
      '膝つき腕立て伏せ 42 / ワンハンドロー 左44 右41\n' +
      'カール 33\n' +
      '体重 61.8 / 体脂肪 22.4 / 骨格筋 33.8'
    );
  });

  it('記録がない日は null', () => {
    expect(buildTodayText(log, '2026-08-04')).toBeNull();
    expect(buildTodayText({ '2026-08-04': { sets: [] } }, '2026-08-04')).toBeNull();
  });

  it('体組成が未入力なら体組成の行は出ない', () => {
    const noBody = { '2026-08-03': { ...log['2026-08-03'], body: {} } };
    expect(buildTodayText(noBody, '2026-08-03').split('\n')).toHaveLength(3);
  });
});

describe('CSV', () => {
  const rows = buildCsv(log).split('\r\n');

  it('見出しに体組成7項目が並ぶ', () => {
    expect(rows[0]).toBe(
      '日付,週,メニュー,種目,枠,セット,左右,秒数,回数換算,' +
      '体重,体脂肪率,内臓脂肪,骨格筋率,体年齢,基礎代謝,BMI'
    );
  });

  it('1行=1セットで、種目ごとにセット順に並ぶ', () => {
    expect(rows).toHaveLength(6); // 見出し + 5セット
    expect(rows[1]).toBe('2026-08-03,1,腕,膝つき腕立て伏せ,押す,1,,42,10,61.8,22.4,,33.8,,,21.9');
    expect(rows[2].startsWith('2026-08-03,1,腕,膝つき腕立て伏せ,押す,2,,34,8')).toBe(true);
    expect(rows[3]).toContain('ワンハンドロー,引く,1,左,44');
    expect(rows[4]).toContain('ワンハンドロー,引く,1,右,41');
  });

  it('記録がなければ null', () => {
    expect(buildCsv({})).toBeNull();
  });
});

describe('旧形式の体組成を読み替える', () => {
  it('w/f/m を体組成計の項目キーに移す', () => {
    expect(migrateBody({ w: 61.8, f: 22.4, m: 33.8 }))
      .toEqual({ weight: '61.8', bodyFat: '22.4', skeletalMuscle: '33.8' });
  });

  it('新形式はそのまま', () => {
    expect(migrateBody({ weight: '61.8', bmi: '21.9' }))
      .toEqual({ weight: '61.8', bmi: '21.9' });
  });

  it('空の値は落とす', () => {
    expect(migrateBody({ w: '', f: null, m: 33.8 })).toEqual({ skeletalMuscle: '33.8' });
    expect(migrateBody(undefined)).toEqual({});
  });
});
