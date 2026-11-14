/*
 * チャイム表示画面と講師用チャイム設定画面で共通に使う処理
 */

// 科目のまとまり：訓練内容から先頭の（実技）（学科）と末尾の番号①②…を外したもの
// 例）「（実技）Javaプログラミング基礎演習③」→「Javaプログラミング基礎演習」
export function subjectKey(content) {
  return String(content || "")
    .replace(/^[（(](実技|学科)[）)]\s*/, "")
    .replace(/[\s①-⑳\d]+$/, "")
    .trim();
}

// チャイムを鳴らす日か：時間のある日、または「入校式(2H)」のように時間が書かれている日
export function isTrainingDay(day) {
  return !!day && (day.hours > 0 || /\dH/.test(day.content));
}

export function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

// 時間割表からチャイム時刻表の初期値を作る
//   各時限の開始 →「○限目」、終了 →「休憩」（次まで30分以上なら「昼休み」）、最後 →「本日の訓練は終了しました」
//   終了時刻と次の開始時刻が同じとき（6限目の終わり＝質疑応答の始まり）は開始の1件にまとめる
export function defaultSchedule(timetable) {
  const rows = [...(timetable || [])].sort((a, b) => a.start.localeCompare(b.start));
  const out = new Map();
  const add = (time, text) => { if (!out.has(time)) out.set(time, { time, chime: true, text, color: "#ffffff", size: 120, image: "", bgm: "" }); };
  rows.forEach((r, i) => {
    add(r.start, r.label);
    const next = rows[i + 1];
    if (!next) add(r.end, "本日の訓練は終了しました");
    else if (next.start !== r.end) add(r.end, toMin(next.start) - toMin(r.end) >= 30 ? "昼休み" : "休憩");
  });
  return [...out.values()].sort((a, b) => a.time.localeCompare(b.time));
}

// その日の準備中画面に出す「テキスト」「ツール」：日ごとの上書き → 科目ごとの設定 の順
export function infoFor(cfg, day) {
  if (!day) return { text: "", tool: "" };
  const s = (cfg.subjects || {})[subjectKey(day.content)] || {};
  const d = (cfg.days || {})[day.iso] || {};
  return { text: d.text || s.text || "", tool: d.tool || s.tool || "" };
}

export function mediaUrl(name) {
  return name ? "media/" + encodeURIComponent(name) : "";
}

export function readJson(id, fallback) {
  try { return JSON.parse(document.getElementById(id).textContent) || fallback; } catch (_) { return fallback; }
}
