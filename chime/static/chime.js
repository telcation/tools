/*
 * チャイム表示画面（デスクトップ版 chimeApp.py の Web 版）
 *  ・時計／次のチャイム
 *  ・最初の時刻より前は「準備中画面」：準備中の画像＋その日の「テキスト」「ツール」＋準備中BGM
 *  ・時刻になったらチャイム音 → 表示文字・画像に切り替え → BGM（次の時刻の2秒前からフェードアウト）
 *  ・手動切替（次のチャイムまで表示）
 * データはページに埋め込まれているので通信はしない。日付が変わったらページを読み込み直して最新の設定にする。
 */
import { isTrainingDay, defaultSchedule, infoFor, todayIso, mediaUrl, readJson,
  applyStage, showPicture as drawPicture, showCenter as drawCenter, showSlots as drawSlots, showToday as drawToday } from "./chime_common.js";

const $ = (id) => document.getElementById(id);
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const plan = readJson("planData", { days: [], timetable: [] });
const cfg = readJson("chimeData", {});
const style = cfg.style || {};
const schedule = ((cfg.schedule && cfg.schedule.length) ? cfg.schedule : defaultSchedule(plan.timetable))
  .slice().sort((a, b) => a.time.localeCompare(b.time));

const loadedIso = todayIso();
const today = (plan.days || []).find((d) => d.iso === loadedIso) || null;
const planRegistered = (plan.days || []).length > 0;
// チャイムを鳴らす日か（日程未登録のときは毎日鳴らす）
const active = !planRegistered || cfg.training_days_only === false || isTrainingDay(today);
const info = infoFor(cfg, today);

let audioReady = false;
let audioCtx = null;
let mode = "schedule";        // "schedule" | "manual"
let lastMinute = "";
const played = new Set();
const bgm = new Audio(); bgm.loop = true;
let fadeTimer = null, fadeIv = null;
let chimeAudio = null;

// ---------------- 見た目 ----------------
applyStage({ stage: $("stage"), clock: $("clock"), next: $("next"), status: $("status") }, style);
const showPicture = (name) => drawPicture($("picture"), name, style);
const showCenter = (text, color, size) => drawCenter($("center"), text, color, size);
const todayInfo = readJson("todayData", null);
const showSlots = (on) => {
  drawSlots($("slotTop"), $("slotBtm"), info, style, on);
  drawToday($("today"), todayInfo, style, on);  // 「今日は何の日？」も準備中画面だけに出す
};

// ---------------- 音 ----------------
function stopBgm() {
  clearTimeout(fadeTimer); clearInterval(fadeIv);
  bgm.pause(); bgm.volume = 1;
}
function playBgm(name, fromTime) {
  stopBgm();
  if (!name || !audioReady) return;
  bgm.src = mediaUrl(name); bgm.currentTime = 0; bgm.volume = 1;
  bgm.play().catch(() => {});
  // 次のチャイムの2秒前からフェードアウト
  const next = schedule.find((e) => e.time > fromTime);
  if (!next) return;
  const [h, m] = next.time.split(":").map(Number);
  const at = new Date(); at.setHours(h, m, 0, 0);
  const ms = at - Date.now() - 2000;
  if (ms < 0) return;
  fadeTimer = setTimeout(() => {
    const t0 = Date.now();
    fadeIv = setInterval(() => {
      const r = 1 - (Date.now() - t0) / 2000;
      if (r <= 0) { clearInterval(fadeIv); bgm.pause(); bgm.volume = 1; } else bgm.volume = r;
    }, 50);
  }, ms);
}

// 標準のチャイム（素材がないとき）：キンコンカンコン
function synthChime() {
  return new Promise((resolve) => {
    if (!audioCtx) { resolve(); return; }
    const notes = [659.3, 523.3, 587.3, 392.0, 392.0, 587.3, 659.3, 523.3];
    const t0 = audioCtx.currentTime + 0.05, step = 0.62;
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * step);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + i * step + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * step + 1.6);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + i * step); o.stop(t0 + i * step + 1.7);
    });
    setTimeout(resolve, (notes.length * step + 1.2) * 1000);
  });
}
function playChime() {
  if (!audioReady) return Promise.resolve();
  if (!cfg.chime_sound) return synthChime();
  return new Promise((resolve) => {
    chimeAudio = new Audio(mediaUrl(cfg.chime_sound));
    chimeAudio.onended = resolve; chimeAudio.onerror = resolve;
    chimeAudio.play().catch(resolve);
  });
}

// ---------------- 表示の切り替え ----------------
function currentEntry(hhmm) {
  let cur = null;
  schedule.forEach((e) => { if (e.time <= hhmm) cur = e; });
  return cur;
}
function showStandby(withSound) {
  showPicture(cfg.standby_image);
  showCenter("");
  showSlots(active);
  drawToday($("today"), todayInfo, style, true);
  if (withSound && active) playBgm(cfg.standby_bgm, "00:00"); else stopBgm();
}
function showEntry(e) {
  showSlots(false);
  showPicture(e.image);
  showCenter(e.text, e.color, e.size);
}
// 今の時刻の表示に戻す（チャイムは鳴らさない）
function returnToSchedule() {
  mode = "schedule";
  const hhmm = hhmmNow();
  const e = active ? currentEntry(hhmm) : null;
  if (e) { showEntry(e); playBgm(e.bgm, e.time); } else showStandby(true);
}
async function fire(e) {
  mode = "schedule";
  stopBgm();
  showEntry(e);
  if (e.chime !== false) await playChime();
  if (mode === "schedule") playBgm(e.bgm, e.time);
}

// ---------------- 時計とチャイムの監視 ----------------
function hhmmNow() { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function tick() {
  const d = new Date();
  if (todayIso(d) !== loadedIso) { location.reload(); return; } // 日付が変わったら最新の設定で読み込み直す
  const reiwa = d.getFullYear() - 2018;
  $("date").textContent = `${d.getFullYear()}（令和${reiwa}）年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
  $("time").textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  const hhmm = hhmmNow();
  const next = active ? schedule.find((e) => e.time > hhmm) : null;
  $("next").textContent = next ? `次のチャイム：${next.time}` : "次のチャイム：なし";
  if (hhmm !== lastMinute) {
    lastMinute = hhmm;
    const e = active && schedule.find((x) => x.time === hhmm);
    if (e && !played.has(hhmm) && d.getSeconds() < 50) { played.add(hhmm); fire(e); }
  }
}

function statusText() {
  const parts = [];
  if (!planRegistered) parts.push("日別計画表が未登録のため、毎日チャイムを鳴らします");
  else if (today) parts.push(`本日：${today.content}${active ? "" : "（訓練時間外のためチャイムなし）"}`);
  else parts.push(active ? "本日：日別計画表にない日です" : "本日は訓練日ではありません（チャイムなし）");
  if (!schedule.length) parts.push("チャイム時刻が設定されていません");
  parts.push(audioReady ? "音：オン" : "音：オフ（画面をクリックしてください）");
  $("status").textContent = parts.join("　／　");
}

// ---------------- 手動切替 ----------------
function openManual() {
  const list = $("manualList");
  list.replaceChildren();
  const add = (title, items) => {
    if (!items.length) return;
    const h = document.createElement("h3"); h.textContent = title; list.append(h);
    items.forEach(([label, run]) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label;
      b.addEventListener("click", () => { mode = "manual"; stopBgm(); run(); $("manual").close(); });
      list.append(b);
    });
  };
  add("手動切替の項目", (cfg.displays || []).map((e) => [`${e.label}　${e.text || ""}`, () => { showSlots(false); showPicture(e.image); showCenter(e.text, e.color, e.size); }]));
  add("準備中画面", [["準備中画面", () => showStandby(false)]]);
  add("スケジュール", schedule.map((e) => [`${e.time}　${e.text || "（文字なし）"}`, () => showEntry(e)]));
  $("manual").showModal();
}

// ---------------- 操作 ----------------
function startAudio() {
  if (audioReady) return;
  audioReady = true;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audioCtx = null; }
  }
  if (audioCtx) audioCtx.resume();
  $("startOverlay").hidden = true;
  statusText();
  returnToSchedule(); // 今の表示のBGMを流し始める
}
$("startOverlay").addEventListener("click", startAudio);
$("btnManual").addEventListener("click", openManual);
$("btnBack").addEventListener("click", () => { $("manual").close(); returnToSchedule(); });
$("btnClose").addEventListener("click", () => $("manual").close());
$("btnFull").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});
document.addEventListener("fullscreenchange", () => { $("btnFull").textContent = document.fullscreenElement ? "全画面を終了" : "全画面"; });

// マウスを動かさないとボタンとカーソルを隠す（投影中に目立たないように）
let idle = null;
function wake() { $("stage").classList.remove("hideUi"); clearTimeout(idle); idle = setTimeout(() => $("stage").classList.add("hideUi"), 4000); }
["mousemove", "keydown", "touchstart"].forEach((t) => document.addEventListener(t, wake, { passive: true }));

lastMinute = hhmmNow(); // 開いた分のチャイムは鳴らさない（表示だけ合わせる）
returnToSchedule();
statusText();
tick(); setInterval(tick, 500);
wake();

// 起動用ファイル（start_chime.bat）から開いたときなど、クリックなしで音を鳴らせるブラウザでは自動で開始する
try {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "running") { audioCtx = ctx; startAudio(); } else ctx.close();
} catch (_) { /* 音を鳴らせないブラウザ：クリックを待つ */ }
