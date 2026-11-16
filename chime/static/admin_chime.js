/*
 * 講師用：チャイムの設定画面
 * 画面で編集した内容を JSON にまとめ、「設定を保存する」でフォーム送信する（それ以外の通信はしない）
 */
import { subjectKey, isTrainingDay, defaultSchedule, todayIso, readJson } from "./chime_common.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const WD = ["日", "月", "火", "水", "木", "金", "土"];

const plan = readJson("planData", { days: [], timetable: [] });
const cfg = readJson("chimeData", {});
const media = readJson("mediaData", []);
const style = cfg.style || {};
const days = (plan.days || []).filter(isTrainingDay);

let schedule = (cfg.schedule && cfg.schedule.length) ? cfg.schedule.map((e) => ({ ...e })) : defaultSchedule(plan.timetable);
let displays = (cfg.displays || []).map((e) => ({ ...e }));
const subjects = { ...(cfg.subjects || {}) };
const dayOver = { ...(cfg.days || {}) };
let dirty = false;

function setDirty() { dirty = true; $("dirtyMsg").textContent = "未保存の変更があります"; }
const hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v || "") ? v : d);
function label(iso) { const [y, m, d] = iso.split("-").map(Number); return `${m}/${d}（${WD[new Date(y, m - 1, d).getDay()]}）`; }

function mediaOptions(kind, none, value) {
  const items = media.filter((m) => m.kind === kind);
  let html = `<option value="">${esc(none)}</option>`;
  items.forEach((m) => { html += `<option value="${esc(m.name)}"${m.name === value ? " selected" : ""}>${esc(m.name)}</option>`; });
  if (value && !items.some((m) => m.name === value)) html += `<option value="${esc(value)}" selected>${esc(value)}（見つかりません）</option>`;
  return html;
}

// ---------- 2. 基本設定 ----------
function initBasic() {
  document.querySelectorAll("select[data-media]").forEach((s) => {
    const v = { chimeSound: cfg.chime_sound, standbyImage: cfg.standby_image, standbyBgm: cfg.standby_bgm }[s.id] || "";
    s.innerHTML = mediaOptions(s.dataset.media, s.dataset.none, v);
  });
  $("bgcolor").value = hex(style.bgcolor, "#000000");
  $("trainingOnly").checked = cfg.training_days_only !== false;
  $("font").value = style.font || "";
  $("imgW").value = style.img_width ?? "";
  $("imgH").value = style.img_height ?? "";
  $("imgRatio").checked = style.img_keep_ratio !== false;
  $("textSize").value = style.text_size ?? 60; $("toolSize").value = style.tool_size ?? 60;
  $("textColor").value = hex(style.text_color, "#ffffff"); $("toolColor").value = hex(style.tool_color, "#ffffff");
  $("textBg").value = hex(style.text_bg, "#2c3e50"); $("toolBg").value = hex(style.tool_bg, "#c0392b");
  $("textY").value = style.text_y ?? 300; $("toolY").value = style.tool_y ?? 300;
  $("planNote").textContent = plan.days && plan.days.length
    ? `登録済みの日別計画表：${plan.days[0].iso}〜${plan.days[plan.days.length - 1].iso}（訓練日 ${days.length} 日）`
    : "日別計画表がまだ登録されていません。登録されるまでは毎日チャイムが鳴ります。";
}

// ---------- 3. チャイム時刻 ----------
function renderSched() {
  const hasTt = (plan.timetable || []).length > 0;
  $("ttNote").textContent = hasTt ? "時間割表：" + plan.timetable.map((t) => `${t.label} ${t.start}〜${t.end}`).join("、") : "";
  $("ttMissing").hidden = hasTt || schedule.length > 0;
  $("schedTable").innerHTML = `<thead><tr><th>時刻</th><th>音</th><th>表示文字</th><th>文字色</th><th>大きさ</th><th>画像</th><th>BGM</th><th></th></tr></thead><tbody>` +
    schedule.map((e, i) => `<tr>
      <td><input type="time" data-i="${i}" data-k="time" value="${esc(e.time)}" required></td>
      <td><input type="checkbox" data-i="${i}" data-k="chime" ${e.chime !== false ? "checked" : ""} aria-label="チャイムを鳴らす"></td>
      <td><input type="text" data-i="${i}" data-k="text" value="${esc(e.text)}" maxlength="60"></td>
      <td><input type="color" data-i="${i}" data-k="color" value="${hex(e.color, "#ffffff")}"></td>
      <td><input type="number" data-i="${i}" data-k="size" value="${e.size ?? 120}" min="8" max="300" class="num"></td>
      <td><select data-i="${i}" data-k="image">${mediaOptions("image", "（なし）", e.image)}</select></td>
      <td><select data-i="${i}" data-k="bgm">${mediaOptions("audio", "（なし）", e.bgm)}</select></td>
      <td><button type="button" class="danger" data-del="${i}">削除</button></td></tr>`).join("") + "</tbody>";
}
$("schedTable").addEventListener("input", (ev) => {
  const t = ev.target, i = t.dataset.i, k = t.dataset.k; if (i === undefined) return;
  schedule[i][k] = t.type === "checkbox" ? t.checked : (t.type === "number" ? Number(t.value) : t.value);
  setDirty();
});
$("schedTable").addEventListener("click", (ev) => {
  const d = ev.target.dataset.del; if (d === undefined) return;
  schedule.splice(Number(d), 1); renderSched(); setDirty();
});
$("addRow").addEventListener("click", () => {
  schedule.push({ time: "", chime: true, text: "", color: "#ffffff", size: 120, image: "", bgm: "" });
  renderSched(); setDirty();
});
$("fromTimetable").addEventListener("click", () => {
  if (!(plan.timetable || []).length) { alert("時間割表が登録されていません。"); return; }
  if (schedule.length && !confirm("今のチャイム時刻を消して、時間割表から作り直します。よろしいですか？")) return;
  schedule = defaultSchedule(plan.timetable); renderSched(); setDirty();
});

// ---------- 4. 科目ごと ----------
function subjectList() {
  const map = new Map();
  days.forEach((d) => {
    const k = subjectKey(d.content);
    if (!map.has(k)) map.set(k, { key: k, first: d.iso, last: d.iso, n: 0 });
    const s = map.get(k); s.last = d.iso; s.n++;
  });
  Object.keys(subjects).forEach((k) => { if (!map.has(k)) map.set(k, { key: k, first: "", last: "", n: 0 }); });
  return [...map.values()];
}
function renderSubj() {
  const list = subjectList();
  $("subjTable").innerHTML = `<thead><tr><th>科目</th><th>日数・期間</th><th>テキスト</th><th>ツール</th></tr></thead><tbody>` +
    (list.length ? list.map((s) => {
      const v = subjects[s.key] || {};
      return `<tr${s.n ? "" : ' class="offday"'}><td class="left">${esc(s.key)}${s.n ? "" : "（現在の日程にはありません）"}</td>
        <td>${s.n ? `${s.n}日（${label(s.first)}〜${label(s.last)}）` : "—"}</td>
        <td><input type="text" data-s="${esc(s.key)}" data-k="text" value="${esc(v.text)}" maxlength="80"></td>
        <td><input type="text" data-s="${esc(s.key)}" data-k="tool" value="${esc(v.tool)}" maxlength="80"></td></tr>`;
    }).join("") : `<tr><td colspan="4">日別計画表を登録すると科目が表示されます。</td></tr>`) + "</tbody>";
}
$("subjTable").addEventListener("input", (ev) => {
  const t = ev.target, k = t.dataset.s; if (k === undefined) return;
  subjects[k] = { ...(subjects[k] || {}), [t.dataset.k]: t.value };
  setDirty(); renderDays();
});

// ---------- 5. 日ごと ----------
function renderDays() {
  const ti = todayIso(), past = $("showPast").checked;
  const list = days.filter((d) => past || d.iso >= ti);
  $("dayTable").innerHTML = `<thead><tr><th>日付</th><th>訓練内容</th><th>テキスト</th><th>ツール</th></tr></thead><tbody>` +
    (list.length ? list.map((d) => {
      const o = dayOver[d.iso] || {}, s = subjects[subjectKey(d.content)] || {};
      return `<tr${d.iso === ti ? ' class="changed"' : ""}><td>${label(d.iso)}${d.iso === ti ? "（今日）" : ""}</td>
        <td class="left">${esc(d.content)}</td>
        <td><input type="text" data-d="${d.iso}" data-k="text" value="${esc(o.text)}" placeholder="${esc(s.text || "")}" maxlength="80"></td>
        <td><input type="text" data-d="${d.iso}" data-k="tool" value="${esc(o.tool)}" placeholder="${esc(s.tool || "")}" maxlength="80"></td></tr>`;
    }).join("") : `<tr><td colspan="4">表示する日がありません。</td></tr>`) + "</tbody>";
}
$("dayTable").addEventListener("input", (ev) => {
  const t = ev.target, iso = t.dataset.d; if (iso === undefined) return;
  dayOver[iso] = { ...(dayOver[iso] || {}), [t.dataset.k]: t.value };
  setDirty();
});
$("showPast").addEventListener("change", renderDays);

// ---------- 6. 手動切替 ----------
function renderDisp() {
  $("dispTable").innerHTML = `<thead><tr><th>名前</th><th>表示文字</th><th>文字色</th><th>大きさ</th><th>画像</th><th></th></tr></thead><tbody>` +
    (displays.length ? displays.map((e, i) => `<tr>
      <td><input type="text" data-i="${i}" data-k="label" value="${esc(e.label)}" maxlength="40" required></td>
      <td><input type="text" data-i="${i}" data-k="text" value="${esc(e.text)}" maxlength="60"></td>
      <td><input type="color" data-i="${i}" data-k="color" value="${hex(e.color, "#ffffff")}"></td>
      <td><input type="number" data-i="${i}" data-k="size" value="${e.size ?? 120}" min="8" max="300" class="num"></td>
      <td><select data-i="${i}" data-k="image">${mediaOptions("image", "（なし）", e.image)}</select></td>
      <td><button type="button" class="danger" data-del="${i}">削除</button></td></tr>`).join("")
      : `<tr><td colspan="6">項目はありません。</td></tr>`) + "</tbody>";
}
$("dispTable").addEventListener("input", (ev) => {
  const t = ev.target, i = t.dataset.i, k = t.dataset.k; if (i === undefined) return;
  displays[i][k] = t.type === "number" ? Number(t.value) : t.value; setDirty();
});
$("dispTable").addEventListener("click", (ev) => {
  const d = ev.target.dataset.del; if (d === undefined) return;
  displays.splice(Number(d), 1); renderDisp(); setDirty();
});
$("addDisp").addEventListener("click", () => {
  displays.push({ label: "", text: "", color: "#ffffff", size: 120, image: "" }); renderDisp(); setDirty();
});

// ---------- 保存 ----------
document.querySelectorAll("#saveForm section:nth-of-type(1) input, #saveForm section:nth-of-type(1) select")
  .forEach((el) => el.addEventListener("input", setDirty));

$("saveForm").addEventListener("submit", () => {
  const num = (id) => ($(id).value === "" ? null : Number($(id).value));
  const data = {
    chime_sound: $("chimeSound").value, standby_image: $("standbyImage").value, standby_bgm: $("standbyBgm").value,
    training_days_only: $("trainingOnly").checked,
    style: {
      bgcolor: $("bgcolor").value, font: $("font").value.trim(),
      img_keep_ratio: $("imgRatio").checked, img_width: num("imgW"), img_height: num("imgH"),
      text_size: num("textSize"), tool_size: num("toolSize"),
      text_color: $("textColor").value, tool_color: $("toolColor").value,
      text_bg: $("textBg").value, tool_bg: $("toolBg").value,
      text_y: num("textY"), tool_y: num("toolY"),
    },
    schedule, subjects, days: dayOver, displays,
  };
  $("chimeField").value = JSON.stringify(data);
  dirty = false;
  $("saveBtn").disabled = true; $("saveBtn").textContent = "保存しています…";
});

window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
document.querySelectorAll("form.delForm").forEach((f) => f.addEventListener("submit", (e) => {
  if (!confirm(`「${f.elements.name.value}」を削除します。よろしいですか？`)) e.preventDefault();
  else dirty = false;
}));
$("uploadForm").addEventListener("submit", (e) => {
  if (dirty && !confirm("保存していない設定の変更は消えます。アップロードしますか？")) e.preventDefault();
  else dirty = false;
});

initBasic(); renderSched(); renderSubj(); renderDays(); renderDisp();
