#!/usr/bin/env node
// MiniMax の動画APIで、やり方動画の素材（下ろす動作）を作る。
//
//   MINIMAX_API_KEY=xxx node scripts/howto/generate.mjs side-raise
//   MINIMAX_API_KEY=xxx node scripts/howto/generate.mjs --all
//
// 素材は scripts/howto/raw/<slug>.mp4 に落ちる。
// そのあと finish.sh で 4秒ループ・4:3・300KB以下に仕上げる。
//
// 参照画像（同じ人形を使い回すため）:
//   REF_IMAGE=https://.../mannequin.jpg  … 公開URL、または data:image/jpeg;base64,... を渡す
//
// APIの流れ:
//   POST /v1/video_generation                → task_id
//   GET  /v1/query/video_generation?task_id= → status が Success になったら file_id
//   GET  /v1/files/retrieve?file_id=         → download_url（有効1時間）

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXERCISES, buildPrompt } from "./prompts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "raw");

const BASE = process.env.MINIMAX_BASE ?? "https://api.minimax.io";
const KEY = process.env.MINIMAX_API_KEY;
// モデルIDはコンソールで有効なものを指定する（例: MiniMax-H3 / MiniMax-Hailuo-2.3）
const MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-Hailuo-2.3";
const DURATION = Number(process.env.MINIMAX_DURATION ?? 6);
const RESOLUTION = process.env.MINIMAX_RESOLUTION ?? "768P";
const REF_IMAGE = process.env.REF_IMAGE ?? "";

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${path}: 応答がJSONではない: ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  // MiniMax は HTTP 200 でも base_resp.status_code にエラーを載せてくる
  const code = json?.base_resp?.status_code;
  if (code != null && code !== 0) {
    throw new Error(`${path}: ${code} ${json.base_resp.status_msg}`);
  }
  return json;
}

async function createTask(ex) {
  const body = {
    model: MODEL,
    prompt: buildPrompt(ex),
    duration: DURATION,
    resolution: RESOLUTION,
  };
  // 同じ人形で揃えたいので、参照画像があれば最初のコマとして渡す
  if (REF_IMAGE) body.first_frame_image = REF_IMAGE;
  const json = await api("/v1/video_generation", { method: "POST", body: JSON.stringify(body) });
  if (!json.task_id) throw new Error(`task_id が返らない: ${JSON.stringify(json).slice(0, 200)}`);
  return json.task_id;
}

async function waitForFile(taskId) {
  const deadline = Date.now() + 15 * 60 * 1000;
  let last = "";
  while (Date.now() < deadline) {
    const json = await api(`/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`);
    const status = json.status ?? json.data?.status;
    if (status !== last) { process.stdout.write(`  ${status}\n`); last = status; }
    if (status === "Success") {
      const fileId = json.file_id ?? json.data?.file_id;
      if (!fileId) throw new Error("Success だが file_id が無い");
      return fileId;
    }
    if (status === "Fail") throw new Error(`生成に失敗: ${JSON.stringify(json).slice(0, 200)}`);
    await sleep(10000);
  }
  throw new Error("15分待っても終わらなかった");
}

async function download(fileId, dest) {
  const json = await api(`/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`);
  const url = json.file?.download_url ?? json.download_url;
  if (!url) throw new Error(`download_url が無い: ${JSON.stringify(json).slice(0, 200)}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ダウンロード失敗 HTTP ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function one(ex) {
  console.log(`\n▶ ${ex.name} (${ex.slug})`);
  const taskId = await createTask(ex);
  console.log(`  task_id=${taskId}`);
  const fileId = await waitForFile(taskId);
  const dest = resolve(OUT_DIR, `${ex.slug}.mp4`);
  await download(fileId, dest);
  console.log(`  → ${dest}`);
}

async function main() {
  if (!KEY) {
    console.error("MINIMAX_API_KEY を設定してください");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const targets = args.includes("--all")
    ? EXERCISES
    : EXERCISES.filter(e => args.includes(e.slug));
  if (targets.length === 0) {
    console.error("使い方: node scripts/howto/generate.mjs <slug> [<slug>...] | --all");
    console.error("slug: " + EXERCISES.map(e => e.slug).join(", "));
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });
  for (const ex of targets) {
    try { await one(ex); }
    catch (e) { console.error(`  × ${ex.slug}: ${e.message}`); }
  }
  console.log("\n仕上げ: scripts/howto/finish.sh <slug> <開始秒> <長さ秒>");
}

main();
