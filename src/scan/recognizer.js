// 認識の呼び出し口。別スレッドが使えるならそちらへ、無理ならその場で処理する。
//
// 認識は1フレームで2回走り、1回あたり数百msかかる。メインスレッドで回すと
// タップを受け付ける隙間が残らず、読み取り中に ✕ が押せなくなる。

import { recognizeFrame } from "./sevenseg.js";
import { pickReading } from "./pickReading.js";

const readHere = img => (img ? recognizeFrame(img).text : null);
const here = (roi, full) => pickReading(readHere(roi), readHere(full));

/** 転送できる形（プレーンなオブジェクト）にして渡す */
const plain = img => (img ? { width: img.width, height: img.height, data: img.data } : null);

export function createRecognizer() {
  let worker = null;
  let unavailable = false;   // 起動に失敗した端末では二度と試さない
  let seq = 0;
  const waiting = new Map();

  // 読み取りシートを開いたときに初めて作る（使わない人のために立てない）
  function ensureWorker() {
    if (worker || unavailable) return worker;
    try {
      worker = new Worker(new URL("./recognizeWorker.js", import.meta.url), { type: "module" });
      worker.onmessage = e => {
        const resolve = waiting.get(e.data.id);
        if (resolve) { waiting.delete(e.data.id); resolve(e.data.text); }
      };
      worker.onerror = () => {
        // 待っている分はその場で読み直さず諦める（次のフレームで取り返せる）
        for (const resolve of waiting.values()) resolve(null);
        waiting.clear();
        worker = null;
        unavailable = true;
      };
    } catch (e) {
      unavailable = true;
      worker = null;
    }
    return worker;
  }

  return {
    /** @returns {Promise<string|null>} セッションに渡す読み取り結果 */
    recognize(roi, full) {
      const w = ensureWorker();
      if (!w) return Promise.resolve(here(roi, full));

      const id = ++seq;
      const payload = { id, roi: plain(roi), full: plain(full) };
      // 配列バッファごと渡す（毎フレーム新しく作られるのでコピー不要）
      const transfer = [payload.roi, payload.full].filter(Boolean).map(p => p.data.buffer);
      return new Promise(resolve => {
        waiting.set(id, resolve);
        try {
          w.postMessage(payload, transfer);
        } catch (e) {
          // 転送できない環境ではその場で読む
          waiting.delete(id);
          unavailable = true;
          worker = null;
          resolve(here(roi, full));
        }
      });
    },
  };
}
