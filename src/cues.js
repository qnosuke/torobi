// 合図の出し方。音が出せない場面では、画面と触覚で同じ合図を伝える。
//
// iOS Safari は Vibration API を持たないため、iPhoneでは「バイブだけ」は成立しない。
// そこで音を消したときは画面全体を光らせ、加えて触覚も最善努力で添える:
//   - Vibration API があれば使う（Android）
//   - iOS 17.4 以降のスイッチ入力はトグルすると触覚が返るので、それを借りる

import { beep, isSoundEnabled } from "./audio.js";

let flashEl = null;
let hapticLabel = null;

export function initCues() {
  flashEl = document.getElementById("cueFlash");
  try {
    // 触覚用の隠しスイッチ。効かない環境でも副作用はない。
    hapticLabel = document.createElement("label");
    hapticLabel.setAttribute("aria-hidden", "true");
    hapticLabel.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    hapticLabel.appendChild(input);
    document.body.appendChild(hapticLabel);
  } catch (e) { hapticLabel = null; }
}

function haptic(ms) {
  if (navigator.vibrate) { navigator.vibrate(ms); return; }
  try { hapticLabel?.click(); } catch (e) { /* 触覚が無い環境は視覚だけで伝える */ }
}

/** 画面を1回光らせる。strong は上げ始め・完了などの強い合図 */
function flash(strong, ms = 120) {
  if (!flashEl) return;
  flashEl.classList.toggle("strong", strong);
  flashEl.classList.add("on");
  setTimeout(() => flashEl.classList.remove("on"), ms);
}

/** 音が消えているときだけ、画面と触覚で補う */
function silentCue(strong, ms, buzz) {
  if (isSoundEnabled()) return;
  flash(strong, ms);
  haptic(buzz);
}

export const cueDown = () => { beep(440, 0.12, 0.5); silentCue(false, 130, 25); };
export const cueUp = () => { beep(880, 0.12, 0.5); silentCue(true, 130, 45); };
export const cuePrep = () => { beep(660, 0.1, 0.4); silentCue(false, 110, 20); };

/** ウォームアップの切り替え。音があるときも振動で知らせる */
export function cueStep() {
  beep(990, 0.2, 0.6);
  haptic(150);
  if (!isSoundEnabled()) flash(true, 260);
}

/** セット完了。止めどきなので一番強い合図にする */
export function cueAlarm() {
  [0, 0.18, 0.36, 0.54].forEach((d, i) => {
    setTimeout(() => beep(i === 3 ? 1320 : 990, 0.15, 0.6), d * 1000);
  });
  haptic([200, 100, 200, 100, 400]);
  if (!isSoundEnabled()) {
    [0, 260, 520, 800].forEach(d => setTimeout(() => flash(true, 200), d));
  }
}
