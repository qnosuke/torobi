// 文字の大きさの保存。壊れた値や未選択を取り違えないこと。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadTextSize, saveTextSize } from '../src/storage.js';

describe('文字の大きさの保存', () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    });
  });

  it('まだ選んでいなければ null（初回の選択画面を出す合図）', () => {
    expect(loadTextSize()).toBeNull();
  });

  it('選んだ値を覚える', () => {
    saveTextSize('large');
    expect(loadTextSize()).toBe('large');
    saveTextSize('normal');
    expect(loadTextSize()).toBe('normal');
  });

  it('知らない値は保存しないし、読まない', () => {
    saveTextSize('huge');
    expect(loadTextSize()).toBeNull();
    localStorage.setItem('torobi.textSize', 'huge');
    expect(loadTextSize()).toBeNull();
  });

  it('保存できない環境でも落ちない', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    expect(() => saveTextSize('large')).not.toThrow();
    expect(loadTextSize()).toBeNull();
  });
});
