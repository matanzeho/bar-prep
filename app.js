const Q = window.QBASE.concat(window.QEXTRA);
const BANK = {}; Q.forEach(([id,c,q,o,e,s])=>{BANK[id]={id,c,q,o,e,s,a:0,part:CH[c].part}});
const LSO='barprep.official.v1';
const OFF = (()=>{ if(window.QOFFICIAL) return window.QOFFICIAL; try{const v=JSON.parse(localStorage.getItem(LSO)||'null');return (v&&Array.isArray(v.items))?v.items:[]}catch(e){return []} })();
const OFFEXP=window.OFFEXP||{};
OFF.forEach(x=>{BANK[x.id]={id:x.id,c:x.c,q:x.q,o:x.o,a:x.a,e:OFFEXP[x.id]||x.e||'',s:x.ref,part:x.part,off:true,exam:x.exam,n:x.n}});
const EXAMS = []; OFF.forEach(x=>{const k=x.exam+'|'+x.part; if(!EXAMS.includes(k)) EXAMS.push(k)});
const MODE_NAME = {sim:'סימולציה',practice:'תרגול',official:'מבחן רשמי',review:'חזרה'};
PARTS.mix={name:'חזרה מכל הפרקים',simQ:0,simMin:0};
const LS='barprep.attempts.v1', LSD='barprep.draft.v1';

// ---------- storage: JSON file on this computer (desktop app), browser storage as fallback ----------
const S={attempts:[],draft:null,mode:'local'};
function lsGet(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
async function persist(){
  const data={version:1,attempts:S.attempts,draft:S.draft};
  if(window.api){try{await window.api.save(data);return}catch(e){}}
  lsSet(LS,S.attempts); lsSet(LSD,S.draft);
}
async function initStore(){
  if(window.api){
    try{const d=await window.api.load(); if(d){S.attempts=d.attempts||[];S.draft=d.draft||null} S.mode='file';}catch(e){}
  } else { S.attempts=lsGet(LS,[]); S.draft=lsGet(LSD,null); }
  render();
}
async function saveAttempt(a){S.attempts=S.attempts.filter(x=>x.id!==a.id).concat([a]);await persist()}
async function deleteAttempt(id){S.attempts=S.attempts.filter(x=>x.id!==id);await persist()}
// ---------- helpers ----------
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function fmt(sec){sec=Math.max(0,Math.round(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return (h?h+':':'')+String(m).padStart(h?2:1,'0')+':'+String(s).padStart(2,'0')}
function fdate(t){return new Date(t).toLocaleString('he-IL',{day:'numeric',month:'numeric',year:'2-digit',hour:'2-digit',minute:'2-digit'})}
const LET=['א','ב','ג','ד'];

// ---------- state ----------
const ui={src:'all',view:'home',part:'p',chs:new Set(),count:20,onlyWrong:false,quiz:null,report:null,confirm:false,reportFilter:'all',delAsk:null};
let tick=null;

function wrongSet(){
  // questions whose most recent answer was wrong or skipped
  const last={};
  [...S.attempts].sort((a,b)=>a.startedAt-b.startedAt).forEach(a=>a.items.forEach(it=>{last[it.qid]=it.ok}));
  return new Set(Object.keys(last).filter(k=>!last[k]&&BANK[k]));
}

// ---------- spaced review ----------
// A question enters review once it is answered wrong (or skipped). It comes back 1 day later,
// then 3 days, then 7 days after each correct answer; three correct answers in a row retire it.
const DAY=86400000, STEPS=[1,3,7];
function reviewState(now=Date.now()){
  const hist={};
  [...S.attempts].sort((a,b)=>a.startedAt-b.startedAt).forEach(a=>a.items.forEach(it=>{(hist[it.qid]=hist[it.qid]||[]).push({t:a.startedAt+(a.dur||0)*1000,ok:it.ok})}));
  const due=[], waiting=[], learned=[];
  for(const id in hist){
    if(!BANK[id]) continue;
    const h=hist[id]; if(h.every(x=>x.ok)) continue;
    let k=0; for(let i=h.length-1;i>=0&&h[i].ok;i--) k++;
    if(k>=STEPS.length){learned.push(id);continue}
    const at=h[h.length-1].t+STEPS[k]*DAY;
    (at<=now?due:waiting).push({id,at});
  }
  due.sort((a,b)=>a.at-b.at);
  return {due:due.map(x=>x.id),waiting:waiting.length,learned:learned.length,next:waiting.length?Math.min(...waiting.map(x=>x.at)):null};
}

// ---------- quiz ----------
function startQuiz(opts){
  let pool;
  if(opts.mode==='review'){ pool=reviewState().due.slice(0,opts.count).map(id=>BANK[id]); }
  else if(opts.mode==='official'){ pool=OFF.filter(x=>x.exam===opts.exam&&x.part===opts.part).sort((a,b)=>a.n-b.n).map(x=>BANK[x.id]); }
  else {
  const src=opts.src||'all';
  pool=Object.values(BANK).filter(q=>q.part===opts.part&&(src==='all'||(src==='off')===!!q.off));
  if(opts.chs&&opts.chs.length) pool=pool.filter(q=>opts.chs.includes(q.c));
  if(opts.onlyWrong){const w=wrongSet();pool=pool.filter(q=>w.has(q.id))}
  pool=shuffle(pool).slice(0,opts.count);
  }
  if(!pool.length) return;
  ui.quiz={id:'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),mode:opts.mode,part:opts.part,
    chs:opts.chs||[],startedAt:Date.now(),limit:(opts.mode==='sim'||opts.mode==='official')?PARTS[opts.part].simMin*60:0,exam:opts.exam||null,
    items:pool.map(q=>({qid:q.id,order:q.off?[0,1,2,3]:shuffle([0,1,2,3]),ch:null,flag:false})),cur:0};
  ui.confirm=false; ui.view='quiz'; saveDraft(); render(); window.scrollTo(0,0);
}
let draftTimer=null;
function saveDraft(){S.draft=ui.quiz;clearTimeout(draftTimer);draftTimer=setTimeout(persist,300)}
function clearDraft(){S.draft=null}
function elapsed(){return (Date.now()-ui.quiz.startedAt)/1000}
async function submitQuiz(){
  const z=ui.quiz; if(!z) return;
  const dur=Math.min(elapsed(), z.limit||Infinity);
  const items=z.items.map(it=>{const chosen=it.ch===null?null:it.order[it.ch];return {qid:it.qid,c:BANK[it.qid].c,chosen,ok:chosen===BANK[it.qid].a,order:it.order}});
  const correct=items.filter(i=>i.ok).length;
  const a={kind:'attempt',id:z.id,mode:z.mode,exam:z.exam,part:z.part,chs:z.chs,startedAt:z.startedAt,dur:Math.round(dur),total:items.length,correct,score:Math.round(correct/items.length*100),items};
  ui.quiz=null; clearDraft(); clearInterval(tick);
  await saveAttempt(a);
  ui.report=a; ui.reportFilter='all'; ui.view='report'; ui.celebrate=a.score>70; render(); window.scrollTo(0,0);
}

// ---------- rendering ----------
function render(){
  clearInterval(tick);
  const app=$('#app');
  if(ui.view==='quiz') app.innerHTML=viewQuiz();
  else if(ui.view==='report') app.innerHTML=viewReport(ui.report);
  else app.innerHTML=viewHome();
  if(ui.view==='quiz'){tick=setInterval(updTimer,1000);updTimer()}
}
function header(){
  const st=S.mode==='file'?'ההיסטוריה נשמרת במחשב הזה':'ההיסטוריה נשמרת במכשיר הזה';
  const bk=true?`<div class="row" style="justify-content:flex-end;margin-top:4px"><button class="link" id="exp">גיבוי לקובץ</button><button class="link" id="imp">שחזור מגיבוי</button></div>`:'';
  return `<header class="top"><div><h1>מתרגלת לשכה</h1><p class="sub">הכנה לבחינת ההסמכה של לשכת עורכי הדין · ${Object.keys(BANK).length} שאלות</p></div><div class="store">${st}${bk}${ui.msg?`<div class="msg">${esc(ui.msg)}</div>`:''}</div></header>`;
}
function viewHome(){
  const A=[...S.attempts].sort((a,b)=>b.startedAt-a.startedAt);
  const draft=S.draft;
  const avg=A.length?Math.round(A.reduce((s,a)=>s+a.score,0)/A.length):null;
  const totQ=A.reduce((s,a)=>s+a.total,0), totT=A.reduce((s,a)=>s+a.dur,0);
  // per chapter accuracy
  const per={}; A.forEach(a=>a.items.forEach(i=>{if(!CH[i.c])return;(per[i.c]=per[i.c]||{n:0,ok:0}).n++; if(i.ok)per[i.c].ok++}));
  const pc=Object.keys(CH).filter(c=>CH[c].part===ui.part);
  const counts={}; Object.values(BANK).filter(q=>ui.src==='all'||(ui.src==='off')===!!q.off).forEach(q=>{counts[q.c]=(counts[q.c]||0)+1});
  const wrongN=[...wrongSet()].filter(id=>BANK[id].part===ui.part&&(ui.src==='all'||(ui.src==='off')===!!BANK[id].off)&&(!ui.chs.size||ui.chs.has(BANK[id].c))).length;
  const poolN=Object.values(BANK).filter(q=>q.part===ui.part&&(ui.src==='all'||(ui.src==='off')===!!q.off)&&(!ui.chs.size||ui.chs.has(q.c))).length;
  let h=header();
  if(draft&&draft.items){h+=`<section class="card"><div class="row" style="justify-content:space-between"><div><b>יש מבחן פתוח</b><div class="note">${PARTS[draft.part].name} · ${draft.items.length} שאלות · התחלת ב-${fdate(draft.startedAt)}</div></div><div class="row"><button class="btn" id="resume">להמשיך</button><button class="btn ghost" id="dropdraft">לבטל אותו</button></div></div></section>`}
  h+=`<section class="tiles">
    <div class="tile"><b>${A.length}</b><span>מבחנים שהוגשו</span></div>
    <div class="tile"><b>${avg===null?'—':avg}</b><span>ציון ממוצע</span></div>
    <div class="tile"><b>${A.length?A[0].score:'—'}</b><span>ציון אחרון</span></div>
    <div class="tile"><b>${totQ?fmt(totT):'—'}</b><span>זמן תרגול כולל · ${totQ} שאלות</span></div>
  </section>`;
  const rv=reviewState();
  h+=`<section class="card"><div class="row" style="justify-content:space-between"><div><h2 style="margin:0">חזרה יומית</h2>
    <p class="note" style="margin:4px 0 0">${rv.due.length?`<b>${rv.due.length}</b> שאלות שטעית בהן מחכות לחזרה היום.`:(rv.waiting?`אין חזרה להיום. החזרה הבאה: ${new Date(rv.next).toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'numeric'})}.`:'שאלות שתטעי בהן יחזרו אלייך אחרי יום, 3 ימים ושבוע, עד שתעני עליהן נכון שלוש פעמים ברצף.')}${rv.waiting||rv.learned?` · ${rv.waiting} בתהליך · ${rv.learned} נלמדו`:''}</p></div>
    ${rv.due.length?`<button class="btn" id="review">לחזרה${rv.due.length>20?' (20 ראשונות)':''}</button>`:''}</div></section>`;
  h+=`<section><h2>סימולציה בתנאי בחינה</h2><div class="sims">
    <div class="sim"><b>חלק ב׳ · דין דיוני</b><small>40 שאלות, 100 דקות, הגשה אוטומטית בתום הזמן</small><button class="btn" data-sim="p">להתחיל סימולציה</button></div>
    <div class="sim"><b>חלק ג׳ · דין מהותי</b><small>40 שאלות, 160 דקות, הגשה אוטומטית בתום הזמן</small><button class="btn" data-sim="s">להתחיל סימולציה</button></div>
  </div></section>`;
  if(!EXAMS.length){h+=`<section class="card"><h2>מבחני לשכה רשמיים</h2><p class="note" style="margin:0 0 10px">מבחני הלשכה לא נכללים באפליקציה עצמה. כדי להוסיף אותם, טעני פעם אחת את הקובץ bar-official-exams.json שקיבלת. הם יישמרו במכשיר הזה בלבד.</p><button class="btn" id="loadoff">טעינת קובץ מבחנים</button></section>`}
  if(EXAMS.length){h+=`<section><h2>מבחני לשכה רשמיים</h2><p class="note" style="margin:0 0 8px">השאלות בסדר המקורי, עם מפתח התשובות של הלשכה. לשימוש אישי בלבד.</p><div class="sims">${EXAMS.map(k=>{const [ex,p]=k.split('|');const done=A.filter(a=>a.mode==='official'&&a.exam===ex&&a.part===p);const best=done.length?Math.max(...done.map(a=>a.score)):null;return `<div class="sim"><b>${ex} · חלק ${p==='p'?'ב׳':'ג׳'} · ${PARTS[p].name}</b><small>${(()=>{const n=OFF.filter(x=>x.exam===ex&&x.part===p).length;return n+' שאלות'+(n<40?' (שאלה שנפסלה בידי הלשכה הוצאה)':'')})()}, ${PARTS[p].simMin} דקות${best!==null?` · הציון הטוב שלך: ${best}`:''}</small><button class="btn" data-off="${k}">${done.length?'לפתור שוב':'לפתור'}</button></div>`}).join('')}</div></section>`}
  h+=`<section class="card"><h2>תרגול לפי פרקים</h2>
    <div class="seg" role="group" aria-label="חלק">${['p','s'].map(p=>`<button class="chip" id="part-${p}" data-part="${p}" aria-pressed="${ui.part===p}">${PARTS[p].name}</button>`).join('')}</div>
    <div class="lbl">פרקים (בלי בחירה = כל הפרקים)</div>
    <div class="seg">${pc.map(c=>`<button class="chip" id="ch-${c}" data-ch="${c}" aria-pressed="${ui.chs.has(c)}">${CH[c].name} · ${counts[c]||0}</button>`).join('')}</div>
    ${OFF.length?`<div class="lbl">מקור השאלות</div><div class="seg">${[['all','הכול'],['own','מאגר מקורי'],['off','מבחני לשכה']].map(([k,l])=>`<button class="chip" id="src-${k}" data-src="${k}" aria-pressed="${ui.src===k}">${l}</button>`).join('')}</div>`:''}
    <div class="lbl">מספר שאלות</div>
    <div class="seg">${[10,20,40].map(n=>`<button class="chip" id="cnt-${n}" data-cnt="${n}" aria-pressed="${ui.count===n}">${n}</button>`).join('')}<button class="chip" id="cnt-all" data-cnt="999" aria-pressed="${ui.count===999}">כולן</button></div>
    <div class="lbl">אילו שאלות</div>
    <div class="seg"><button class="chip" id="ow-0" data-ow="0" aria-pressed="${!ui.onlyWrong}">כל השאלות · ${poolN}</button><button class="chip" id="ow-1" data-ow="1" aria-pressed="${ui.onlyWrong}" ${wrongN?'':'disabled'}>רק שאלות שטעיתי בהן · ${wrongN}</button></div>
    <div class="row" style="margin-top:16px"><button class="btn" id="go" ${(ui.onlyWrong?wrongN:poolN)?'':'disabled'}>להתחיל תרגול</button><span class="note">הטיימר מתחיל עם תחילת התרגול. הדוח והציון מוצגים בהגשה.</span></div>
  </section>`;
  // chapter stats
  const statCh=Object.keys(CH).filter(c=>per[c]);
  h+=`<section class="card"><h2>הצלחה לפי פרק</h2>${statCh.length?`<div class="bars">${statCh.sort((a,b)=>per[a].ok/per[a].n-per[b].ok/per[b].n).map(c=>{const p=Math.round(per[c].ok/per[c].n*100);return `<div class="bar"><span>${CH[c].name}</span><span class="t"><i class="${p<60?'low':''}" style="width:${p}%"></i></span><span class="v">${p}%</span></div>`}).join('')}</div><p class="note">ממוין מהחלש לחזק. פרקים מתחת ל-60% מסומנים באדום.</p>`:`<p class="empty">הנתונים יופיעו כאן אחרי התרגול הראשון.</p>`}</section>`;
  h+=`<section class="card"><h2>מבחנים שעשית</h2>${A.length?`<div class="tbl"><table><thead><tr><th>תאריך</th><th>סוג</th><th>חלק</th><th>ציון</th><th>נכונות</th><th>זמן</th><th></th></tr></thead><tbody>${A.map(a=>`<tr><td>${fdate(a.startedAt)}</td><td>${MODE_NAME[a.mode]||'תרגול'}${a.exam?' '+a.exam:''}</td><td>${PARTS[a.part].name}</td><td class="num"><span class="pill ${a.score>=60?'pass':'fail'}">${a.score}</span></td><td class="num">${a.correct}/${a.total}</td><td class="num">${fmt(a.dur)}</td><td><button class="link" data-open="${a.id}">לדוח</button></td></tr>`).join('')}</tbody></table></div>`:`<p class="empty">עוד לא הוגש מבחן. כל מבחן שתגישי יישמר כאן עם הציון, הזמן והדוח המלא.</p>`}</section>`;
  h+=`<section class="note">השאלות במאגר מקוריות ונכתבו בסגנון הבחינה. לכל שאלה יש הסבר והפניה לסעיף. כדאי לפתור גם את הבחינות הרשמיות שהלשכה מפרסמת: <a href="https://www.israelbar.org.il" target="_blank" rel="noopener" class="ext">אתר לשכת עורכי הדין</a>.</section>`;
  return h;
}
function viewQuiz(){
  const z=ui.quiz, it=z.items[z.cur], q=BANK[it.qid];
  const ans=z.items.filter(i=>i.ch!==null).length;
  let h=`<div class="qbar"><div><div class="meta">${MODE_NAME[z.mode]||'תרגול'}${z.exam?' '+z.exam:''} · ${PARTS[z.part].name}</div><div class="meta">נענו ${ans} מתוך ${z.items.length}</div></div><div style="text-align:left"><div class="meta">${z.limit?'זמן שנותר':'זמן מתחילת המבחן'}</div><div class="timer" id="timer">0:00</div></div></div>`;
  h+=`<div class="card"><div class="row" style="justify-content:space-between"><span class="tag">שאלה ${z.cur+1} מתוך ${z.items.length} · ${q.off&&z.mode!=='official'?`מבחן ${q.exam}, שאלה ${q.n} · `:''}${CH[q.c].name}</span><button class="chip" id="flag" aria-pressed="${it.flag}">${it.flag?'מסומנת לבדיקה':'לסמן לבדיקה'}</button></div>
  <p class="qtext">${esc(q.q)}</p><div class="opts">${it.order.map((oi,k)=>`<button class="opt" id="opt-${k}" data-opt="${k}" aria-pressed="${it.ch===k}"><span class="k">${LET[k]}</span><span>${esc(q.o[oi])}</span></button>`).join('')}</div>
  <div class="qnav"><button class="btn ghost" id="prev" ${z.cur?'':'disabled'}>הקודמת</button>${z.cur<z.items.length-1?`<button class="btn" id="next">הבאה</button>`:`<button class="btn" id="ask">להגיש</button>`}</div></div>`;
  h+=`<div class="nav" aria-label="מעבר בין שאלות">${z.items.map((x,i)=>`<button data-go="${i}" class="${x.ch!==null?'ans':''} ${i===z.cur?'cur':''} ${x.flag?'flag':''}">${i+1}</button>`).join('')}</div>`;
  if(ui.confirm){const un=z.items.length-ans, fl=z.items.filter(i=>i.flag).length;
    h+=`<div class="confirm"><b>להגיש את המבחן?</b><p class="note">${un?`${un} שאלות לא נענו ויחושבו כשגויות. `:'ענית על כל השאלות. '}${fl?`${fl} שאלות מסומנות לבדיקה.`:''}</p><div class="row"><button class="btn" id="submit">להגיש ולראות דוח</button><button class="btn ghost" id="cancel">לחזור למבחן</button></div></div>`}
  else h+=`<div class="row" style="margin-top:14px;justify-content:space-between"><button class="btn ghost" id="ask2">להגיש עכשיו</button><button class="link" id="quit">לצאת בלי להגיש</button></div>`;
  return h;
}
function updTimer(){
  const z=ui.quiz; if(!z) return; const el=$('#timer'); if(!el) return;
  const e=elapsed();
  if(z.limit){const left=z.limit-e; el.textContent=fmt(left); el.classList.toggle('hot',left<600); if(left<=0) submitQuiz();}
  else el.textContent=fmt(e);
}
function viewCelebrate(score){
  return `<div class="cele" id="cele" role="dialog" aria-modal="true" aria-labelledby="cele-t"><div class="cele-box">
    <div class="cele-heart" aria-hidden="true">❤</div>
    <p id="cele-t" class="cele-t">כל הכבוד פיצית שלי<br>אני גאה בך</p>
    <p class="cele-s">ציון ${score} בתרגול הזה</p>
    <button class="btn" id="cele-close">תודה ❤</button></div></div>`;
}
function viewReport(a){
  const per={}; a.items.forEach(i=>{(per[i.c]=per[i.c]||{n:0,ok:0}).n++; if(i.ok)per[i.c].ok++});
  const skipped=a.items.filter(i=>i.chosen===null).length;
  let h=(ui.celebrate?viewCelebrate(a.score):'')+header();
  h+=`<section class="card"><div class="score"><div class="big">${a.score}</div><div><span class="pill ${a.score>=60?'pass':'fail'}">${a.score>=60?'מעל ציון המעבר':'מתחת לציון המעבר'}</span><div class="note" style="margin-top:6px">${a.correct} נכונות מתוך ${a.total}${skipped?` · ${skipped} לא נענו`:''} · זמן ${fmt(a.dur)} · ${MODE_NAME[a.mode]||'תרגול'}${a.exam?' '+a.exam:''} ${PARTS[a.part].name} · ${fdate(a.startedAt)}</div><div class="note">ממוצע ${a.total?fmt(a.dur/a.total):'—'} לשאלה${a.mode!=='practice'?` (בבחינה: ${fmt(PARTS[a.part].simMin*60/40)} לשאלה)`:''}</div></div></div>
  <div class="bars" style="margin-top:16px">${Object.keys(per).map(c=>{const p=Math.round(per[c].ok/per[c].n*100);return `<div class="bar"><span>${CH[c]?CH[c].name:c}</span><span class="t"><i class="${p<60?'low':''}" style="width:${p}%"></i></span><span class="v">${per[c].ok}/${per[c].n}</span></div>`}).join('')}</div>
  <div class="row" style="margin-top:16px"><button class="btn" id="home">חזרה למסך הראשי</button>${ui.delAsk===a.id?`<span class="note">למחוק את המבחן מההיסטוריה?</span><button class="btn danger" id="del">למחוק</button><button class="btn ghost" id="nodel">לא</button>`:`<button class="btn ghost" id="askdel">למחוק מההיסטוריה</button>`}</div></section>`;
  h+=`<section class="card"><div class="row" style="justify-content:space-between"><h2>פירוט התשובות</h2><div class="seg"><button class="chip" id="rf-all" data-rf="all" aria-pressed="${ui.reportFilter==='all'}">הכול</button><button class="chip" id="rf-bad" data-rf="bad" aria-pressed="${ui.reportFilter==='bad'}">רק טעויות</button></div></div>`;
  a.items.forEach((it,n)=>{const q=BANK[it.qid]; if(!q) return; if(ui.reportFilter==='bad'&&it.ok) return;
    const order=it.order||[0,1,2,3];
    h+=`<div class="rq"><span class="tag ${it.ok?'ok':it.chosen===null?'skip':'no'}">${n+1} · ${it.ok?'נכון':it.chosen===null?'לא נענתה':'שגוי'} · ${CH[q.c].name}</span><p class="qtext">${esc(q.q)}</p>
    ${order.map((oi,k)=>{const cls=oi===q.a?'right':(oi===it.chosen?'wrong':'');return `<div class="o ${cls}">${LET[k]}. ${esc(q.o[oi])}${oi===q.a?(q.off?' · תשובת הלשכה':' · התשובה הנכונה'):oi===it.chosen?' · התשובה שלך':''}</div>`}).join('')}
    ${q.off&&q.e?`<div class="exp"><span class="tag">הסבר (לא רשמי, נכתב בידי Claude)</span><br>${esc(q.e)}</div>`:''}${q.off?`<div class="src">מבחן הלשכה ${esc(q.exam)}, חלק ${q.part==='p'?'ב׳':'ג׳'}, שאלה ${q.n} · סימוכין לפי מפתח הלשכה: ${esc(q.s)}</div>`:`<div class="exp">${esc(q.e)}</div><div class="src">מקור: ${esc(q.s)}</div>`}</div>`});
  h+=`</section>`;
  return h;
}

// ---------- events ----------
document.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return; const d=b.dataset;
  if(d.part){ui.part=d.part;ui.chs.clear();ui.onlyWrong=false;render()}
  else if(d.ch){ui.chs.has(d.ch)?ui.chs.delete(d.ch):ui.chs.add(d.ch);render()}
  else if(d.cnt){ui.count=+d.cnt;render()}
  else if(d.ow){ui.onlyWrong=d.ow==='1';render()}
  else if(d.sim){startQuiz({mode:'sim',part:d.sim,count:PARTS[d.sim].simQ})}
  else if(b.id==='review'){startQuiz({mode:'review',part:'mix',count:20})}
  else if(b.id==='go'){startQuiz({mode:'practice',part:ui.part,chs:[...ui.chs],count:ui.count,onlyWrong:ui.onlyWrong,src:ui.src})}
  else if(d.src){ui.src=d.src;render()}
  else if(d.off){const [ex,p]=d.off.split('|');startQuiz({mode:'official',part:p,exam:ex,count:40})}
  else if(b.id==='resume'){ui.quiz=JSON.parse(JSON.stringify(S.draft));ui.quiz.cur=ui.quiz.cur||0;ui.view='quiz';ui.confirm=false;render()}
  else if(b.id==='dropdraft'){clearDraft();persist();render()}
  else if(d.opt!==undefined){const it=ui.quiz.items[ui.quiz.cur];it.ch=+d.opt;saveDraft();render()}
  else if(b.id==='flag'){const it=ui.quiz.items[ui.quiz.cur];it.flag=!it.flag;saveDraft();render()}
  else if(b.id==='prev'){ui.quiz.cur--;saveDraft();render();window.scrollTo(0,0)}
  else if(b.id==='next'){ui.quiz.cur++;saveDraft();render();window.scrollTo(0,0)}
  else if(d.go!==undefined){ui.quiz.cur=+d.go;saveDraft();render();window.scrollTo(0,0)}
  else if(b.id==='ask'||b.id==='ask2'){ui.confirm=true;render()}
  else if(b.id==='cancel'){ui.confirm=false;render()}
  else if(b.id==='submit'){submitQuiz()}
  else if(b.id==='quit'){ui.view='home';render()}
  else if(d.open){ui.celebrate=false;ui.report=S.attempts.find(a=>a.id===d.open);ui.reportFilter='all';ui.delAsk=null;ui.view='report';render();window.scrollTo(0,0)}
  else if(d.rf){ui.reportFilter=d.rf;render()}
  else if(b.id==='cele-close'){ui.celebrate=false;render()}
  else if(b.id==='home'){ui.view='home';ui.delAsk=null;render();window.scrollTo(0,0)}
  else if(b.id==='askdel'){ui.delAsk=ui.report.id;render()}
  else if(b.id==='nodel'){ui.delAsk=null;render()}
  else if(b.id==='exp'){const data={version:1,attempts:S.attempts};
    if(window.api){window.api.exportData(data).then(r=>{ui.msg=r?'הגיבוי נשמר':'';render()})}
    else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.download='bar-prep-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();ui.msg='הגיבוי נשמר בתיקיית ההורדות';render()}}
  else if(b.id==='imp'&&!window.api){const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';inp.onchange=()=>{const f=inp.files[0];if(!f)return;f.text().then(t=>JSON.parse(t)).then(async d=>{if(!d||!Array.isArray(d.attempts))throw 0;const ids=new Set(S.attempts.map(a=>a.id));d.attempts.forEach(a=>{if(a&&a.id&&!ids.has(a.id))S.attempts.push(a)});await persist();ui.msg='הגיבוי שוחזר';render()}).catch(()=>{ui.msg='הקובץ אינו גיבוי תקין';render()})};inp.click()}
  else if(b.id==='imp'){window.api.importData().then(async d=>{if(!d)return;const ids=new Set(S.attempts.map(a=>a.id));(d.attempts||[]).forEach(a=>{if(a&&a.id&&!ids.has(a.id))S.attempts.push(a)});await persist();ui.msg='הגיבוי שוחזר';render()}).catch(()=>{ui.msg='הקובץ אינו גיבוי תקין';render()})}
  else if(b.id==='loadoff'){const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';inp.onchange=()=>{const f=inp.files[0];if(!f)return;f.text().then(t=>JSON.parse(t)).then(d=>{if(!d||d.kind!=='barprep-official'||!Array.isArray(d.items))throw 0;localStorage.setItem(LSO,JSON.stringify(d));location.reload()}).catch(()=>{ui.msg='זה לא קובץ המבחנים הנכון';render()})};inp.click()}
  else if(b.id==='del'){deleteAttempt(ui.report.id).then(()=>{ui.delAsk=null;ui.view='home';render()})}
});
render(); initStore();
