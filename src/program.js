// トロビ 12週プログラムの内容（純データ）。UIからは独立させ、テストできるようにする。
// ---- menu data（トロビ 12週プログラム v0.2）----
const PHASES = [
  { from: 1, to: 2, label: "火をつける" },
  { from: 3, to: 6, label: "とろ火" },
  { from: 7, to: 10, label: "火加減を覚える" },
  { from: 11, to: 12, label: "自分で焚く" },
];
const phaseIndex = week => week <= 2 ? 0 : week <= 6 ? 1 : 2;
const phaseLabel = week => PHASES.find(p => week >= p.from && week <= p.to).label;

// sets は資料の「1回の構成」より（押す/引く=3、しゃがむ/股関節=左右2ずつ、単関節=2）
const SLOTS = [
  { slot: "押す", sets: 3, byPhase: [
    { name: "膝つき腕立て伏せ", weight: "自重",
      howto: "膝をつき、頭から膝まで一直線。胸が床から拳ひとつ分まで下ろす。肘は真横ではなく体から45度。腰を落とさない。" },
    { name: "腕立て伏せ", weight: "自重",
      howto: "頭から踵まで一直線。胸が床から拳ひとつ分まで。肘は体から45度。腰を落とさない。きつければ膝つきを続けてよい。" },
    { name: "腕立て伏せ（足を椅子に）", weight: "自重",
      howto: "足を椅子に乗せて行う。頭から踵まで一直線、胸は拳ひとつ分まで、肘は体から45度。腰を落とさない。" },
  ]},
  { slot: "引く", sets: 3, byPhase: [
    { name: "ワンハンドロー", weight: "2.3kg", uni: true,
      howto: "片手と片膝を椅子や台に置き、背中を真っ直ぐ。ダンベルを脇腹に向かって引き上げ、ゆっくり下ろす。" },
    { name: "テーブルロー", weight: "自重",
      howto: "丈夫な机の下に仰向けで潜り、縁を掴んで胸を天板に引き寄せる。体は一直線。膝を曲げると易しくなる。※机が動かない・体重に耐えることを必ず確認。不安ならワンハンドロー（5.4kg）を継続。" },
    { name: "テーブルロー（足伸ばし）", weight: "自重",
      howto: "テーブルローの足を伸ばし、体を水平に近づけて行う。体は一直線のまま胸を天板へ。※机の安定を必ず確認。" },
  ]},
  { slot: "しゃがむ", sets: 2, byPhase: [
    { name: "自重スプリットスクワット", weight: "自重", uni: true,
      howto: "足を前後に開き、後ろ膝を床に向けて真下に下ろす。上体は真っ直ぐ、前膝はつま先より前に出さない。" },
    { name: "スプリットスクワット", weight: "5.4kg×2", uni: true,
      howto: "両手にダンベルを持ち体側に垂らす。後ろ膝を床に向けて真下に下ろし、上体は真っ直ぐ。前膝はつま先より前に出さない。" },
    { name: "ブルガリアンスクワット", weight: "5.4kg×2", uni: true,
      howto: "後ろ足の甲を椅子に乗せ、両手にダンベル。後ろ膝を真下に下ろす。上体は真っ直ぐ、前膝はつま先より前に出さない。" },
  ]},
  { slot: "股関節", sets: 2, byPhase: [
    { name: "ヒップリフト", weight: "自重",
      howto: "仰向けで膝を立て、かかとで床を押してお尻を持ち上げる。肩から膝まで一直線になったらお尻を締め、ゆっくり下ろす。" },
    { name: "ルーマニアンデッドリフト", weight: "5.4kg×2",
      howto: "膝を軽く曲げたまま固定し、股関節から折る。ダンベルを脚に沿わせて膝下まで。太もも裏が伸びたら戻る。背中が丸まったら即中止。" },
    { name: "片脚ルーマニアンデッドリフト", weight: "5.4kg×1〜2", uni: true,
      howto: "片脚で立ち、膝を軽く曲げたまま股関節から折る。ダンベルを脚に沿わせて下ろし、背中は最後まで真っ直ぐ。丸まったら即中止。" },
  ]},
];
const ISO_EX = {
  mon: [
    { name: "サイドレイズ", weight: "2.3kg×2",
      howto: "直立して肘を軽く曲げ、腕を真横に開いて肩の高さで止める。それ以上は上げない。肩をすくめない（首に力が入ったらフォーム崩れ）。下ろすときも力を抜かない。" },
    { name: "リアレイズ", weight: "2.3kg×2",
      howto: "上体を45度前傾。肘を軽く曲げ、腕を後方・斜め上に開く。肩甲骨を寄せることより腕を開くことを意識。首をすくめない。" },
  ],
  thu: [
    { name: "カール", weight: "2.3kg×2",
      howto: "肘を体の横に固定して動かさない。ダンベルだけを上げ、上げきったところで一瞬締める。軽すぎると感じたら5.4kgに上げてよい（第3週以降）。" },
    { name: "キックバック", weight: "2.3kg×2",
      howto: "上体を前傾し、上腕を体側に固定。肘から先だけを後方に伸ばす。上腕が動いたら効いていない。" },
  ],
};
const WARMUP_STEPS = [
  { name: "その場足踏み", sec: 60 },
  { name: "肩回し 前後各10回", sec: 40 },
  { name: "自重スクワット ゆっくり10回", sec: 40 },
  { name: "股関節回し 各10回", sec: 40 },
];
const WARMUP_TOTAL = WARMUP_STEPS.reduce((a, s) => a + s.sec, 0);

/** 週と日（"mon"=肩の日 / "thu"=腕の日）から、その日の6種目を返す（純関数） */
export function buildProgram(week, day) {
  const p = phaseIndex(week);
  const main4 = SLOTS.map(s => ({ ...s.byPhase[p], slot: s.slot, target: s.sets }));
  const iso2 = ISO_EX[day].map(e => ({ ...e, slot: "単関節", target: 2, isolation: true }));
  return [...main4, ...iso2];
}

export { PHASES, phaseIndex, phaseLabel, SLOTS, ISO_EX, WARMUP_STEPS, WARMUP_TOTAL };
