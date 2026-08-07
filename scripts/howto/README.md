# やり方動画の作り方

MiniMax の動画APIで素材を作り、ffmpeg で仕上げる。16種目ぶん。

## 考え方: 「下ろす動作」だけを作らせて、逆再生を継ぎ足す

AI動画が苦手なのは **継ぎ目のないループ** と **正確なテンポ** の2つ。どちらもAIに要求しない。

1. AIには **下ろすところだけ** を作らせる（動きが半分になるので破綻しにくい）
2. その区間を後処理で **ちょうど2.0秒** に伸縮する（テンポが正確になる）
3. **逆再生を継ぎ足して4.0秒** にする

3のおかげで、最後のコマが最初のコマと必ず一致する。**継ぎ目は原理的に生まれない。**
しかも下ろす動作の逆再生は、そのまま「ゆっくり上げる動作」として正しい。
折り返しでコマが1つ重なるが、これは上下の一瞬の静止として自然に見える。

## 手順

### 1. 参照画像を用意する（1枚だけ）

16本で同じ人形に見せるため、**人形だけを切り抜いた1枚**を用意する。

- インフォグラフィックそのままは渡さない。**文字・矢印・ジムの背景・ダンベルラックが動画に混ざる**
- 背景は真っ黒に近い平坦な色（`#16120e`）に置き換える。見た目がアプリに馴染むうえ、平坦な背景は圧縮が効くので300KBに収まりやすい
- 公開URL、または `data:image/jpeg;base64,...` で渡す

### 2. 素材を作る

```sh
export MINIMAX_API_KEY=...
export REF_IMAGE='https://.../mannequin.jpg'     # 省略可
export MINIMAX_MODEL=MiniMax-Hailuo-2.3          # コンソールで有効なIDを指定
node scripts/howto/generate.mjs side-raise       # 1種目だけ
node scripts/howto/generate.mjs --all            # 16種目まとめて
```

`scripts/howto/raw/<slug>.mp4` に落ちる。

### 3. 仕上げる

素材を再生して、**下ろし始める秒**と**下ろしきるまでの長さ**を目で読む。

```sh
scripts/howto/finish.sh side-raise 1.2 2.4
```

`public/howto/<slug>.mp4` ができる。4秒・4:3・640×480・H.264 yuv420p・音声なし・300KB以下。
アプリは置いてある種目から順に動画を出すので、1本ずつ増やしていける。

### 4. 確かめる

`npm run dev` で開き、種目名の横の「?」を押す。実機でも一度見ておく。

## プロンプトを直す

`scripts/howto/prompts.mjs` に全部入っている。

- `STYLE` … 16本で共通の見た目。ここを変えると全体の印象が変わる
- `EXERCISES[].motion` … 種目ごとの「下ろす動作」。**上げる動作は書かない**
- `EXERCISES[].camera` … 角度。文字で伝わりにくい一点が見える向きを選んである
  （サイドレイズは正面＝肩の高さで止まるのが見える、カールは真横＝肘が動かないのが見える）

## うまくいかないとき

| 症状 | 手当て |
|---|---|
| 人形が種目ごとに違って見える | 参照画像を必ず渡す。`STYLE` の材質の記述を増やす |
| 背景に器具や文字が出る | 参照画像を切り抜き直す。`no gym equipment, no text` を前に出す |
| カメラが動く | `locked-off static camera` を先頭近くに。それでも動くなら生成し直す |
| 動きが速すぎ／遅すぎ | 素材はそのままでよい。`finish.sh` の長さ引数で調整する |
| 300KBに収まらない | 背景の平坦さが足りない。単色に近い素材で作り直す |
| iPhoneで再生できない | `yuv420p` になっているか確認（`finish.sh` は指定済み） |

## API仕様の出どころ

- 作成 `POST /v1/video_generation` → `task_id`
- 照会 `GET /v1/query/video_generation?task_id=` → `status`（Preparing→Queueing→Processing→Success/Fail）と `file_id`
- 取得 `GET /v1/files/retrieve?file_id=` → `download_url`（有効1時間）

モデルIDと `duration` / `resolution` の上限はモデルごとに違う。コンソールで有効な値を確認して
`MINIMAX_MODEL` などの環境変数で渡すこと。
