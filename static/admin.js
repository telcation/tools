/*
 * 講師用画面：日別計画表PDFをブラウザの中で読み取り、
 * 「日付・訓練内容・時間」だけを登録フォームに入れる。担当講師名は送らない。
 * PDF そのものはサーバーへ送信しない（通信は「この内容で登録する」ボタンのフォーム送信のみ）。
 */
import * as pdfjs from "./vendor/pdfjs/pdf.min.mjs";
import { parsePlanPdf } from "./plan_parser.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const MAX_PDF_SIZE = 10 * 1024 * 1024;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let current = { days: [] };
try { current = JSON.parse($("planData").textContent) || current; } catch (_) { /* 未登録 */ }
const curMap = new Map((current.days || []).map((d) => [d.iso, d]));

function label(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}/${m}/${d}（${WD[new Date(y, m - 1, d).getDay()]}）`;
}

function showPreview(days) {
  let changed = 0, added = 0;
  const newIsos = new Set(days.map((d) => d.iso));
  const removed = [...curMap.keys()].filter((iso) => !newIsos.has(iso));
  const rows = days.map((d) => {
    const old = curMap.get(d.iso);
    let mark = "";
    if (curMap.size && !old) { mark = "追加"; added++; }
    else if (old && (old.content !== d.content || old.hours !== d.hours)) { mark = "変更"; changed++; }
    const was = mark === "変更" ? `<br><span class="was">変更前：${esc(old.content)}［${old.hours}H］</span>` : "";
    return `<tr class="${mark ? "changed" : ""}${d.hours ? "" : " offday"}">
      <td>${label(d.iso)}</td><td class="left">${esc(d.content)}${was}</td>
      <td>${d.hours ? d.hours + "H" : "時間外"}</td><td>${mark}</td></tr>`;
  });
  $("previewTable").innerHTML =
    `<thead><tr><th>日付</th><th>訓練内容</th><th>時間</th><th>前回との違い</th></tr></thead><tbody>${rows.join("")}</tbody>`;
  if (!curMap.size) $("diffMsg").textContent = "初めての登録です。内容を確認して登録してください。";
  else if (!changed && !added && !removed.length) $("diffMsg").textContent = "現在の登録と同じ内容です（登録し直す必要はありません）。";
  else $("diffMsg").textContent = `現在の登録との違い：変更 ${changed} 日・追加 ${added} 日・削除 ${removed.length} 日` +
    (removed.length ? `（削除：${removed.map(label).join("、")}）` : "") + "。色の付いた行を確認してください。";
  $("previewBox").hidden = false;
  $("previewBox").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadPlanFile(f) {
  if (!f) return;
  $("previewBox").hidden = true;
  if (f.size > MAX_PDF_SIZE) { $("planMsg").textContent = "ファイルが大きすぎます。10MB 以下のPDFを選んでください。"; return; }
  $("planMsg").textContent = "読み取っています…";
  try {
    const r = await parsePlanPdf(pdfjs, new Uint8Array(await f.arrayBuffer()));
    // 登録するのは 日付・訓練内容・時間 だけ（担当講師名はここで捨てる）
    const days = r.days.filter((d) => d.content).map((d) => ({ iso: d.iso, content: d.content, hours: d.hours }));
    if (!r.isPlan || !days.length) {
      $("planMsg").textContent = "日別計画表（認定様式第6号）として読み取れませんでした。正しいPDFか確認してください。";
      return;
    }
    const total = days.reduce((s, d) => s + d.hours, 0);
    $("planMsg").textContent = `読み取りました：${label(days[0].iso)}〜${label(days[days.length - 1].iso)}、` +
      `訓練日 ${days.filter((d) => d.hours > 0).length} 日・合計 ${total}H。PDFの「時間合計」と同じか確認してください。`;
    $("daysField").value = JSON.stringify(days);
    $("timetableField").value = JSON.stringify(r.timetable || []);
    $("ttMsg").textContent = (r.timetable && r.timetable.length)
      ? "時間割表：" + r.timetable.map((t) => `${t.label} ${t.start}〜${t.end}`).join("、")
      : "時間割表は読み取れませんでした（チャイムの時刻は講師用のチャイム設定で入力してください）。";
    showPreview(days);
  } catch (e) {
    console.error(e);
    $("planMsg").textContent = "PDFを読み取れませんでした。パスワード付きや画像だけのPDFは読み取れません。";
  }
}

async function openPlan() {
  // 対応ブラウザ（Chrome / Edge・HTTPS）では「ドキュメント」フォルダを最初に開く
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        startIn: "documents", multiple: false,
        types: [{ description: "日別計画表（PDF）", accept: { "application/pdf": [".pdf"] } }],
      });
      await loadPlanFile(await handle.getFile());
    } catch (e) { if (e.name !== "AbortError") $("planFile").click(); }
  } else $("planFile").click();
}

$("planOpen").addEventListener("click", openPlan);
$("planFile").addEventListener("change", async (e) => { await loadPlanFile(e.target.files[0]); e.target.value = ""; });
$("saveForm").addEventListener("submit", (e) => {
  if (!$("daysField").value) { e.preventDefault(); return; }
  $("saveBtn").disabled = true;
  $("saveBtn").textContent = "登録しています…";
});
