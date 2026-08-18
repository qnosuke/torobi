import { describe, it, expect } from 'vitest';
import { pickReading } from '../src/scan/pickReading.js';

describe('枠の中と全体、どちらの読み取りを採るか', () => {
  it('片方しか読めなければそれを使う', () => {
    expect(pickReading('62.7', null)).toBe('62.7');
    expect(pickReading(null, '62.7')).toBe('62.7');
    expect(pickReading(null, null)).toBeNull();
  });

  it('一致すればそのまま', () => {
    expect(pickReading('1538', '1538')).toBe('1538');
  });

  it('枠で先頭の桁が欠けたときは全体を採る', () => {
    // 1538 が枠からはみ出して 538 になった
    expect(pickReading('538', '1538')).toBe('1538');
    expect(pickReading('4.2', '64.2')).toBe('64.2');
  });

  it('枠で桁が増えたときも全体を採る', () => {
    // 端に残った部分が1桁に化ける（切り出しをやめる原因になった誤読）
    expect(pickReading('15388', '1538')).toBe('1538');
  });

  it('端の欠けではない食い違いは、画素の多い枠の中を採る', () => {
    // 全体側が背景を拾って別物を読んだ場合
    expect(pickReading('1538', '1638')).toBe('1538');
    expect(pickReading('20.8', '28.8')).toBe('20.8');
    expect(pickReading('36.2', '362')).toBe('36.2');
  });

  it('2桁以上ずれているものは端の欠けとみなさない', () => {
    expect(pickReading('38', '1538')).toBe('38');
  });

  it('「1」はどちらから来ても使わない', () => {
    // ユーザー番号画面や細長い影の誤読。全体が「1」でも枠の値を消させない
    expect(pickReading('1538', '1')).toBe('1538');
    expect(pickReading('1', '1538')).toBe('1538');
    expect(pickReading('1', null)).toBeNull();
    expect(pickReading('1', '1')).toBeNull();
  });

  it('1桁の値どうしは端の欠け扱いにしない', () => {
    expect(pickReading('8', '48')).toBe('8');
  });
});
