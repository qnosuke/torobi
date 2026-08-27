// 認識を別スレッドで走らせる。
//
// 1フレームあたり枠と全体で2回読むため、メインスレッドで処理すると
// タップを受け付ける隙間がほとんど残らない（実測でフレーム間隔が最大848ms、
// ✕ を押しても2秒以上反応しなかった）。重い部分をここに逃がす。

import { recognizeFrame } from "./sevenseg.js";
import { pickReading } from "./pickReading.js";

const read = img => (img ? recognizeFrame(img).text : null);

self.onmessage = e => {
  const { id, roi, full } = e.data;
  try {
    self.postMessage({ id, text: pickReading(read(roi), read(full)) });
  } catch (err) {
    // 1フレーム読めなくても次のフレームで取り返せる
    self.postMessage({ id, text: null });
  }
};
