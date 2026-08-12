// 食事シート。数えるのはタンパク質だけ。カロリーは体重の推移で検算する。

import { ACTIVITY, PACE, computeTargets, ageFromBirthYear } from "./nutrition.js";
import { assessTrend, weightSeries, latestBody } from "./trend.js";
import { proteinTotal, normalizeFood, DEFAULT_FOODS, MAX_FOODS } from "./foods.js";
import {
  loadLog, loadProfile, saveProfile,
  loadProteinDay, addProtein, removeProteinAt,
  loadFoods, saveFoods,
} from "./storage.js";

const $ = id => document.getElementById(id);

/** 食品名はユーザーが打つのでそのまま innerHTML に入れない */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const SEX_LABEL = { male: "男性", female: "女性" };

export function createMealSheet() {
  const proteinNow = $("proteinNow"), proteinGoal = $("proteinGoal"), proteinBar = $("proteinBar");
  const foodGrid = $("foodGrid"), proteinItems = $("proteinItems");
  const freeG = $("freeG"), freeAdd = $("freeAdd");
  const targetGrid = $("targetGrid"), targetNote = $("targetNote"), paceText = $("paceText");
  const guardBox = $("guardBox");
  const sexSeg = $("sexSeg"), birthYear = $("birthYear"), height = $("height");
  const activitySeg = $("activitySeg"), paceSeg = $("paceSeg");
  const proteinOverride = $("proteinOverride"), pregnant = $("pregnant");
  const foodEdit = $("foodEdit"), newFoodName = $("newFoodName"), newFoodG = $("newFoodG");
  const foodAdd = $("foodAdd"), foodMsg = $("foodMsg"), foodReset = $("foodReset");

  // 選択肢は定数から作る（表示と計算がずれないように）
  activitySeg.innerHTML = ACTIVITY.map(a => `<button data-activity="${a.key}">${a.label}</button>`).join("");
  paceSeg.innerHTML = PACE.map(p => `<button data-pace="${p.key}">${p.label}</button>`).join("");

  /** 保存されたプロフィールと、記録から拾った最新の体組成を合わせる */
  function profileForCalc() {
    const p = loadProfile();
    const body = latestBody(loadLog(), ["weight", "bodyFat"]);
    return {
      sex: p.sex,
      age: ageFromBirthYear(p.birthYear),
      height: Number(p.height) || null,
      weight: body.weight ?? null,
      bodyFat: body.bodyFat ?? null,
      weightDate: body.weightDate ?? null,
      activity: p.activity,
      pace: p.pace,
      pregnant: !!p.pregnant,
      proteinOverride: p.proteinOverride,
    };
  }

  // ---- タンパク質 ----
  function renderProtein(goal) {
    const entries = loadProteinDay();
    const total = Math.round(proteinTotal(entries));
    const hit = goal != null && total >= goal;
    proteinNow.textContent = String(total);
    proteinNow.classList.toggle("hit", hit);
    proteinGoal.textContent = goal != null ? `/ ${goal} g` : "g";
    proteinBar.style.width = goal ? `${Math.min(100, total / goal * 100)}%` : "0%";
    proteinBar.classList.toggle("hit", hit);

    proteinItems.innerHTML = entries.length
      ? entries.map((e, i) => `<button data-i="${i}">${esc(e.n)} ${e.g}g ✕</button>`).join("")
      : `<span class="empty-note">食べたものを押すと足されます。押し間違えたら、下に出る印をもう一度押すと消えます。</span>`;
  }

  function renderFoodButtons() {
    const foods = loadFoods();
    foodGrid.innerHTML = foods.map((f, i) =>
      `<button data-food="${i}">${esc(f.n)}<small>${f.g}g</small></button>`).join("");
    foodEdit.innerHTML = foods.map((f, i) =>
      `<button data-del="${i}">${esc(f.n)} ${f.g}g ✕</button>`).join("");
  }

  // ---- 目標 ----
  function renderTargets(t) {
    if (!t.ok) {
      targetGrid.innerHTML = `<div style="grid-column:1/-1"><span class="k">${esc(t.missing.join("・"))}が分かると目安が出ます</span></div>`;
      targetNote.textContent = t.missing.includes("体重")
        ? "「記録」で朝の体重を入れると計算できます。"
        : "下の「体の情報」を入れてください。";
      return null;
    }
    const cell = (k, v, u) => `<div><span class="k">${k}</span><span class="v">${v}</span><span class="u">${u}</span></div>`;
    targetGrid.innerHTML =
      cell("カロリー", t.kcal, "kcal") +
      cell("P", t.protein, "g") +
      cell("F", t.fat, "g") +
      cell("C", t.carb, "g");

    const src = t.bmrSource === "katch" ? "除脂肪体重から" : "身長・体重・年齢から";
    const pace = t.deficit > 0
      ? `不足 ${t.deficit}kcal（週 ${t.paceKgPerWeek.toFixed(2)}kg 減のペース）`
      : "維持カロリーです（不足なし）";
    const pSrc = t.proteinSource === "manual" ? "手入力"
      : t.proteinSource === "lbm" ? `除脂肪体重 ${t.leanMass.toFixed(1)}kg × 2.0g` : "体重から";
    targetNote.innerHTML =
      `基礎代謝 ${t.bmr}kcal（${src}）／ 消費 ${t.tdee}kcal<br>${pace}<br>タンパク質は${esc(pSrc)}`;
    return t.protein;
  }

  function renderPace(t) {
    const target = t.ok && !t.blocked ? t.paceKgPerWeek : 0;
    const a = assessTrend(weightSeries(loadLog()), target);
    paceText.textContent = a.text;
  }

  function renderGuards(t) {
    const guards = t.ok ? t.guards : [];
    guardBox.hidden = guards.length === 0;
    guardBox.innerHTML = guards.map(g =>
      `<div class="guard ${g.level === "block" ? "block" : ""}">${esc(g.text)}</div>`).join("");
  }

  // ---- 体の情報 ----
  function renderProfile() {
    const p = loadProfile();
    sexSeg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.sex === p.sex));
    activitySeg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.activity === p.activity));
    paceSeg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.pace === p.pace));
    if (document.activeElement !== birthYear) birthYear.value = p.birthYear ?? "";
    if (document.activeElement !== height) height.value = p.height ?? "";
    if (document.activeElement !== proteinOverride) proteinOverride.value = p.proteinOverride ?? "";
    pregnant.checked = !!p.pregnant;
  }

  function render() {
    const t = computeTargets(profileForCalc());
    renderFoodButtons();
    renderProtein(renderTargets(t));
    renderPace(t);
    renderGuards(t);
    renderProfile();
  }

  // ---- 操作 ----
  foodGrid.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    const f = loadFoods()[Number(b.dataset.food)];
    if (f) { addProtein(f); render(); }
  });

  proteinItems.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    removeProteinAt(Number(b.dataset.i));
    render();
  });

  freeAdd.addEventListener("click", () => {
    const item = normalizeFood("その他", freeG.value);
    if (!item) return;
    addProtein(item);
    freeG.value = "";
    render();
  });

  sexSeg.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    saveProfile({ sex: b.dataset.sex });
    render();
  });
  activitySeg.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    saveProfile({ activity: b.dataset.activity });
    render();
  });
  paceSeg.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    saveProfile({ pace: b.dataset.pace });
    render();
  });

  const numOrNull = v => (v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  birthYear.addEventListener("change", () => { saveProfile({ birthYear: numOrNull(birthYear.value) }); render(); });
  height.addEventListener("change", () => { saveProfile({ height: numOrNull(height.value) }); render(); });
  proteinOverride.addEventListener("change", () => { saveProfile({ proteinOverride: numOrNull(proteinOverride.value) }); render(); });
  pregnant.addEventListener("change", () => { saveProfile({ pregnant: pregnant.checked }); render(); });

  foodEdit.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    const foods = loadFoods();
    foods.splice(Number(b.dataset.del), 1);
    saveFoods(foods.length ? foods : DEFAULT_FOODS.slice());
    render();
  });

  foodAdd.addEventListener("click", () => {
    const foods = loadFoods();
    if (foods.length >= MAX_FOODS) { foodMsg.textContent = `ボタンは${MAX_FOODS}個までです`; return; }
    const item = normalizeFood(newFoodName.value, newFoodG.value);
    if (!item) { foodMsg.textContent = "名前と、1〜100の数字を入れてください"; return; }
    saveFoods([...foods, item]);
    newFoodName.value = "";
    newFoodG.value = "";
    foodMsg.textContent = "";
    render();
  });

  foodReset.addEventListener("click", () => { saveFoods(DEFAULT_FOODS.slice()); render(); });

  return { render, sexLabel: SEX_LABEL };
}
