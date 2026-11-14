/*
 * 日別計画表（認定様式第6号）の PDF から、日ごとの訓練内容・時間・担当講師を取り出す。
 * ブラウザ（pdf.js）の getTextContent() の結果を受け取って解析するだけで、通信はしない。
 *
 * 様式の特徴：
 *  ・1ページに「1か月目」〜「4か月目」のように月ごとの帯が縦に並ぶ
 *  ・各帯は「月/日」「曜」「訓練内容（縦書き・1文字ずつ）」「担当講師」「時間」の行でできている
 *  ・日付は列ごと。列の位置は「曜」行の1文字（月・火…）の x 座標で決まる
 */
const WEEK = "日月火水木金土";

function toItems(textContent, pageHeight) {
  return textContent.items
    .filter((it) => it.str && it.str.trim() !== "")
    .map((it) => ({
      s: it.str,
      x: it.transform[4],
      y: pageHeight - it.transform[5], // 上からの距離に直す
      w: it.width,
    }));
}

// 「9/25 9/26 …」「中森 中村 …」のように複数列が1つにまとまった文字列を列に割り振る
function spreadTokens(item, cols) {
  const toks = item.s.trim().split(/\s+/);
  const pitch = cols.length > 1 ? (cols[cols.length - 1] - cols[0]) / (cols.length - 1) : 10;
  const out = [];
  let start = 0, best = Infinity;
  cols.forEach((cx, i) => { const d = Math.abs(cx - (item.x + 2)); if (d < best) { best = d; start = i; } });
  const step = toks.length > 1 ? (item.w + pitch * 0.2) / toks.length : pitch;
  toks.forEach((t, k) => {
    const x = item.x + 2 + step * k;
    let ci = start, bd = Infinity;
    cols.forEach((cx, i) => { const d = Math.abs(cx - x); if (d < bd) { bd = d; ci = i; } });
    out.push([ci, t]);
  });
  return out;
}

function nearestCol(x, cols, tol) {
  let ci = -1, bd = tol;
  cols.forEach((cx, i) => { const d = Math.abs(cx + 2 - x); if (d < bd) { bd = d; ci = i; } });
  return ci;
}

// 縦書きの1列分の文字を上から並べて文字列にする。
// 空白は「Excel VBA」のように英数字どうしの間が空いているときだけ入れる
// （縦書きの小さい「ャ」「ョ」などは位置がずれて置かれるため、日本語の間には入れない）
function joinVertical(chars) {
  chars.sort((a, b) => a.y - b.y);
  const gaps = [];
  for (let i = 1; i < chars.length; i++) gaps.push(chars[i].y - chars[i - 1].y);
  const sorted = [...gaps].sort((a, b) => a - b);
  const pitch = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 5;
  const alnum = (c) => /^[A-Za-z0-9]$/.test(c);
  let s = chars.length ? chars[0].s : "";
  for (let i = 1; i < chars.length; i++) {
    const a = chars[i - 1].s.trim().slice(-1), b = chars[i].s.trim().charAt(0);
    if (gaps[i - 1] > pitch * 1.6 && alnum(a) && alnum(b)) s += " ";
    s += chars[i].s.trim();
  }
  return s;
}

function parsePage(items) {
  // 帯の区切り：「月/日」ラベルの位置
  const heads = items.filter((it) => it.s.trim() === "月/日").sort((a, b) => a.y - b.y);
  const days = [];
  heads.forEach((h, bi) => {
    const top = h.y - 3;
    const bottom = bi + 1 < heads.length ? heads[bi + 1].y - 3 : Infinity;
    const band = items.filter((it) => it.y >= top && it.y < bottom);
    const label = (re) => band.find((it) => re.test(it.s.trim()) && it.x < h.x + 20);
    const youbi = label(/^曜$/), teach = label(/^担当講師$/), hours = label(/^時間$/);
    if (!youbi || !teach || !hours) return;

    // 列の位置（曜日の1文字）
    const wd = band.filter((it) => Math.abs(it.y - youbi.y) < 2 && it.x > youbi.x + 5 && WEEK.includes(it.s.trim()) && it.s.trim().length === 1)
      .sort((a, b) => a.x - b.x);
    const cols = wd.map((it) => it.x);
    const col = cols.map((_, i) => ({ date: "", wd: wd[i].s.trim(), chars: [], teacher: "", hours: "" }));

    // 日付
    band.filter((it) => Math.abs(it.y - h.y) < 3 && it !== h)
      .forEach((it) => spreadTokens(it, cols).forEach(([ci, t]) => { if (/^\d{1,2}\/\d{1,2}$/.test(t)) col[ci].date = t; }));
    // 訓練内容（曜の行と担当講師の行の間）
    band.filter((it) => it.y > youbi.y + 3 && it.y < teach.y - 2 && it.x > youbi.x + 10)
      .forEach((it) => { const ci = nearestCol(it.x, cols, 4.5); if (ci >= 0) col[ci].chars.push(it); });
    // 担当講師
    band.filter((it) => Math.abs(it.y - teach.y) < 3 && it !== teach && it.x > teach.x + 15)
      .forEach((it) => spreadTokens(it, cols).forEach(([ci, t]) => { col[ci].teacher = t; }));
    // 時間
    band.filter((it) => Math.abs(it.y - hours.y) < 3 && /^\d+H$/.test(it.s.trim()))
      .forEach((it) => { const ci = nearestCol(it.x, cols, 4.5); if (ci >= 0) col[ci].hours = it.s.trim(); });

    col.forEach((c) => days.push({
      md: c.date, wd: c.wd,
      content: joinVertical(c.chars),
      teacher: c.teacher,
      hours: c.hours ? parseInt(c.hours, 10) : 0,
    }));
  });
  return days;
}

// 年を決める：2ページ目の「実施期間 令和8年9月25日(金)」などから、
// 計画表の最初の日付と同じ月日の記載を探して開始年とする
function findStartYear(allItems, firstMd) {
  const z2h = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const found = [];
  allItems.forEach((it) => {
    for (const m of z2h(it.s).matchAll(/令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/g)) {
      found.push({ year: 2018 + Number(m[1]), month: Number(m[2]), day: Number(m[3]) });
    }
  });
  if (!found.length) return null;
  if (firstMd) {
    const [fm, fd] = firstMd.split("/").map(Number);
    const hit = found.find((f) => f.month === fm && f.day === fd);
    if (hit) return hit;
  }
  // 見つからなければ、様式の注記（令和6年4月1日以降…）を除いた最も早い日付
  const cand = found.filter((f) => !(f.month === 4 && f.day === 1));
  (cand.length ? cand : found).sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day);
  return (cand.length ? cand : found)[0];
}

function assignYears(days, start) {
  let year = start ? start.year : new Date().getFullYear();
  let prev = start ? start.month : 0;
  const out = [];
  for (const d of days) {
    if (!d.md) continue;
    const [m, dd] = d.md.split("/").map(Number);
    if (prev && m < prev) year++;
    prev = m;
    out.push({ ...d, iso: `${year}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}` });
  }
  return out;
}


// 時間割表（2ページ目の「1限目 10:10 ～ 11:00」…「質疑応答 16:35 ～ 17:35」）を読み取る
function parseTimetable(allItems) {
  const z2h = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const rows = [];
  allItems.forEach((it) => {
    const t = z2h(it.s.trim());
    const m = t.match(/^([1-9])限目$/);
    if (!m && t !== "質疑応答") return;
    const times = allItems
      .filter((o) => o.page === it.page && Math.abs(o.y - it.y) < 1.5 && o.x > it.x && o.x < it.x + 110 && /^\d{1,2}:\d{2}$/.test(o.s.trim()))
      .sort((a, b) => a.x - b.x).map((o) => o.s.trim().padStart(5, "0"));
    if (times.length >= 2) rows.push({ label: m ? `${m[1]}限目` : "質疑応答", period: m ? Number(m[1]) : 0, start: times[0], end: times[1] });
  });
  const seen = new Set();
  return rows.filter((r) => !seen.has(r.label) && seen.add(r.label)).sort((a, b) => a.start.localeCompare(b.start));
}

export async function parsePlanPdf(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    pages.push(toItems(await page.getTextContent(), vp.height).map((it) => ({ ...it, page: p })));
  }
  const all = pages.flat();
  const title = all.find((it) => /認定様式第\s*[6６]\s*号/.test(it.s)) || all.some((it) => /日\s*別\s*計\s*画\s*表/.test(it.s));
  let days = [];
  pages.forEach((items) => { days = days.concat(parsePage(items)); });
  const first = days.find((d) => d.md);
  const start = findStartYear(all, first && first.md);
  doc.destroy();
  return { isPlan: !!title, days: assignYears(days, start), startYear: start ? start.year : null, timetable: parseTimetable(all) };
}
