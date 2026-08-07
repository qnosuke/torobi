// やり方動画のプロンプト。
//
// 作り方の要:「下ろす動作だけ」を作らせて、後で逆再生を継ぎ足す。
//   - ループの継ぎ目が原理的に生まれない（最後のコマ＝最初のコマ）
//   - テンポはAIに頼まず、後処理で正確に2秒/2秒にする
//   - AIに求める動きが半分になるので、破綻しにくい
// つまりプロンプトは常に「ゆっくり下ろすところ」だけを書く。

/** 全種目で共通の見た目。ここを変えると全体の統一感が変わる */
export const STYLE = [
  "3D render of a featureless silver mannequin figure with smooth polished chrome-like surface",
  "no face, no clothing, no text, no logos",
  "plain flat very dark charcoal background (#16120e), seamless, no gym equipment, no props, no floor markings",
  "soft studio lighting from upper left, subtle rim light",
  "locked-off static camera, no pan, no zoom, no camera shake",
  "full body in frame with margin, centered",
  "single continuous slow motion, no cuts",
].join(", ");

/** 種目ごとの「下ろす動作」。camera は見せたい角度 */
export const EXERCISES = [
  { slug: "kneeling-pushup", name: "膝つき腕立て伏せ", camera: "side view, camera at floor level",
    motion: "in a kneeling push-up position with knees on the floor, body straight from head to knees, the figure slowly lowers its chest toward the floor, elbows tucked about 45 degrees from the torso, hips never sagging" },
  { slug: "pushup", name: "腕立て伏せ", camera: "side view, camera at floor level",
    motion: "in a push-up position on toes, body straight from head to heels, the figure slowly lowers its chest toward the floor, elbows about 45 degrees from the torso, hips never sagging" },
  { slug: "pushup-feet-up", name: "腕立て伏せ（足を椅子に）", camera: "side view, camera at floor level",
    motion: "in a push-up position with both feet resting on a plain low box, body straight, the figure slowly lowers its chest toward the floor, elbows about 45 degrees from the torso" },
  { slug: "one-hand-row", name: "ワンハンドロー", camera: "three-quarter rear view, camera at hip height",
    motion: "with one hand and one knee on a plain flat bench, back flat and horizontal, the figure slowly lowers a small dumbbell from beside its ribs down toward the floor with a straight arm" },
  { slug: "table-row", name: "テーブルロー", camera: "side view, camera at floor level",
    motion: "lying face up under a plain sturdy table, gripping the table edge, knees bent and feet flat, the figure slowly lowers its chest away from the table until the arms are straight, body kept in one line" },
  { slug: "table-row-extended", name: "テーブルロー（足伸ばし）", camera: "side view, camera at floor level",
    motion: "lying face up under a plain sturdy table with legs straight and heels on the floor, gripping the table edge, the figure slowly lowers its chest away from the table until the arms are straight, body kept in one rigid line" },
  { slug: "split-squat-bw", name: "自重スプリットスクワット", camera: "side view, camera at hip height",
    motion: "standing in a split stance with feet far apart front and back, hands at its sides, the figure slowly lowers its rear knee straight down toward the floor, torso upright, front knee staying above the ankle" },
  { slug: "split-squat", name: "スプリットスクワット", camera: "side view, camera at hip height",
    motion: "standing in a split stance holding a small dumbbell in each hand at its sides, the figure slowly lowers its rear knee straight down toward the floor, torso upright, front knee staying above the ankle" },
  { slug: "bulgarian-split-squat", name: "ブルガリアンスクワット", camera: "side view, camera at hip height",
    motion: "standing in a split stance with the top of the rear foot resting on a plain low box, holding a small dumbbell in each hand at its sides, the figure slowly lowers its rear knee straight down toward the floor, torso upright" },
  { slug: "hip-lift", name: "ヒップリフト", camera: "side view, camera at floor level",
    motion: "lying face up with knees bent and feet flat on the floor, hips raised so shoulders knees and hips form a straight line, the figure slowly lowers its hips back down toward the floor" },
  { slug: "rdl", name: "ルーマニアンデッドリフト", camera: "side view, camera at hip height",
    motion: "standing upright holding a small dumbbell in each hand in front of its thighs, knees slightly bent and fixed, the figure slowly hinges at the hips, letting the dumbbells travel down along the front of the legs to just below the knees, back perfectly flat throughout" },
  { slug: "single-leg-rdl", name: "片脚ルーマニアンデッドリフト", camera: "side view, camera at hip height",
    motion: "balancing on one leg holding a small dumbbell, the free leg extending straight back, the figure slowly hinges at the hip so the torso lowers toward horizontal and the dumbbell travels down along the standing leg, back perfectly flat" },
  { slug: "side-raise", name: "サイドレイズ", camera: "front view, camera at chest height",
    motion: "standing upright holding a small dumbbell in each hand out to the sides at exactly shoulder height, elbows slightly bent, the figure slowly lowers both arms down to its sides, shoulders staying down and relaxed, no swinging" },
  { slug: "rear-raise", name: "リアレイズ", camera: "three-quarter front view, camera at chest height",
    motion: "bent forward about 45 degrees holding a small dumbbell in each hand out and back at shoulder height, elbows slightly bent, the figure slowly lowers both arms down toward the floor, torso angle unchanged, no swinging" },
  { slug: "curl", name: "カール", camera: "side view, camera at chest height",
    motion: "standing upright with a small dumbbell curled up near its shoulder, upper arm pinned motionless against its side, the figure slowly lowers the forearm until the arm is straight, only the forearm moving, no swinging" },
  { slug: "kickback", name: "キックバック", camera: "side view, camera at chest height",
    motion: "bent forward with the upper arm pinned motionless against its side and the forearm extended straight back, the figure slowly bends the elbow to bring the dumbbell forward and down, the upper arm never moving" },
];

/** 1種目分のプロンプト文字列 */
export function buildPrompt(ex) {
  return `${STYLE}, ${ex.camera}. The subject: ${ex.motion}. `
    + "The movement is smooth, slow and controlled from start to finish, ending in the bottom position. "
    + "Nothing else moves in the scene.";
}
