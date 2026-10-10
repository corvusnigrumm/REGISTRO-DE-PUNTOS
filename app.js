/* =====================================================================
   app.js - Registro de Puntos | Sincroniza con Google Sheets (CSV pub)
   ===================================================================== */

/* ----- CONFIGURACION ----- */
const SHEET_ID   = "2PACX-1vSTz1w5l1838zaB-qlX4NF2UAheWRmyCBb7QNDIIMW7yZOyllc-PSwy8M4KiZ8DNG87XkdCWX33akKI";
const BASE_URL   = "https://docs.google.com/spreadsheets/d/e/" + SHEET_ID + "/pub";
const REFRESH_MS = 30000; // 30 segundos

const PERSONS_CFG = [
  { key:"p1", name:"Leonardo", gid:"802967046",  goal:2000, reward:"Un juego con valor maximo de 200K", sheetName:"Leonardo" },
  { key:"p2", name:"Felipe",   gid:"1517679666", goal:2000, reward:"(Define la recompensa)",             sheetName:"Felipe"   }
];

/* ----- UTILS ----- */
const $ = (s,r=document) => r.querySelector(s);
const $$ = (s,r=document) => Array.from(r.querySelectorAll(s));

function esc(s){
  if(s==null)return"";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function fmt(n){
  return (Number(n)||0).toLocaleString("es-CO",{maximumFractionDigits:0});
}

function fmtDate(s){
  if(!s)return"";
  try{
    const[y,m,d]=s.split("-").map(Number);
    return new Date(y,m-1,d).toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  }catch{return s}
}

function fmtShort(s){
  if(!s)return"";
  try{
    const[y,m,d]=s.split("-").map(Number);
    return new Date(y,m-1,d).toLocaleDateString("es-CO",{day:"2-digit",month:"short"});
  }catch{return s}
}

function todayISO(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

function addDays(iso,n){
  const[y,m,d]=iso.split("-").map(Number),dt=new Date(y,m-1,d);
  dt.setDate(dt.getDate()+n);
  return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
}

function catEmoji(name){
  const n=(name||"").toLowerCase();
  if(/redes|social/.test(n)) return "\uD83D\uDCF5";
  if(/ortograf/.test(n))     return "\u270D\uFE0F";
  if(/gym|gimnasio|entreno/.test(n)) return "\uD83D\uDCAA";
  if(/ausencia/.test(n))     return "\uD83D\uDE34";
  if(/chiste malo/.test(n))  return "\uD83D\uDE44";
  if(/chiste/.test(n))       return "\uD83D\uDE04";
  if(/novia/.test(n))        return "\uD83D\uDC98";
  if(/entrar/.test(n))       return "\uD83C\uDFC1";
  if(/sexual/.test(n))       return "\uD83E\uDD10";
  if(/instal/.test(n))       return "\uD83D\uDCF1";
  if(/error|fallo/.test(n))  return "\u26A0\uFE0F";
  if(/otro|criterio/.test(n))return "\uD83C\uDFAF";
  return "\uD83D\uDCCC";
}

/* ----- PARSEO CSV ----- */
async function fetchSheetData(cfg){
  // En Google Sheets publicados, el parámetro 'gid' identifica la hoja con precisión total
  let url = BASE_URL + "?output=csv";
  if(cfg.gid){
    url += "&gid=" + encodeURIComponent(cfg.gid);
  } else if(cfg.sheetName){
    url += "&sheet=" + encodeURIComponent(cfg.sheetName);
  }
  // Anti-cache para actualizaciones en tiempo real cada 30s
  url += "&_t=" + Date.now();
  const resp = await fetch(url,{cache:"no-store"});
  if(!resp.ok) throw new Error("HTTP "+resp.status+" al cargar la hoja '"+cfg.name+"'");
  return parseCSV(await resp.text());
}

function parseCSV(text){
  return text.split(/\r?\n/).map(line=>{
    const row=[];let inQ=false,cur="";
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(c==='"'){inQ=!inQ;continue}
      if(c===','&&!inQ){row.push(cur.trim());cur="";continue}
      cur+=c;
    }
    row.push(cur.trim());
    return row;
  });
}

function parseCellDate(s){
  if(!s||!s.trim())return null;
  s=s.trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const m1=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m1)return m1[3]+"-"+m1[2].padStart(2,"0")+"-"+m1[1].padStart(2,"0");
  const m2=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if(m2)return "20"+m2[3]+"-"+m2[2].padStart(2,"0")+"-"+m2[1].padStart(2,"0");
  return null;
}

function extractMeta(rows){
  let reward=null, goal=null;
  for(let i=0; i<Math.min(rows.length, 20); i++){
    const row=rows[i];
    for(let j=0; j<row.length; j++){
      const cell=String(row[j]||"").trim();
      if(/recompensa/i.test(cell)){
        const m=cell.match(/recompensa[^\:]*:\s*(.+)/i);
        if(m && m[1].trim()) reward=m[1].trim();
        else if(row[j+1] && String(row[j+1]).trim()) reward=String(row[j+1]).trim();
      }
      if(/^meta$/i.test(cell) && i+1<rows.length){
        const val=String(rows[i+1][j]||"").replace(/[^\d]/g,"");
        if(val) goal=parseInt(val, 10);
      }
    }
  }
  return { reward, goal };
}

function extractRecords(rows){
  let hdrIdx=-1;
  for(let i=0;i<rows.length;i++){
    if(rows[i].some(c=>c==="Fecha")){hdrIdx=i;break}
  }
  if(hdrIdx<0)return[];
  const hdr=rows[hdrIdx];
  let dateCol=-1,reasonCol=-1,catCol=-1,ptsCol=-1;
  for(let j=0;j<hdr.length;j++){
    const h=(hdr[j]||"").toLowerCase();
    if(h==="fecha")dateCol=j;
    else if(h==="motivo")reasonCol=j;
    else if(h==="categor\u00eda"||h==="categoria")catCol=j;
    else if(h==="puntos")ptsCol=j;
  }
  if(dateCol<0)return[];
  const records=[];let id=0;
  for(let i=hdrIdx+1;i<rows.length;i++){
    const row=rows[i];
    const dateStr=row[dateCol]||"";
    if(!dateStr)continue;
    const date=parseCellDate(dateStr);
    if(!date)continue;
    const cat=catCol>=0?(row[catCol]||"").trim():"";
    const ptsRaw=(ptsCol>=0?row[ptsCol]:"0")||"0";
    const pts=parseFloat(ptsRaw.replace(/\s/g,"").replace(",","."));
    const reason=reasonCol>=0?(row[reasonCol]||"").trim():"";
    if(!cat&&isNaN(pts))continue;
    records.push({id:id++,date,category:cat,points:isNaN(pts)?0:pts,reason});
  }
  return records;
}

async function fetchAllData(){
  const persons=[];
  for(const cfg of PERSONS_CFG){
    try{
      const rows=await fetchSheetData(cfg);
      const records=extractRecords(rows);
      const meta=extractMeta(rows);
      const goal=meta.goal || cfg.goal || 2000;
      const reward=meta.reward || cfg.reward || "(Meta de recompensa)";
      const seen=new Set(),cats=[];
      records.forEach(r=>{
        if(r.category&&!seen.has(r.category)){
          seen.add(r.category);
          cats.push({name:r.category,points:r.points,group:null});
        }
      });
      persons.push({key:cfg.key,name:cfg.name,goal,reward,categories:cats,records});
    }catch(e){console.error("Error cargando "+cfg.name+":",e)}
  }
  if(!persons.length) throw new Error("No se pudieron cargar datos. Verifica que el Sheet este publicado como CSV.");
  return{today:todayISO(),persons};
}

/* ----- ESTADO ----- */
const state={today:todayISO(),persons:[],selectedKey:null,loaded:false};
const currentPerson=()=>state.persons.find(p=>p.key===state.selectedKey)||state.persons[0];

/* ----- CALCULOS ----- */
function computeStats(person){
  const recs=person.records||[];
  let total=0,won=0,lost=0;
  const byDay={},byCat={};
  recs.forEach(r=>{
    total+=Number(r.points)||0;
    if(r.points>0)won+=Number(r.points);
    if(r.points<0)lost+=Math.abs(Number(r.points));
    byDay[r.date]=(byDay[r.date]||0)+(Number(r.points)||0);
    if(!byCat[r.category])byCat[r.category]={name:r.category,count:0,points:0};
    byCat[r.category].count++;
    byCat[r.category].points+=Number(r.points)||0;
  });
  let streak=0,d=todayISO();
  for(;;){
    const dv=byDay[d];
    if(dv&&dv>0){streak++;d=addDays(d,-1);}
    else if(!dv&&streak===0&&d===todayISO()){d=addDays(d,-1);continue}
    else break;
  }
  let bestDay={date:null,points:0};
  Object.entries(byDay).forEach(([dt,pts])=>{if(pts>bestDay.points)bestDay={date:dt,points:pts}});
  const goal=Number(person.goal)||2000;
  const pct=goal>0?Math.min(100,Math.max(0,(total/goal)*100)):0;
  let level={emoji:"\uD83C\uDF31",name:"Comenzando"};
  if(total>=goal)       level={emoji:"\uD83C\uDFC6",name:"Meta alcanzada"};
  else if(pct>=75)      level={emoji:"\uD83C\uDFC1",name:"Recta final"};
  else if(pct>=50)      level={emoji:"\u26A1",name:"A mitad de camino"};
  else if(pct>=25)      level={emoji:"\uD83D\uDD25",name:"En marcha"};
  const td=state.today,labels=[],accum=[],daily=[];let running=0;
  const cutoff=addDays(td,-29);
  recs.forEach(r=>{if(r.date<cutoff)running+=Number(r.points)||0});
  for(let i=-29;i<=0;i++){
    const day=addDays(td,i);
    labels.push(day);running+=(byDay[day]||0);
    accum.push(running);daily.push(byDay[day]||0);
  }
  return{total,won,lost,today:{points:byDay[td]||0,count:recs.filter(r=>r.date===td).length},streak,bestDay,goal,pct,level,byCat,byDay,series:{labels,accum,daily}};
}

/* ----- TOASTS ----- */
function toast(msg,type="info",dur=3500){
  const c=$("#toasts"),el=document.createElement("div");
  el.className="toast "+type;
  const icons={error:"\u26A0\uFE0F",success:"\u2705",info:"\u2139\uFE0F"};
  el.innerHTML='<span class="toast-icon">'+(icons[type]||"\u2139\uFE0F")+'</span><div class="toast-msg">'+esc(msg)+"</div>";
  c.appendChild(el);
  setTimeout(()=>{el.classList.add("removing");setTimeout(()=>el.remove(),250)},dur);
}

/* ----- SYNC STATUS ----- */
function setSyncStatus(s){
  const dot=$("#sync-dot"),txt=$("#sync-text");
  if(s==="syncing"){dot.className="sync-dot syncing";txt.textContent="Actualizando...";}
  else if(s==="ok"){dot.className="sync-dot";txt.textContent="Actualizado "+new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"});}
  else{dot.className="sync-dot error";txt.textContent="Error de conexion";}
}

/* ----- RENDER ----- */
let prevPct=-1,chartLine=null,chartBars=null;

function render(){
  const person=currentPerson();if(!person)return;
  $("#header-title").textContent="Camino a los "+fmt(person.goal)+" puntos";
  $("#header-date").textContent=fmtDate(state.today);
  $("#reward-text").textContent=person.reward||"--";
  const st=computeStats(person);
  $("#progress-total").textContent=fmt(st.total);
  $("#progress-goal").textContent=fmt(st.goal);
  const circ=2*Math.PI*70,rfg=$("#ring-fg");
  rfg.style.strokeDasharray=circ;
  rfg.style.strokeDashoffset=circ*(1-st.pct/100);
  $("#ring-percent").textContent=Math.round(st.pct);
  $("#ring-sub").textContent=st.total>=st.goal?"!Meta alcanzada!":"de la meta";
  const pbf=$("#progress-bar-fill");
  pbf.style.width=st.pct+"%";pbf.setAttribute("aria-valuenow",Math.round(st.pct));
  $("#remaining-points").textContent=fmt(Math.max(0,st.goal-st.total));
  $("#level-emoji").textContent=st.level.emoji;
  $("#level-name").textContent=st.level.name;
  const pc=$("#progress-card");
  if(st.total>=st.goal){pc.classList.add("gold");if(prevPct!==-1&&prevPct<100)triggerConfetti();}
  else pc.classList.remove("gold");
  prevPct=st.pct;
  renderStats(st);renderCatSummary(st);renderHistory(person);renderCharts(st);
}

function renderStats(st){
  const g=$("#stats-grid"),tp=st.today.points;
  const SVG=(d)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';
  const items=[
    {label:"Puntos ganados",value:"+"+fmt(st.won),cls:"pos",icon:SVG('<polyline points="18 15 12 9 6 15"/>')},
    {label:"Puntos perdidos",value:"-"+fmt(st.lost),cls:"neg",icon:SVG('<polyline points="6 9 12 15 18 9"/>')},
    {label:"Hoy",value:(tp>=0?"+":"")+fmt(tp),cls:tp>=0?"pos":"neg",sub:st.today.count+" "+(st.today.count===1?"registro":"registros"),icon:SVG('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>')},
    {label:"Racha",value:st.streak,sub:st.streak===1?"dia seguido":"dias seguidos",cls:"",icon:SVG('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>')},
    {label:"Mejor dia",value:st.bestDay.points>0?"+"+fmt(st.bestDay.points):"--",sub:st.bestDay.date?fmtShort(st.bestDay.date):"Sin registros",cls:"",icon:SVG('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>')},
    {label:"Total registros",value:fmt((currentPerson().records||[]).length),cls:"",icon:SVG('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>')}
  ];
  g.innerHTML=items.map(it=>'<div class="stat"><div class="stat-label"><span class="stat-icon">'+it.icon+'</span>'+esc(it.label)+'</div><div class="stat-value num '+(it.cls||"")+'">'+esc(String(it.value))+'</div>'+(it.sub?'<div class="stat-sub">'+esc(it.sub)+"</div>":"")+"</div>").join("");
}

function renderCatSummary(st){
  const c=$("#category-summary"),cats=Object.values(st.byCat);
  if(!cats.length){
    c.innerHTML='<div class="empty"><div class="emoji">\uD83D\uDCCA</div><h3>Sin datos todavia</h3><p>Los registros apareceran aqui.</p></div>';
    return;
  }
  cats.sort((a,b)=>b.count-a.count);
  const mx=Math.max(...cats.map(c=>c.count));
  c.innerHTML=cats.map(ct=>'<div class="cat-row"><span class="emoji" aria-hidden="true">'+catEmoji(ct.name)+'</span><div class="info"><div class="name">'+esc(ct.name)+'</div><div class="bar"><div class="bar-fill" style="width:'+(ct.count/mx*100)+'%"></div></div><div class="count">'+fmt(ct.count)+(ct.count===1?" registro":" registros")+'</div></div><div class="points num '+(ct.points>=0?"pos":"neg")+'">'+(ct.points>=0?"+":"")+fmt(ct.points)+"</div></div>").join("");
}

function renderHistory(person){
  const c=$("#history-list"),recs=[...(person.records||[])].sort((a,b)=>b.date.localeCompare(a.date)||(b.id-a.id)).slice(0,40);
  if(!recs.length){
    c.innerHTML='<div class="empty"><div class="emoji">\uD83D\uDDD2\uFE0F</div><h3>Aun no hay registros</h3><p>Los registros del Sheet apareceran aqui.</p></div>';
    return;
  }
  c.innerHTML=recs.map(r=>'<article class="history-item"><span class="emoji" aria-hidden="true">'+catEmoji(r.category)+'</span><div class="info"><div class="cat-name">'+esc(r.category)+"</div>"+(r.reason?'<div class="reason">'+esc(r.reason)+"</div>":"")+'<div class="meta">'+esc(fmtShort(r.date))+'</div></div><div class="pts num '+(r.points>=0?"pos":"neg")+'">'+(r.points>=0?"+":"")+fmt(r.points)+"</div></article>").join("");
}

function getColors(){
  const dark=window.matchMedia("(prefers-color-scheme:dark)").matches;
  return{text:dark?"#b8bfbb":"#4a5451",grid:dark?"rgba(255,255,255,.08)":"rgba(0,0,0,.06)",pos:"#2f8f4f",neg:"#c7523a",forest:dark?"#3fa076":"#1f5d3d"};
}

function renderCharts(st){
  if(typeof Chart==="undefined")return;
  const col=getColors(),labels=st.series.labels.map(fmtShort);
  if(chartLine){chartLine.destroy();chartLine=null}
  if(chartBars){chartBars.destroy();chartBars=null}
  const base={
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false},tooltip:{backgroundColor:"rgba(23,31,27,.95)",titleColor:"#fff",bodyColor:"#fff",borderColor:"rgba(255,255,255,.1)",borderWidth:1,padding:10,cornerRadius:8,callbacks:{label:(ctx)=>(ctx.parsed.y>=0?"+":"")+fmt(ctx.parsed.y)+" pts"}}},
    scales:{
      x:{ticks:{color:col.text,font:{size:10},maxRotation:0,autoSkipPadding:12},grid:{display:false},border:{display:false}},
      y:{ticks:{color:col.text,font:{size:10},callback:v=>fmt(v)},grid:{color:col.grid},border:{display:false}}
    }
  };
  const lctx=$("#chart-line").getContext("2d"),grad=lctx.createLinearGradient(0,0,0,240);
  grad.addColorStop(0,col.forest+"55");grad.addColorStop(1,col.forest+"00");
  chartLine=new Chart(lctx,{type:"line",data:{labels,datasets:[{label:"Acumulado",data:st.series.accum,borderColor:col.forest,backgroundColor:grad,borderWidth:2.5,fill:true,tension:.35,pointRadius:0,pointHitRadius:10}]},options:{...base}});
  const bc=st.series.daily.map(v=>v>=0?col.pos:col.neg);
  chartBars=new Chart($("#chart-bars").getContext("2d"),{type:"bar",data:{labels,datasets:[{label:"Puntos",data:st.series.daily,backgroundColor:bc,borderRadius:4,borderSkipped:false,maxBarThickness:18}]},options:{...base}});
}

/* ----- CONFETI ----- */
function triggerConfetti(){
  if(window.matchMedia("(prefers-reduced-motion:reduce)").matches)return;
  const cv=$("#confetti"),ctx=cv.getContext("2d");
  cv.width=window.innerWidth;cv.height=window.innerHeight;
  const clrs=["#c9a24f","#e0c07a","#1f5d3d","#2d7a52","#fff5d1"],p=[];
  for(let i=0;i<120;i++)p.push({x:cv.width/2+(Math.random()-.5)*200,y:cv.height/2,vx:(Math.random()-.5)*12,vy:-Math.random()*14-6,g:.35,size:Math.random()*6+3,color:clrs[Math.floor(Math.random()*clrs.length)],rot:Math.random()*Math.PI*2,vr:(Math.random()-.5)*.3,life:1});
  const start=performance.now();
  function step(now){
    const e=now-start;ctx.clearRect(0,0,cv.width,cv.height);
    p.forEach(q=>{q.x+=q.vx;q.y+=q.vy;q.vy+=q.g;q.rot+=q.vr;q.life=Math.max(0,1-e/3500);ctx.save();ctx.translate(q.x,q.y);ctx.rotate(q.rot);ctx.globalAlpha=q.life;ctx.fillStyle=q.color;ctx.fillRect(-q.size/2,-q.size/2,q.size,q.size*.6);ctx.restore()});
    if(e<4000)requestAnimationFrame(step);else ctx.clearRect(0,0,cv.width,cv.height);
  }
  requestAnimationFrame(step);
}

/* ----- SELECTOR DE PERSONA ----- */
function renderPersonSelector(){
  const cont=$(".person-selector"),pill=$("#selector-pill");
  $$(".person-btn",cont).forEach(b=>b.remove());
  state.persons.forEach(p=>{
    const btn=document.createElement("button");
    btn.type="button";btn.className="person-btn";
    btn.setAttribute("role","tab");
    btn.setAttribute("aria-selected",p.key===state.selectedKey?"true":"false");
    btn.setAttribute("data-key",p.key);
    btn.innerHTML='<span class="avatar">'+esc(p.name.charAt(0).toUpperCase())+'</span><span class="person-name">'+esc(p.name)+"</span>";
    btn.addEventListener("click",()=>{state.selectedKey=p.key;renderPersonSelector();render()});
    cont.appendChild(btn);
  });
  requestAnimationFrame(()=>{
    const active=cont.querySelector('.person-btn[aria-selected="true"]');
    if(active){pill.style.width=active.offsetWidth+"px";pill.style.transform="translateX("+(active.offsetLeft-4)+"px)"}
  });
}

/* ----- CARGA Y REFRESCO ----- */
async function loadData(isRefresh=false){
  setSyncStatus("syncing");
  try{
    const data=await fetchAllData();
    state.today=data.today||todayISO();
    state.persons=data.persons||[];
    if(!state.selectedKey&&state.persons.length)state.selectedKey=state.persons[0].key;
    state.loaded=true;
    if(!isRefresh){
      $("#initial-loading").classList.add("hidden");
      $("#dashboard").classList.remove("hidden");
    }
    renderPersonSelector();render();setSyncStatus("ok");
  }catch(e){
    console.error("Error al cargar:",e);setSyncStatus("error");
    if(!isRefresh){
      $("#initial-loading").innerHTML='<div class="empty" style="padding:24px"><div class="emoji">\u26A0\uFE0F</div><h3>Error al cargar</h3><p>'+esc(e.message||"No se pudieron obtener los datos.")+'</p><p style="margin-top:12px">Verifica que el Google Sheet este publicado correctamente como CSV.</p><button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;background:var(--forest);color:white;border-radius:var(--r-full);font-weight:600;cursor:pointer;border:0">Reintentar</button></div>';
    }else{
      toast("Error al actualizar","error",3000);
    }
  }
}

/* ----- INIT ----- */
async function init(){
  const hdr=$("#header");
  window.addEventListener("scroll",()=>{if(window.scrollY>10)hdr.classList.add("scrolled");else hdr.classList.remove("scrolled")},{passive:true});
  await loadData(false);
  setInterval(()=>loadData(true),REFRESH_MS);
  let rt;
  window.addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(()=>{if(chartLine)chartLine.resize();if(chartBars)chartBars.resize();const cv=$("#confetti");if(cv){cv.width=window.innerWidth;cv.height=window.innerHeight}},150)});
  window.matchMedia("(prefers-color-scheme:dark)").addEventListener("change",()=>{if(state.loaded){const p=currentPerson();if(p)renderCharts(computeStats(p))}});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.loaded)loadData(true)});
}

document.addEventListener("DOMContentLoaded",init);
