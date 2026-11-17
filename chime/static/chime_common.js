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

// 素材のURL（ページに埋め込んだ置き場所 /tools/chime/media/ ＋ ファイル名）
let MEDIA_BASE = null;
export function mediaUrl(name) {
  if (!name) return "";
  if (MEDIA_BASE === null) MEDIA_BASE = readJson("mediaBase", "media/");
  return MEDIA_BASE + encodeURIComponent(name);
}

export function readJson(id, fallback) {
  try { return JSON.parse(document.getElementById(id).textContent) || fallback; } catch (_) { return fallback; }
}

// ---------------- 表示（チャイム表示画面と講師用の「テスト実行」で共通） ----------------
const isDark = (hex) => {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return true;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b <= 128;
};

// 背景色・フォント・時計の色
export function applyStage(el, style) {
  el.stage.style.background = style.bgcolor || "#000000";
  el.stage.style.fontFamily = `"${(style.font || "BIZ UDPGothic").replace(/"/g, "")}", "BIZ UDPGothic", "Meiryo", sans-serif`;
  const clock = style.clock_color || "#000000";
  const dark = isDark(clock);
  if (el.clock) {
    el.clock.style.color = clock;
    // 文字が背景や画像に埋もれないよう、文字色と反対の色でふちどる
    el.clock.style.textShadow = dark ? "0 0 4px #fff, 0 0 8px #fff" : "0 0 4px #000, 0 0 8px #000";
  }
  if (el.next) el.next.style.color = dark ? "#007a3d" : "#00ff88";
  if (el.status) el.status.style.color = clock;
}

// 画像：縦横比は変えずに大きさを合わせる
//   width   … 横幅に合わせる（デスクトップ版と同じ。縦が画面より長い分は上下が切れる）
//   cover   … 画面全体を覆う（はみ出した分は切れる）
//   contain … 画像全体を表示（余白に背景色が見える）
export function showPicture(img, name, style) {
  if (!name) { img.hidden = true; img.removeAttribute("src"); return; }
  const W = `min(${style.img_width ? style.img_width + "px" : "100vw"}, 100vw)`;
  const H = `min(${style.img_height ? style.img_height + "px" : "100vh"}, 100vh)`;
  const fit = style.img_keep_ratio === false ? "fill" : (style.img_fit || "width");
  img.style.width = W;
  if (fit === "width") { img.style.height = "auto"; img.style.objectFit = ""; }
  else { img.style.height = H; img.style.objectFit = fit; }
  img.src = mediaUrl(name);
  img.hidden = false;
}

export function showCenter(el, text, color, size) {
  if (!text) { el.hidden = true; return; }
  el.textContent = text;
  el.style.color = color || "#ffffff";
  el.style.fontSize = `${size || 120}px`;
  el.hidden = false;
}

// 準備中画面の「テキスト」「ツール」
export function showSlots(top, btm, info, style, on) {
  top.hidden = !(on && info.text);
  btm.hidden = !(on && info.tool);
  if (on && info.text) {
    top.textContent = `テキスト：${info.text}`;
    Object.assign(top.style, { top: `${style.text_y ?? 300}px`, fontSize: `${style.text_size ?? 60}px`,
      color: style.text_color || "#fff", background: style.text_bg || "transparent" });
  }
  if (on && info.tool) {
    btm.textContent = `ツール：${info.tool}`;
    Object.assign(btm.style, { top: `calc(100vh - ${style.tool_y ?? 300}px)`, fontSize: `${style.tool_size ?? 60}px`,
      color: style.tool_color || "#fff", background: style.tool_bg || "transparent" });
  }
}

// 準備中画面の「今日は何の日？」（Wikipedia の記念日・年中行事と、IT・コンピュータ関連のできごと）
export function showToday(el, data, style, on) {
  const ok = on && style.today_enabled !== false && data &&
    ((data.anniversaries || []).length || (data.it_events || []).length);
  el.hidden = !ok;
  if (!ok) return;
  el.replaceChildren();
  el.style.top = `${style.today_top ?? 55}vh`;
  el.style.fontSize = `${style.today_size ?? 34}px`;
  const h = document.createElement("div");
  h.className = "todayTitle";
  h.textContent = `今日は何の日？　${data.title || ""}`;
  el.append(h);
  const cols = document.createElement("div");
  cols.className = "todayCols";
  const col = (title, items) => {
    if (!items.length) return;
    const box = document.createElement("div");
    const t = document.createElement("div"); t.className = "todayHead"; t.textContent = title;
    const ul = document.createElement("ul");
    items.forEach((x) => { const li = document.createElement("li"); li.textContent = x; ul.append(li); });
    box.append(t, ul); cols.append(box);
  };
  col("記念日・年中行事", data.anniversaries || []);
  col("IT・コンピュータのできごと", (data.it_events || []).map((e) => `${e.year < 0 ? "紀元前" + -e.year : e.year}年　${e.text}`));
  el.append(cols);
  const src = document.createElement("div");
  src.className = "todaySrc";
  src.textContent = `出典：Wikipedia「${data.title || ""}」（CC BY-SA）`;
  el.append(src);
  fitToday(el, style);
  // 画面の大きさが変わったとき（最大化・全画面の切り替えなど）も収まるように合わせ直す
  if (!el.dataset.fitBound) {
    el.dataset.fitBound = "1";
    window.addEventListener("resize", () => { if (!el.hidden && el.__style) fitToday(el, el.__style); });
  }
}

// 画面の下端（下の帯・ボタンの分は空ける）に収まるまで、文字を小さくする（設定の大きさの40%まで）。
// それでも入らないときは、項目を後ろから減らす
const TODAY_BOTTOM_GAP = 56;
function fitToday(el, style) {
  el.__style = style;
  const base = style.today_size ?? 34;
  const avail = () => window.innerHeight - el.getBoundingClientRect().top - TODAY_BOTTOM_GAP;
  el.querySelectorAll("li[data-cut]").forEach((li) => { li.hidden = false; delete li.dataset.cut; });
  let size = base;
  el.style.fontSize = `${size}px`;
  while (el.scrollHeight > avail() && size > Math.max(12, base * 0.4)) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
  // まだはみ出すとき：いちばん項目の多い列から1件ずつ隠す
  let guard = 20;
  while (el.scrollHeight > avail() && guard-- > 0) {
    const lists = [...el.querySelectorAll("ul")].map((ul) => [...ul.querySelectorAll("li:not([hidden])")]);
    const longest = lists.sort((a, b) => b.length - a.length)[0];
    if (!longest || longest.length <= 1) break;
    const li = longest[longest.length - 1];
    li.hidden = true; li.dataset.cut = "1";
  }
}
