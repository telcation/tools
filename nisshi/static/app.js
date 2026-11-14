"use strict";
/*
 * すべての処理はブラウザの中で行います。
 * 氏名や感想をサーバーへ送るコード（fetch など）は一切ありません。
 * localStorage などにも保存しないので、再読み込みで入力内容は消えます。
 * 日別計画表（日付・訓練内容・時間）はサーバーに登録済みのものがページに埋め込まれています。
 */
(function(){
const WD = ["日","月","火","水","木","金","土"];
const KINDS = ["欠席","遅刻","早退","欠課"];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// ===== 状態（メモリ上のみ） =====
let PLAN={updated:null,days:[]};
try{ PLAN=JSON.parse($("planData").textContent); }catch(_){}
const plan=PLAN.days||[];  // {iso, content, hours}
let currentDate="";
let periods=[];      // {subject, content, quiz, teacher}
let students=[];     // {name, fullDay, p:[6]}

function parseDate(iso){const [y,m,d]=iso.split("-").map(Number);return new Date(y,m-1,d);}
function todayIso(){const t=new Date();return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;}
function entryOf(iso){return plan.find(d=>d.iso===iso);}
// 訓練科目名：日別計画表の訓練内容欄の名称。既定では先頭の（実技）（学科）を外す
function subjectName(raw){return $("withKind").checked ? raw : raw.replace(/^[（(](実技|学科)[）)]\s*/,"");}

// ===== 日付選択 =====
function buildDateSel(){
  const sel=$("dateSel");
  if(!plan.length){
    sel.innerHTML=`<option value="other">日付を指定…</option>`; sel.value="other"; return;
  }
  sel.innerHTML=plan.map(d=>{const x=parseDate(d.iso);
    const h=d.hours>0?`${d.hours}H`:"訓練時間外";
    return `<option value="${d.iso}">${x.getMonth()+1}/${x.getDate()}（${WD[x.getDay()]}） ${esc(subjectName(d.content))}［${h}］</option>`;}).join("")
    +`<option value="other">その他の日付…</option>`;
  const ti=todayIso();
  const hit=plan.find(d=>d.iso===ti) || plan.find(d=>d.iso>ti && d.hours>0) || plan[plan.length-1];
  sel.value=hit.iso;
}
function onDateChange(){
  const v=$("dateSel").value;
  $("otherDateBox").hidden = v!=="other";
  currentDate = v==="other" ? $("otherDate").value : v;
  $("startPeriod").value="1";
  loadDay();
}
// 訓練内容を講義ごとに分ける。
// 例）「入校式・オリエンテーション(2H)・（学科）安全衛生2H」
//   → [{name:"入校式・オリエンテーション", h:2}, {name:"（学科）安全衛生", h:2}]
// 時間の書かれていない普通の日は、日別計画表の時間をそのまま使う
function segmentsOf(e){
  const segs=[], re=/(.+?)[（(]?([1-9])H[）)]?(?=・|$)/g;
  let m, last=0;
  while((m=re.exec(e.content))!==null){
    const name=m[1].replace(/^・/,"").trim();
    if(name) segs.push({name, h:Number(m[2])});
    last=re.lastIndex;
  }
  if(segs.length && last===e.content.length) return segs;
  return e.hours>0 ? [{name:e.content, h:e.hours}] : [];
}
function loadDay(){
  const e=currentDate?entryOf(currentDate):null, t=$("teacher").value.trim();
  const start=Number($("startPeriod").value)-1;   // 開始時限（0始まり）
  const segs=e?segmentsOf(e):[];
  periods=[];
  for(let i=0;i<6;i++) periods.push({subject:"",content:"",quiz:false,teacher:""});
  const plan_=[]; let pos=start, over=false;
  segs.forEach(s=>{
    const from=pos;
    for(let k=0;k<s.h;k++,pos++){
      if(pos>5){ over=true; continue; }
      periods[pos].subject=subjectName(s.name); periods[pos].teacher=t;
    }
    const to=Math.min(pos,6);
    if(from<6) plan_.push(`${subjectName(s.name)}（${s.h}H）→ ${from+1===to?to:(from+1)+"〜"+to}時限`);
  });
  let msg="";
  if(!plan.length) msg="日別計画表がまだ登録されていません。講師に登録を依頼するか、各時限の科目を手入力してください。";
  else if(!currentDate) msg="日付を指定してください。";
  else if(!e) msg="日別計画表に記載のない日です。各時限の科目と講師名を手入力してください。";
  else if(!segs.length) msg=`この日は「${e.content}」で、日別計画表では訓練時間に含まれていません（0H）。日誌が必要な場合は内容を手入力してください。`;
  else if(segs.length>1 || start>0 || pos-start<6) msg="自動で入れた時限："+plan_.join("、")+"。";
  if(over) msg+="6時限目を超える分は入りません。開始時限を確認してください。";
  $("dayMsg").textContent=msg;
  renderPeriods(); render();
}
$("startPeriod").addEventListener("change",loadDay);
$("withKind").addEventListener("change",()=>{
  const keep=periods.map(p=>({content:p.content,quiz:p.quiz,teacher:p.teacher}));
  const v=$("dateSel").value; buildDateSel(); $("dateSel").value=v;
  loadDay(); periods.forEach((p,j)=>{ if(p.subject) Object.assign(p,keep[j]); });
  renderPeriods(); render();
});

// ===== 時限入力 =====
function renderPeriods(){
  $("periods").innerHTML=periods.map((p,i)=>`
   <div class="period">
    <div class="ph">${i+1}時限目</div>
    <div class="pgrid">
     <div><label for="ps${i}">訓練科目</label><input type="text" id="ps${i}" data-i="${i}" data-k="subject" value="${esc(p.subject)}"></div>
     <div><label for="pc${i}">訓練内容（テキスト名・ページ）</label><input type="text" id="pc${i}" data-i="${i}" data-k="content" value="${esc(p.content)}" placeholder="例：Java入門 p.40〜52"></div>
     <div><label for="pt${i}">講師名</label><input type="text" id="pt${i}" data-i="${i}" data-k="teacher" value="${esc(p.teacher)}"></div>
    </div>
    <label class="chk"><input type="checkbox" data-i="${i}" data-k="quiz" ${p.quiz?"checked":""}>この時限で小テストを実施した</label>
   </div>`).join("");
}
// 講師名をコピーする先：訓練のある時限（訓練科目が入っている時限）。1つも無ければ全時限
function teacherTargets(){
  const t=periods.filter(p=>p.subject.trim());
  return t.length?t:periods;
}
// 講師名を全時限に入れる（入力中の欄のカーソルが飛ばないよう、ほかの欄の値だけ書き換える）
function copyTeacher(name, exceptEl){
  teacherTargets().forEach(p=>{ p.teacher=name; });
  periods.forEach((p,i)=>{ const el=$("pt"+i); if(el && el!==exceptEl) el.value=p.teacher; });
  if($("teacher")!==exceptEl){ $("teacher").value=name; }
  $("teacher").dataset.prev=name.trim();
}
$("periods").addEventListener("input",e=>{
  const i=e.target.dataset.i,k=e.target.dataset.k; if(i===undefined) return;
  periods[i][k]= k==="quiz" ? e.target.checked : e.target.value;
  if(k==="teacher" && $("copyTeacher").checked) copyTeacher(e.target.value, e.target);
  render();
});
$("teacher").addEventListener("input",function(){
  const nv=this.value.trim();
  if($("copyTeacher").checked){ copyTeacher(this.value, this); render(); return; }
  // チェックなし：まだ書き換えていない時限（空欄・前回の初期値のまま）にだけ入れる
  const old=this.dataset.prev||"";
  periods.forEach(p=>{ if(p.subject && (p.teacher===old||p.teacher==="")) p.teacher=nv; });
  this.dataset.prev=nv; renderPeriods(); render();
});
$("copyTeacher").addEventListener("change",function(){
  if(!this.checked) return;
  // チェックを入れたら、講師名の欄（空なら最初に入力されている時限）の名前を全時限にそろえる
  const src=$("teacher").value.trim() || (periods.find(p=>p.teacher.trim())||{teacher:""}).teacher;
  if(src){ copyTeacher(src, null); render(); }
});
$("copyDown").addEventListener("click",()=>{
  // 開始時限が1でない日もあるので、訓練のある最初の時限の内容をコピー元にする
  const src=periods.find(p=>p.subject.trim())||periods[0], c=src.content;
  periods.forEach(p=>{ if(p!==src && p.subject) p.content=c; });
  renderPeriods(); render();
});

// ===== 名簿・出欠 =====
const MAX_FILE_SIZE = 1024 * 1024; // 1MB（名簿としては十分な大きさ）
function decodeText(buf){
  // まず UTF-8（BOM 付き含む）として読み、失敗したら Shift_JIS として読む
  try{return new TextDecoder("utf-8",{fatal:true}).decode(buf);}
  catch(_){return new TextDecoder("shift_jis").decode(buf);}
}
function setRoster(names){
  students=names.map(n=>({name:n,fullDay:false,p:["","","","","",""]}));
  $("rosterMsg").textContent = students.length ? `${students.length}名を読み込みました（この画面内のみ）。` : "名前が見つかりませんでした。1行に1名で書かれているか確認してください。";
  renderMatrix(); render();
}
function parseNames(text){
  return text.replace(/^\uFEFF/,"").split(/\r?\n/)
    .map(l=>l.split(/[,\t]/)[0].replace(/^"|"$/g,"").trim())
    .filter(n=>n && !n.startsWith("#") && !["氏名","名前","受講者名"].includes(n));
}
async function loadRosterFile(f){
  if(!f) return;
  if(f.size>MAX_FILE_SIZE){$("rosterMsg").textContent="ファイルが大きすぎます。1MB 以下のテキストファイルを選んでください。";return;}
  setRoster(parseNames(decodeText(await f.arrayBuffer())));
}
async function openRoster(){
  // 対応ブラウザ（Chrome / Edge・HTTPS）では「ドキュメント」フォルダを最初に開く
  if("showOpenFilePicker" in window){
    try{
      const [handle]=await window.showOpenFilePicker({startIn:"documents",multiple:false,
        types:[{description:"名簿ファイル",accept:{"text/plain":[".txt",".csv"]}}]});
      await loadRosterFile(await handle.getFile());
    }catch(e){ if(e.name!=="AbortError") $("rosterFile").click(); }
  }else $("rosterFile").click();
}
$("rosterOpen").addEventListener("click",openRoster);
$("rosterFile").addEventListener("change",async e=>{ await loadRosterFile(e.target.files[0]); e.target.value=""; });
$("rosterApply").addEventListener("click",()=>setRoster(parseNames($("rosterText").value)));

function renderMatrix(){
  if(!students.length){$("matrix").innerHTML="";return;}
  const opt=v=>`<option value="">—</option>`+KINDS.map(k=>`<option ${v===k?"selected":""}>${k}</option>`).join("");
  $("matrix").innerHTML=`<thead><tr><th>氏名</th><th>1日欠席</th>${[1,2,3,4,5,6].map(n=>`<th>${n}限</th>`).join("")}</tr></thead><tbody>`+
   students.map((s,i)=>`<tr class="${s.fullDay?"fullday":""}"><td>${esc(s.name)}</td>
    <td><input type="checkbox" data-s="${i}" data-f="1" ${s.fullDay?"checked":""} aria-label="${esc(s.name)} 1日欠席"></td>
    ${s.p.map((v,j)=>`<td><select data-s="${i}" data-p="${j}" ${s.fullDay?"disabled":""} aria-label="${esc(s.name)} ${j+1}限">${opt(v)}</select></td>`).join("")}</tr>`).join("")+"</tbody>";
}
$("matrix").addEventListener("change",e=>{
  const i=e.target.dataset.s; if(i===undefined) return;
  if(e.target.dataset.f){students[i].fullDay=e.target.checked; renderMatrix();}
  else students[i].p[e.target.dataset.p]=e.target.value;
  render();
});
$("fullDayEach").addEventListener("change",render);

function absText(j){
  const each=$("fullDayEach").checked, out=[];
  students.forEach(s=>{
    if(s.fullDay){ if(each) out.push(`${s.name}（欠席）`); }
    else if(s.p[j]) out.push(`${s.name}（${s.p[j]}）`);
  });
  return out.length?out.join("、"):"なし";
}

// ===== プレビュー =====
function render(){
  const d=currentDate?parseDate(currentDate):null;
  const y=d?d.getFullYear()-2018:"　", m=d?d.getMonth()+1:"　", dd=d?d.getDate():"　", w=d?WD[d.getDay()]:"　";
  const v=s=>s?esc(s):`<span class="empty">（未入力）</span>`;
  const rows=periods.map((p,j)=>{
    let c=p.content; if(p.quiz) c=c?`${c}／小テスト`:"小テスト";
    return `<tr><td class="t">${j+1}</td>
      <td><span class="small">訓練科目：</span>${v(p.subject)}</td>
      <td><span class="small">訓練内容：</span>${v(c)}</td>
      <td>${v(p.teacher)}</td>
      <td>${students.length?esc(absText(j)):'<span class="empty">（名簿未読込）</span>'}</td></tr>`;
  }).join("");
  const full=students.filter(s=>s.fullDay).map(s=>s.name);
  $("paper").innerHTML=`
   <div class="yoshiki">実施様式１</div><div class="draft">下書き</div>
   <h3>訓練日誌<span>令和 ${y} 年 ${m} 月 ${dd} 日（${w}）</span></h3>
   <div class="headRow">
    <div class="meta">
     <div>訓練番号：<u>※　${esc($("kno").value)}</u></div>
     <div>訓練科名：<u>※　${esc($("kname").value)}</u></div>
    </div>
    <table class="sign"><tr><th>責任者</th><th>事務担当者</th><th>作成者</th></tr>
     <tr><td>※</td><td>※</td><td>${esc($("author").value)}</td></tr></table>
   </div>
   <table class="main">
    <tr><th>時限</th><th colspan="2">訓練科目・訓練内容</th><th class="w-teacher">講師名</th>
        <th class="w-abs">欠席・遅刻・早退・欠課者<span class="small">（当該時限を受講しなかった者を記載）</span></th></tr>
    ${rows}
   </table>
   <table class="big">
    <tr><td class="side">1日欠席者</td><td>${students.length?esc(full.length?full.join("、"):"なし"):'<span class="empty">（名簿未読込）</span>'}</td></tr>
    <tr><td class="side">受講者の<br>感想及び<br>質問欄</td><td class="kanso">${esc($("kanso").value)}</td></tr>
    <tr><td class="side">※講師の<br>所見及び<br>回答欄</td><td></td></tr>
    <tr><td class="side">※備考</td><td></td></tr>
   </table>
   <div class="notes">作成の留意事項：訓練日誌は日々の訓練終了後、受講者が輪番制でボールペン手書きにより作成してください。※の欄は受講者が記入する必要はありません。</div>`;
}

// ===== その他 =====
$("dateSel").addEventListener("change",onDateChange);
$("otherDate").addEventListener("change",onDateChange);
["author","kno","kname"].forEach(id=>$(id).addEventListener("input",render));
$("kanso").addEventListener("input",function(){$("kcount").textContent=[...this.value.replace(/\s/g,"")].length;render();});
$("printBtn").addEventListener("click",()=>window.print());
$("clearAll").addEventListener("click",()=>{
  if(!confirm("入力した内容と名簿をすべて消します。よろしいですか？")) return;
  students=[]; $("author").value=""; $("teacher").value=""; $("teacher").dataset.prev="";
  $("kanso").value=""; $("kcount").textContent="0"; $("rosterText").value="";
  $("rosterMsg").textContent="名簿を読み込むと、ここに出欠表が出ます。";
  renderMatrix(); loadDay();
});
window.addEventListener("beforeunload",e=>{
  if(students.length||$("author").value||$("kanso").value){e.preventDefault();e.returnValue="";}
});

buildDateSel(); onDateChange();
})();
