// v3.2 Firebase-ready with graceful fallback
const firebaseConfig = {
  apiKey: "AIzaSyDT9q9PRQMeE-wwezchzgr6G0rbigpD2pc",
  authDomain: "car-reserve-c4baf.firebaseapp.com",
  projectId: "car-reserve-c4baf",
  storageBucket: "car-reserve-c4baf.appspot.com",
  messagingSenderId: "585548778871",
  appId: "1:585548778871:web:bf2a260f6d654ae9772572",
  measurementId: "G-YTPXXHNLRV"
};

export const HOUSEHOLD_ID = "4eviti4w5xna4iir";

const $ = (s)=>document.querySelector(s);
const pad = (n)=>n.toString().padStart(2,'0');
const banner = $("#banner");

function tzOffsetStr(d = new Date()){
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  return `${sign}${pad(Math.floor(abs/60))}:${pad(abs%60)}`;
}
function attachOffset(localNoOffset){ return localNoOffset ? `${localNoOffset}:00${tzOffsetStr()}` : ''; }
function toDate(iso){ return new Date(iso); }
function monthTitle(d){ return `${d.getFullYear()}年 ${d.getMonth()+1}月`; }
function dayRange(date){
  const s = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0,0,0,0);
  const e = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23,59,59,999);
  return [s,e];
}
function weekRange(base = new Date()){
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const w = d.getDay();
  const s = new Date(d); s.setDate(d.getDate()-w);
  const e = new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999);
  return [s,e];
}
function monthRange(base = new Date()){
  const s = new Date(base.getFullYear(), base.getMonth(), 1, 0,0,0,0);
  const e = new Date(base.getFullYear(), base.getMonth()+1, 0, 23,59,59,999);
  return [s,e];
}
function escapeHTML(str){ return (str||'').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function colorForOwner(owner){
  const base = owner || 'default';
  let h = 0;
  for(let i=0;i<base.length;i++) h = (h*31 + base.charCodeAt(i)) % 360;
  return `hsl(${h} 65% 45%)`;
}

const LS_KEY = 'car-reservations-v3';
function lsLoad(){ try{ const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : []; } catch(e){ console.error(e); return []; } }
function lsSave(list){ localStorage.setItem(LS_KEY, JSON.stringify(list)); }

function isConfigFilled(cfg){
  return cfg && Object.values(cfg).every(v => typeof v === 'string' && v.trim() && !v.includes('PASTE_YOUR_'));
}
function canUseFirebase(){
  const httpsOk = location.protocol === 'https:' || location.hostname === 'localhost';
  return httpsOk && isConfigFilled(firebaseConfig);
}

const store = (function(){
  if(canUseFirebase()){
    return firebaseStore();
  }else{
    return localStore();
  }
})();

function localStore(){
  let cache = lsLoad();
  return {
    mode: 'local',
    subscribe(cb){ cb(cache); return ()=>{}; },
    upsert(data){
      const i = cache.findIndex(x=>x.id===data.id);
      if(i>=0) cache[i]=data; else cache.push(data);
      lsSave(cache); return Promise.resolve();
    },
    remove(id){
      cache = cache.filter(x=>x.id!==id); lsSave(cache); return Promise.resolve();
    },
    export(){ return Promise.resolve(cache.slice()); },
    import(list){ cache = list.slice(); lsSave(cache); return Promise.resolve(); }
  };
}

function firebaseStore(){
  let unsub = null;
  let api = {
    mode: 'firebase',
    async subscribe(cb){
      // ここで必要モジュールをまとめて読み込み（app / firestore / auth）
      // 3つ目に auth を読み込み
      const [appMod, fsMod, authMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js"),
        import("https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js"),
      ]);
      const { initializeApp } = appMod;
      const { getFirestore, enableIndexedDbPersistence, ... } = fsMod;
      const { getAuth, signInAnonymously } = authMod;
      
      const app = initializeApp(firebaseConfig);
      const db  = getFirestore(app);
      
      // ★これが必須
      


      // 匿名ログイン（ルールで request.auth != null を満たすため）
      try {
        const auth = getAuth(app);
        await signInAnonymously(auth);
      } catch (e) {
        console.warn('Anonymous sign-in failed:', e);
      }

      // オフライン時も読み取りをキャッシュ
      try { await enableIndexedDbPersistence(db); } catch(e) {}

      // households/{HOUSEHOLD_ID}/reservations をリアルタイム購読
      const col = collection(db, 'households', HOUSEHOLD_ID, 'reservations');
      unsub = onSnapshot(query(col, orderBy('startISO')), (snap)=>{
        const arr = [];
        snap.forEach(docSnap => arr.push(docSnap.data()));
        cb(arr);
      });

      api._fs = { db, collection, doc, setDoc, deleteDoc, col };
      return () => { unsub && unsub(); };
    },
    async upsert(data){
      const { db, doc, setDoc } = api._fs;
      const ref = doc(db, 'households', HOUSEHOLD_ID, 'reservations', data.id);
      await setDoc(ref, data, { merge:true });
    },
    async remove(id){
      const { db, doc, deleteDoc } = api._fs;
      const ref = doc(db, 'households', HOUSEHOLD_ID, 'reservations', id);
      await deleteDoc(ref);
    },
    async export(){ return currentState.reservations.slice(); },
    async import(list){
      const { db, doc, setDoc } = api._fs;
      for (const r of list) {
        await setDoc(doc(db,'households',HOUSEHOLD_ID,'reservations', r.id), r, {merge:true});
      }
    }
  };
  return api;
}


let currentState = {
  ym: (()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  reservations: [],
  listMode: 'today',
};
function render(){
  $('#monthTitle').textContent = monthTitle(currentState.ym);
  renderList();
  renderCalendar();
}
function renderList(){
  const body = $('#listBody'); body.innerHTML = '';
  let range;
  if(currentState.listMode==='today') range = dayRange(new Date());
  else if(currentState.listMode==='week') range = weekRange(new Date());
  else range = monthRange(new Date());
  const [rs,re] = range;
  const items = currentState.reservations
    .filter(r => (toDate(r.startISO) < re) && (rs < toDate(r.endISO)))
    .sort((a,b)=> toDate(a.startISO) - toDate(b.startISO));
  if(items.length===0){
    const div = document.createElement('div'); div.className='list-empty';
    div.textContent = (currentState.listMode==='today') ? '本日の予約はありません。' :
                      (currentState.listMode==='week') ? '今週の予約はありません。' : '今月の予約はありません。';
    body.appendChild(div); return;
  }
  const section=document.createElement('div'); const h3=document.createElement('h3');
  h3.textContent=(currentState.listMode==='today')?'本日の予約':(currentState.listMode==='week')?'今週の予約':'今月の予約';
  section.appendChild(h3);
  const ul=document.createElement('ul'); ul.className='res-list';
  for(const r of items){
    const li=document.createElement('li'); li.className='res-item'; li.dataset.id=r.id;
    li.addEventListener('click', ()=> openDialogForEdit(r.id));
    const s=toDate(r.startISO), e=toDate(r.endISO);
    const time=document.createElement('div'); time.className='time';
    const label=r.allDay?`${s.getMonth()+1}/${s.getDate()}〜${e.getMonth()+1}/${e.getDate()}`:`${s.getMonth()+1}/${s.getDate()} ${pad(s.getHours())}:${pad(s.getMinutes())}–${pad(e.getHours())}:${pad(e.getMinutes())}`;
    time.textContent=label;
    const meta=document.createElement('div'); meta.className='meta'; meta.innerHTML=`<span class="owner">${escapeHTML(r.owner||'')}</span>・<span class="note">${escapeHTML(r.note||'')}</span>`;
    li.appendChild(time); li.appendChild(meta); ul.appendChild(li);
  }
  section.appendChild(ul); body.appendChild(section);
}
function renderCalendar(){
  const grid = $('#calendarGrid'); grid.innerHTML='';
  const y=currentState.ym.getFullYear(), m=currentState.ym.getMonth();
  const first=new Date(y,m,1); const startDay=first.getDay(); const lastDate=new Date(y,m+1,0).getDate();
  for(let i=0;i<startDay;i++){ const cell=document.createElement('div'); cell.className='day is-empty'; grid.appendChild(cell); }
  const today=new Date();
  const isSame=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
  const monthStart=new Date(y,m,1,0,0,0,0); const monthEnd=new Date(y,m+1,0,23,59,59,999);
  const byDate=new Map();
  for(const r of currentState.reservations){
    const rs=toDate(r.startISO), re=toDate(r.endISO);
    if(!((rs < monthEnd) && (monthStart < re))) continue;
    let cur=new Date(Math.max(rs, monthStart)); cur.setHours(0,0,0,0);
    const last=new Date(Math.min(re, monthEnd)); last.setHours(0,0,0,0);
    while(cur<=last){
      const key=`${cur.getFullYear()}-${pad(cur.getMonth()+1)}-${pad(cur.getDate())}`;
      if(!byDate.has(key)) byDate.set(key, []);
      const isStart=cur.getFullYear()===rs.getFullYear()&&cur.getMonth()===rs.getMonth()&&cur.getDate()===rs.getDate();
      const isEnd=cur.getFullYear()===re.getFullYear()&&cur.getMonth()===re.getMonth()&&cur.getDate()===re.getDate();
      byDate.get(key).push({ r, isStart, isEnd });
      cur.setDate(cur.getDate()+1);
    }
  }
  for(let d=1; d<=lastDate; d++){
    const cell=document.createElement('div'); cell.className='day';
    const thisDate=new Date(y,m,d); if(isSame(thisDate, today)) cell.classList.add('is-today');
    const num=document.createElement('div'); num.className='num'; num.textContent=d; cell.appendChild(num);
    const key=`${y}-${pad(m+1)}-${pad(d)}`; const items=byDate.get(key)||[];
    const maxBars=2;
    for(let i=0;i<Math.min(maxBars, items.length); i++){
      const it=items[i]; const bar=document.createElement('div'); bar.className='event-bar';
      if(it.isStart) bar.classList.add('event-left'); if(it.isEnd) bar.classList.add('event-right');
      bar.style.background=colorForOwner(it.r.owner); bar.title=`${it.r.owner||''} ${it.r.note||''}`;
      const span=document.createElement('span'); span.className='event-label'; span.textContent=(it.r.note||it.r.owner||'').slice(0,12);
      bar.appendChild(span); bar.addEventListener('click',(e)=>{ e.stopPropagation(); openDialogForEdit(it.r.id); }); cell.appendChild(bar);
    }
    if(items.length>maxBars){ const more=document.createElement('div'); more.className='more-indicator'; more.textContent=`+${items.length-maxBars} 件`; cell.appendChild(more); }
    const btn=document.createElement('button'); btn.className='new'; btn.textContent='予約';
    btn.addEventListener('click', ()=> openDialogForCreate(`${y}-${pad(m+1)}-${pad(d)}`));
    cell.appendChild(btn); grid.appendChild(cell);
  }
}

const dlg = $('#dlg');
const inAllDay = $('#inAllDay');
const inStartDate = $('#inStartDate');
const inEndDate = $('#inEndDate');
const inStartDT = $('#inStartDT');
const inEndDT = $('#inEndDT');
const inOwner = $('#inOwner');
const inNote = $('#inNote');
const errBox = $('#errBox');
let editId = null;

function openDialogForCreate(ymd){
  editId = null;
  $('#dlgTitle').textContent='予約を作成';
  $('#btnDelete').style.display='none';
  errBox.classList.add('hidden'); errBox.textContent='';
  inOwner.value='Haruku'; inNote.value='';
  inAllDay.checked = true;
  $('#rowDates').classList.remove('hidden');
  $('#rowDateTimes').classList.add('hidden');
  const base = ymd || `${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}-${pad(new Date().getDate())}`;
  inStartDate.value = base; inEndDate.value = base;
  inStartDT.value = `${base}T09:00`; inEndDT.value = `${base}T12:00`;
  dlg.style.display='flex';
}
function openDialogForEdit(id){
  const r = currentState.reservations.find(x=>x.id===id); if(!r) return;
  editId = id;
  $('#dlgTitle').textContent='予約を編集';
  $('#btnDelete').style.display='inline-block';
  errBox.classList.add('hidden'); errBox.textContent='';
  inOwner.value = r.owner||''; inNote.value = r.note||'';
  const s = toDate(r.startISO), e = toDate(r.endISO);
  if(r.allDay){
    inAllDay.checked = true;
    $('#rowDates').classList.remove('hidden');
    $('#rowDateTimes').classList.add('hidden');
    inStartDate.value = `${s.getFullYear()}-${pad(s.getMonth()+1)}-${pad(s.getDate())}`;
    inEndDate.value   = `${e.getFullYear()}-${pad(e.getMonth()+1)}-${pad(e.getDate())}`;
  }else{
    inAllDay.checked = false;
    $('#rowDates').classList.add('hidden');
    $('#rowDateTimes').classList.remove('hidden');
    inStartDT.value = `${s.getFullYear()}-${pad(s.getMonth()+1)}-${pad(s.getDate())}T${pad(s.getHours())}:${pad(s.getMinutes())}`;
    inEndDT.value   = `${e.getFullYear()}-${pad(e.getMonth()+1)}-${pad(e.getDate())}T${pad(e.getHours())}:${pad(e.getMinutes())}`;
  }
  dlg.style.display='flex';
}
inAllDay.addEventListener('change', ()=>{
  if(inAllDay.checked){ $('#rowDates').classList.remove('hidden'); $('#rowDateTimes').classList.add('hidden'); }
  else{ $('#rowDates').classList.add('hidden'); $('#rowDateTimes').classList.remove('hidden'); }
});
function closeDialog(){ dlg.style.display='none'; }
function showError(msg){ errBox.textContent=msg; errBox.classList.remove('hidden'); }
$('#btnCancel').addEventListener('click', closeDialog);
$('#btnNew').addEventListener('click', ()=> openDialogForCreate());

function newId(){ return 'r-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function overlap(aS,aE,bS,bE){ return (aS<bE) && (bS<aE); }

$('#btnSave').addEventListener('click', async ()=>{
  const owner = inOwner.value.trim();
  const note = inNote.value.trim();
  const allDay = inAllDay.checked;
  let startISO, endISO;
  if(allDay){
    if(!inStartDate.value || !inEndDate.value) return showError('開始日／終了日を入力してください。');
    startISO = attachOffset(`${inStartDate.value}T00:00`);
    endISO   = attachOffset(`${inEndDate.value}T23:59`);
  }else{
    if(!inStartDT.value || !inEndDT.value) return showError('開始日時／終了日時を入力してください。');
    startISO = attachOffset(inStartDT.value);
    endISO   = attachOffset(inEndDT.value);
  }
  if(!owner) return showError('「名前」を入力してください。');
  const s = toDate(startISO), e = toDate(endISO);
  if(!(s<e)) return showError('終了は開始より後にしてください。');
  const candidate = { id: editId || newId(), owner, startISO, endISO, note, allDay };
  const conflict = currentState.reservations.some(r=> r.id!==candidate.id && overlap(toDate(candidate.startISO), toDate(candidate.endISO), toDate(r.startISO), toDate(r.endISO)));
  if(conflict) return showError('この時間帯は既に予約があります。別の時間を選んでください。');
  await store.upsert(candidate);
  closeDialog();
});

$('#btnDelete').addEventListener('click', async ()=>{
  if(!editId) return;
  if(!confirm('この予約を削除しますか？（元に戻せません）')) return;
  await store.remove(editId);
  closeDialog();
});

$('#tabToday').addEventListener('click', ()=>{ currentState.listMode='today'; setTabActive('today'); renderList(); });
$('#tabWeek').addEventListener('click', ()=>{ currentState.listMode='week'; setTabActive('week'); renderList(); });
$('#tabMonth').addEventListener('click', ()=>{ currentState.listMode='month'; setTabActive('month'); renderList(); });
function setTabActive(kind){
  $('#tabToday').classList.toggle('active', kind==='today');
  $('#tabWeek').classList.toggle('active', kind==='week');
  $('#tabMonth').classList.toggle('active', kind==='month');
}

$('#btnPrev').addEventListener('click', ()=>{ currentState.ym = new Date(currentState.ym.getFullYear(), currentState.ym.getMonth()-1, 1); render(); });
$('#btnNext').addEventListener('click', ()=>{ currentState.ym = new Date(currentState.ym.getFullYear(), currentState.ym.getMonth()+1, 1); render(); });
$('#btnToday').addEventListener('click', ()=>{ const d=new Date(); currentState.ym = new Date(d.getFullYear(), d.getMonth(), 1); render(); });

$('#btnExport').addEventListener('click', async ()=>{
  const data = await store.export();
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `car-reservations-v3-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
});
$('#btnImport').addEventListener('click', ()=> $('#fileInput').click());
$('#fileInput').addEventListener('change', e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      const arr = JSON.parse(reader.result);
      if(!Array.isArray(arr)) throw new Error('配列のJSONではありません。');
      for(const r of arr){ if(!r.id||!r.startISO||!r.endISO) throw new Error('必須項目(id/startISO/endISO)が不足。'); }
      await store.import(arr); alert('インポートしました。');
    }catch(err){ alert('インポート失敗: '+err.message); }
  };
  reader.readAsText(file,'utf-8');
});

(async function init(){
  if(store.mode==='local'){
    banner.classList.remove('hidden');
    banner.innerHTML = `<span class="tag">ローカル保存</span> Firebase未設定またはhttp環境のため、端末内のみで保存・表示します。設定後は自動で共有モードに切替されます。`;
    store.subscribe(list => { currentState.reservations = list; render(); });
  }else{
    banner.classList.remove('hidden');
    banner.innerHTML = `<span class="tag">共有モード</span> Firestoreにリアルタイム保存・共有しています。`;
    await store.subscribe(list => { currentState.reservations = list; render(); });
  }
  render();
})();
