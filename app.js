/* ==========================================================================
   app.js - Registro de Puntos (Leonardo & Felipe)
   Sincronización en tiempo real con Google Sheets + Diseño Premium y Animado
   ========================================================================== */

/* ----- CONFIGURACIÓN DE CONEXIÓN ----- */
const DEFAULT_PUB_ID = "2PACX-1vSTz1w5l1838zaB-qlX4NF2UAheWRmyCBb7QNDIIMW7yZOyllc-PSwy8M4KiZ8DNG87XkdCWX33akKI";
const DEFAULT_BASE_URL = "https://docs.google.com/spreadsheets/d/e/" + DEFAULT_PUB_ID + "/pub";
const REFRESH_SECONDS = 15; // Actualización automática cada 15 segundos

const PERSONS_CFG = [
  { key: "p1", name: "Leonardo", gid: "802967046",  goal: 2000, reward: "Un juego con valor máximo de 200K", sheetName: "Leonardo" },
  { key: "p2", name: "Felipe",   gid: "1517679666", goal: 2000, reward: "(Define la recompensa)",             sheetName: "Felipe"   }
];

/* ----- UTILIDADES ----- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmt(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function fmtDate(str) {
  if (!str) return "";
  try {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CO", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
  } catch { return str; }
}

function fmtDateShort(str) {
  if (!str) return "";
  try {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch { return str; }
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function catEmoji(name) {
  const n = (name || "").toLowerCase();
  if (/redes|social/.test(n))           return "📵";
  if (/ortograf|ortogr/.test(n))        return "✍️";
  if (/gym|gimnasio|entreno/.test(n))   return "💪";
  if (/ausen/.test(n))                  return "😴";
  if (/chiste malo/.test(n))            return "🙄";
  if (/chiste/.test(n))                 return "😄";
  if (/sexual/.test(n))                 return "🤐";
  if (/novia/.test(n))                  return "💘";
  if (/entrar/.test(n))                 return "🏁";
  if (/instal/.test(n))                 return "📱";
  if (/error|fallo/.test(n))            return "⚠️";
  if (/otro|criterio|manual/.test(n))   return "🎯";
  return "📌";
}

/** Animación count-up de números con easing */
function animateNumber(el, from, to, duration = 850, formatter = fmt) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = formatter(to);
    return;
  }
  const start = performance.now();
  const diff = to - from;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatter(Math.round(from + diff * eased));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** Efecto flotante de puntos "+X" al hacer click */
function floatPoints(sourceEl, points) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = sourceEl ? sourceEl.getBoundingClientRect() : { left: window.innerWidth/2, top: 200, width: 0, height: 0 };
  const el = document.createElement("div");
  el.className = `float-points ${points >= 0 ? "pos" : "neg"}`;
  el.textContent = `${points >= 0 ? "+" : ""}${fmt(points)}`;
  el.style.left = (rect.left + rect.width / 2 - 30) + "px";
  el.style.top = (rect.top + rect.height / 2 - 16) + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

/** Efecto ripple en botones */
function addRipple(btn, e) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = (e.clientX || rect.left + rect.width/2) - rect.left - size/2;
  const y = (e.clientY || rect.top + rect.height/2) - rect.top - size/2;
  const r = document.createElement("span");
  r.className = "ripple";
  r.style.width = r.style.height = size + "px";
  r.style.left = x + "px";
  r.style.top = y + "px";
  btn.appendChild(r);
  setTimeout(() => r.remove(), 700);
}

/* ==========================================================================
   ESTADO GLOBAL
   ========================================================================== */
const state = {
  today: todayISO(),
  persons: [],
  selectedKey: null,
  loaded: false,
  isSyncing: false,
  syncCountdown: REFRESH_SECONDS,
  lastTotals: {},
  realtimeSource: localStorage.getItem("RT_SHEET_SOURCE") || null
};

function currentPerson() {
  return state.persons.find(p => p.key === state.selectedKey) || state.persons[0];
}

/* ==========================================================================
   CARGADOR DE DATOS DE GOOGLE SHEETS (REAL-TIME + MULTI-ORIGEN)
   ========================================================================== */

/** Extrae el ID de una URL de Google Sheets si el usuario la suministró */
function extractSpreadsheetId(urlOrId) {
  if (!urlOrId) return null;
  const str = urlOrId.trim();
  const match = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{25,})/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{25,}$/.test(str)) return str;
  return null;
}

/** Construye la URL de consulta según la configuración activa */
function buildSheetFetchUrl(cfg) {
  const custom = state.realtimeSource;
  const timestamp = Date.now();

  // 1. Si el usuario configuró una URL directa de Google Sheets (Modo Tiempo Real Instantáneo)
  const ssId = extractSpreadsheetId(custom);
  if (ssId) {
    // La API gviz/tq de Google Sheets devuelve CSV EN VIVO sin los 5 minutos de caché
    return `https://docs.google.com/spreadsheets/d/${ssId}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(cfg.gid)}&_t=${timestamp}`;
  }

  // 2. Si el usuario configuró una Apps Script Web App URL
  if (custom && custom.includes("script.google.com")) {
    return `${custom}${custom.includes("?") ? "&" : "?"}action=csv&gid=${encodeURIComponent(cfg.gid)}&_t=${timestamp}`;
  }

  // 3. Por defecto: Publicar en la web CSV
  let url = DEFAULT_BASE_URL + `?output=csv&gid=${encodeURIComponent(cfg.gid)}&_t=${timestamp}`;
  return url;
}

/** Realiza el fetch con control de caché */
async function fetchSheetData(cfg) {
  const url = buildSheetFetchUrl(cfg);
  const resp = await fetch(url, { cache: "no-store", headers: { "Pragma": "no-cache" } });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} al conectar con la hoja '${cfg.name}'`);
  }
  const text = await resp.text();
  return parseCSV(text);
}

/** Parser de CSV robusto (maneja celdas con comillas y saltos) */
function parseCSV(text) {
  return text.split(/\r?\n/).map(line => {
    const row = [];
    let inQ = false, cur = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { row.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    row.push(cur.trim());
    return row;
  });
}

function parseCellDate(s) {
  if (!s || !s.trim()) return null;
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,"0")}-${m1[1].padStart(2,"0")}`;
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m2) return `20${m2[3]}-${m2[2].padStart(2,"0")}-${m2[1].padStart(2,"0")}`;
  return null;
}

/** Extrae dinámicamente Meta y Recompensa si están escritas en la hoja */
function extractMeta(rows) {
  let reward = null, goal = null;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || "").trim();
      if (/recompensa/i.test(cell)) {
        const m = cell.match(/recompensa[^\:]*:\s*(.+)/i);
        if (m && m[1].trim()) reward = m[1].trim();
        else if (row[j + 1] && String(row[j + 1]).trim()) reward = String(row[j + 1]).trim();
      }
      if (/^meta$/i.test(cell) && i + 1 < rows.length) {
        const val = String(rows[i + 1][j] || "").replace(/[^\d]/g, "");
        if (val) goal = parseInt(val, 10);
      }
    }
  }
  return { reward, goal };
}

/** Extrae la tabla de registros desde la fila que contiene el encabezado 'Fecha' */
function extractRecords(rows) {
  let hdrIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => c === "Fecha")) { hdrIdx = i; break; }
  }
  if (hdrIdx < 0) return [];
  const hdr = rows[hdrIdx];
  let dateCol = -1, reasonCol = -1, catCol = -1, ptsCol = -1;
  for (let j = 0; j < hdr.length; j++) {
    const h = (hdr[j] || "").toLowerCase();
    if (h === "fecha") dateCol = j;
    else if (h === "motivo") reasonCol = j;
    else if (h === "categoría" || h === "categoria") catCol = j;
    else if (h === "puntos") ptsCol = j;
  }
  if (dateCol < 0) return [];
  const records = [];
  let id = 0;
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const dateStr = row[dateCol] || "";
    if (!dateStr) continue;
    const date = parseCellDate(dateStr);
    if (!date) continue;
    const cat = catCol >= 0 ? (row[catCol] || "").trim() : "";
    const ptsRaw = (ptsCol >= 0 ? row[ptsCol] : "0") || "0";
    const pts = parseFloat(ptsRaw.replace(/\s/g, "").replace(",", "."));
    const reason = reasonCol >= 0 ? (row[reasonCol] || "").trim() : "";
    if (!cat && isNaN(pts)) continue;
    records.push({
      id: id++,
      date,
      category: cat,
      points: isNaN(pts) ? 0 : pts,
      reason
    });
  }
  return records;
}

/** Carga todos los datos de todas las personas */
async function apiGetAll() {
  const persons = [];
  for (const cfg of PERSONS_CFG) {
    try {
      const rows = await fetchSheetData(cfg);
      const records = extractRecords(rows);
      const meta = extractMeta(rows);
      const goal = meta.goal || cfg.goal || 2000;
      const reward = meta.reward || cfg.reward || "(Meta de recompensa)";

      // Extraer categorías únicas vistas en los registros
      const seen = new Set(), cats = [];
      records.forEach(r => {
        if (r.category && !seen.has(r.category)) {
          seen.add(r.category);
          cats.push({ name: r.category, points: r.points, group: null });
        }
      });
      // Añadir categorías predeterminadas si aún no tienen registros
      const defaultList = [
        "Día sin redes sociales", "Día sin temas sexuales (todos en Discord)",
        "Chiste bueno", "Chiste malo", "Día gym", "Error ortográfico", "Conseguir novia", "Entrar al gym", "Ausencia", "Otro"
      ];
      defaultList.forEach(name => {
        if (!seen.has(name)) {
          seen.add(name);
          cats.push({ name, points: null, group: null });
        }
      });

      persons.push({
        key: cfg.key,
        name: cfg.name,
        goal,
        reward,
        categories: cats,
        records
      });
    } catch (e) {
      console.error(`Error cargando datos de ${cfg.name}:`, e);
    }
  }

  if (!persons.length) {
    throw new Error("No se pudieron cargar los datos de Google Sheets. Verifica la conexión.");
  }
  return { today: todayISO(), persons };
}

/* ==========================================================================
   CÁLCULOS ESTADÍSTICOS
   ========================================================================== */
function computeStats(person) {
  const records = person.records || [];
  let total = 0, won = 0, lost = 0;
  const byDay = {};
  const byCat = {};

  records.forEach(r => {
    total += Number(r.points) || 0;
    if (r.points > 0) won += Number(r.points);
    if (r.points < 0) lost += Math.abs(Number(r.points));
    byDay[r.date] = (byDay[r.date] || 0) + (Number(r.points) || 0);
    if (!byCat[r.category]) byCat[r.category] = { name: r.category, count: 0, points: 0 };
    byCat[r.category].count += 1;
    byCat[r.category].points += Number(r.points) || 0;
  });

  let streak = 0;
  let d = todayISO();
  while (true) {
    const dayTotal = byDay[d];
    if (dayTotal && dayTotal > 0) {
      streak += 1;
      d = addDays(d, -1);
    } else if ((dayTotal === 0 || dayTotal === undefined) && streak === 0 && d === todayISO()) {
      d = addDays(d, -1);
      continue;
    } else {
      break;
    }
  }

  let bestDay = { date: null, points: 0 };
  Object.entries(byDay).forEach(([date, pts]) => {
    if (pts > bestDay.points) bestDay = { date, points: pts };
  });

  const goal = Number(person.goal) || 2000;
  const pct = goal > 0 ? Math.min(100, Math.max(0, (total / goal) * 100)) : 0;

  let level = { emoji: "🌱", name: "Comenzando" };
  if (total >= goal) level = { emoji: "🏆", name: "Meta alcanzada" };
  else if (pct >= 75) level = { emoji: "🏁", name: "Recta final" };
  else if (pct >= 50) level = { emoji: "⚡", name: "A mitad de camino" };
  else if (pct >= 25) level = { emoji: "🔥", name: "En marcha" };

  const todayDate = state.today;
  const labels = [], accum = [], daily = [];
  let running = 0;
  const cutoff = addDays(todayDate, -29);
  records.forEach(r => { if (r.date < cutoff) running += Number(r.points) || 0; });
  for (let i = -29; i <= 0; i++) {
    const day = addDays(todayDate, i);
    labels.push(day);
    running += (byDay[day] || 0);
    accum.push(running);
    daily.push(byDay[day] || 0);
  }

  const todayCount = records.filter(r => r.date === todayDate).length;

  return {
    total, won, lost,
    today: { points: byDay[todayDate] || 0, count: todayCount },
    streak, bestDay, goal, pct, level, byCat, byDay,
    series: { labels, accum, daily }
  };
}

/* ==========================================================================
   TOASTS & NOTIFICACIONES
   ========================================================================== */
function toast(message, type = "info", duration = 3500) {
  const container = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const icons = { error: "⚠️", success: "✅", info: "ℹ️" };
  el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><div class="toast-msg">${esc(message)}</div>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("removing");
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ==========================================================================
   SISTEMA DE MODALES
   ========================================================================== */
const overlay = $("#overlay");
const modal = $("#modal");
let lastFocus = null;
let modalCleanup = null;

function openModal(html, opts = {}) {
  lastFocus = document.activeElement;
  modal.innerHTML = html;
  overlay.classList.toggle("bottom-sheet", !!opts.bottomSheet);
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    const first = modal.querySelector("input, textarea, select, button:not(.modal-close)");
    if (first) first.focus();
  });
  if (opts.onMount) opts.onMount(modal);
  modalCleanup = opts.onClose || null;
}

function closeModal() {
  overlay.classList.remove("open");
  document.body.style.overflow = "";
  if (modalCleanup) { try { modalCleanup(); } catch(e) {} modalCleanup = null; }
  if (lastFocus) { try { lastFocus.focus(); } catch(e) {} }
  setTimeout(() => { if (!overlay.classList.contains("open")) modal.innerHTML = ""; }, 350);
}

overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
});

/* Modal para configurar Tiempo Real Instantáneo (0s de espera) */
function openRealtimeModal() {
  const currentVal = state.realtimeSource || "";
  const isDirect = !!extractSpreadsheetId(currentVal);
  const statusLabel = isDirect
    ? `<span class="status-pill-rt live">⚡ Modo Instantáneo Activo (0s caché)</span>`
    : `<span class="status-pill-rt pub">📡 Modo Publicado (Caché Google 5 min)</span>`;

  const html = `
    <button type="button" class="modal-close" aria-label="Cerrar" id="modal-close-x">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <h2 id="modal-title">⚡ Modo Tiempo Real (Sin retrasos)</h2>
    <div style="margin-bottom:12px;">${statusLabel}</div>
    <p class="subtitle" style="margin-bottom:16px;">
      Google Sheets por defecto <b>guarda en caché durante 5 a 10 minutos</b> las versiones "Publicar en la web". Para que los cambios que hagas en el Google Sheet se vean <b>al instante en 1 segundo</b>:
    </p>

    <div class="realtime-box">
      <div class="step-item">
        <span class="step-badge">1</span>
        <div>Abre tu Google Sheet en Google Drive.</div>
      </div>
      <div class="step-item">
        <span class="step-badge">2</span>
        <div>Haz clic en <b>Compartir</b> y asegúrate de que el acceso esté en: <b>"Cualquier persona con el enlace puede ser lector"</b>.</div>
      </div>
      <div class="step-item">
        <span class="step-badge">3</span>
        <div>Copia el enlace de la barra de direcciones de tu navegador (ej: <code>https://docs.google.com/spreadsheets/d/.../edit</code>) y pégalo aquí abajo:</div>
      </div>
    </div>

    <div class="field" style="margin-top:16px;">
      <label for="input-rt-url">Enlace de tu Google Sheet (o ID):</label>
      <input type="text" id="input-rt-url" value="${esc(currentVal)}" placeholder="https://docs.google.com/spreadsheets/d/TU_ID/edit" />
      <span class="field-hint">Al guardar, la aplicación consultará la base de datos de Google Sheets en vivo en cada actualización.</span>
    </div>

    <div class="modal-actions" style="margin-top:20px;">
      <button type="button" class="btn btn-ghost" id="btn-rt-reset">Restablecer por defecto</button>
      <button type="button" class="btn btn-primary" id="btn-rt-save">Guardar y conectar</button>
    </div>
  `;

  openModal(html, {
    bottomSheet: true,
    onMount: (m) => {
      m.querySelector("#modal-close-x").addEventListener("click", closeModal);
      m.querySelector("#btn-rt-reset").addEventListener("click", async () => {
        state.realtimeSource = null;
        localStorage.removeItem("RT_SHEET_SOURCE");
        updateRealtimeButtonState();
        closeModal();
        toast("Modo por defecto restablecido", "info");
        await triggerDataSync(true);
      });
      m.querySelector("#btn-rt-save").addEventListener("click", async () => {
        const input = m.querySelector("#input-rt-url");
        const val = input.value.trim();
        if (val) {
          const id = extractSpreadsheetId(val);
          if (!id && !val.includes("script.google.com")) {
            toast("Ingresa un enlace válido de Google Sheets (docs.google.com/spreadsheets/d/...)", "error");
            input.focus();
            return;
          }
          state.realtimeSource = val;
          localStorage.setItem("RT_SHEET_SOURCE", val);
          toast("¡Conexión en Tiempo Real activada! ⚡", "success");
        } else {
          state.realtimeSource = null;
          localStorage.removeItem("RT_SHEET_SOURCE");
          toast("Modo por defecto restablecido", "info");
        }
        updateRealtimeButtonState();
        closeModal();
        await triggerDataSync(true);
      });
    }
  });
}

function updateRealtimeButtonState() {
  const btn = $("#btn-config-realtime");
  const isDirect = !!extractSpreadsheetId(state.realtimeSource);
  if (btn) {
    btn.classList.toggle("active", isDirect);
    const txt = $("#btn-realtime-text");
    if (txt) txt.textContent = isDirect ? "⚡ Real-Time ON" : "Tiempo Real";
  }
}

/* ==========================================================================
   RENDERIZADO DE LA INTERFAZ
   ========================================================================== */
let prevPct = -1;

function render() {
  const person = currentPerson();
  if (!person) return;

  $("#header-title-text").textContent = `Camino a los ${fmt(person.goal)} puntos`;
  $("#header-date").textContent = fmtDate(state.today);
  $("#reward-text").textContent = person.reward || "—";

  const stats = computeStats(person);

  // Count-up del total
  const totalEl = $("#progress-total");
  const prevTotal = state.lastTotals[person.key] || 0;
  animateNumber(totalEl, prevTotal, stats.total, 950);
  state.lastTotals[person.key] = stats.total;

  $("#progress-goal").textContent = fmt(stats.goal);

  // Anillo SVG
  const circumference = 2 * Math.PI * 70;
  const ringFg = $("#ring-fg");
  ringFg.style.strokeDasharray = circumference;
  ringFg.style.strokeDashoffset = circumference * (1 - stats.pct / 100);

  // Spark luminoso en la punta del progreso
  const spark = $("#ring-spark");
  const angle = (stats.pct / 100) * 360 - 90;
  const rad = angle * Math.PI / 180;
  const ringRect = $(".ring-wrap");
  const radius = ringRect.offsetWidth / 2 - (ringRect.offsetWidth / 2) * (10 / 160) - 4;
  const cx = ringRect.offsetWidth / 2;
  spark.style.left = (cx + Math.cos(rad) * radius) + "px";
  spark.style.top = (cx + Math.sin(rad) * radius) + "px";
  spark.classList.remove("visible");
  void spark.offsetWidth;
  if (stats.pct > 0 && stats.pct < 100) spark.classList.add("visible");

  // Porcentaje
  const pctEl = $("#ring-percent");
  const prevPctVal = parseInt(pctEl.textContent) || 0;
  animateNumber(pctEl, prevPctVal, Math.round(stats.pct), 1000, (v) => String(v));
  $("#ring-sub").textContent = stats.total >= stats.goal ? "¡Meta alcanzada!" : "de la meta";

  const progressCard = $("#progress-card");
  const progressBarFill = $("#progress-bar-fill");
  progressBarFill.style.width = stats.pct + "%";
  progressBarFill.setAttribute("aria-valuenow", Math.round(stats.pct));

  // Hitos 25%, 50%, 75%
  [25, 50, 75].forEach(ms => {
    const reached = stats.pct >= ms;
    const mEl = $(`.milestone[data-ms="${ms}"]`);
    const lEl = $(`.milestone-label[data-msl="${ms}"]`);
    if (mEl) mEl.classList.toggle("reached", reached);
    if (lEl) lEl.classList.toggle("reached", reached);
  });

  const remaining = Math.max(0, stats.goal - stats.total);
  const remEl = $("#remaining-points");
  animateNumber(remEl, parseInt(remEl.textContent.replace(/\D/g, '')) || remaining, remaining, 850);

  $("#level-emoji").textContent = stats.level.emoji;
  $("#level-name").textContent = stats.level.name;

  // Estado dorado + confeti al alcanzar meta
  if (stats.total >= stats.goal) {
    progressCard.classList.add("gold");
    addSparkles(progressCard);
    if (prevPct !== -1 && prevPct < 100) triggerConfetti();
  } else {
    progressCard.classList.remove("gold");
    removeSparkles(progressCard);
  }
  prevPct = stats.pct;

  renderStats(stats);
  renderCategories(person);
  renderCategorySummary(stats);
  renderHistory(person);
  renderCharts(stats);
}

function addSparkles(container) {
  if (container.querySelector(".sparkle")) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const positions = [
    { top: "12%", left: "8%", delay: "0s" },
    { top: "20%", right: "10%", delay: "0.8s" },
    { bottom: "18%", left: "14%", delay: "1.6s" },
    { bottom: "25%", right: "16%", delay: "0.4s" },
    { top: "50%", left: "4%", delay: "1.2s" }
  ];
  positions.forEach((pos, i) => {
    const s = document.createElement("span");
    s.className = "sparkle";
    s.textContent = i % 2 === 0 ? "✨" : "⭐";
    s.style.animationDelay = pos.delay;
    Object.assign(s.style, pos);
    container.appendChild(s);
  });
}

function removeSparkles(container) {
  $$(".sparkle", container).forEach(s => s.remove());
}

function renderStats(stats) {
  const grid = $("#stats-grid");
  const todayPts = stats.today.points;
  const items = [
    {
      label: "Puntos ganados", value: "+" + fmt(stats.won), cls: "pos",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`
    },
    {
      label: "Puntos perdidos", value: "-" + fmt(stats.lost), cls: "neg",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
    },
    {
      label: "Hoy", value: (todayPts >= 0 ? "+" : "") + fmt(todayPts), cls: todayPts >= 0 ? "pos" : "neg",
      sub: stats.today.count + (stats.today.count === 1 ? " registro" : " registros"),
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`
    },
    {
      label: "Racha activa", value: stats.streak, sub: stats.streak === 1 ? "día seguido" : "días seguidos", cls: "",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`
    },
    {
      label: "Mejor día", value: stats.bestDay.points > 0 ? "+" + fmt(stats.bestDay.points) : "—",
      sub: stats.bestDay.date ? fmtDateShort(stats.bestDay.date) : "Sin registros", cls: "",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
    },
    {
      label: "Total registros", value: fmt((currentPerson().records || []).length), cls: "",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`
    }
  ];
  grid.innerHTML = items.map((it, i) => `
    <div class="stat" style="--i:${i}">
      <div class="stat-label"><span class="stat-icon">${it.icon}</span>${esc(it.label)}</div>
      <div class="stat-value num ${it.cls || ""}">${esc(it.value)}</div>
      ${it.sub ? `<div class="stat-sub">${esc(it.sub)}</div>` : ""}
    </div>
  `).join("");
}

function renderCategories(person) {
  const grid = $("#categories-grid");
  const cats = person.categories || [];
  grid.innerHTML = cats.map((c, i) => {
    const emoji = catEmoji(c.name);
    const pts = c.points === null
      ? `<span class="cat-pts crit">A criterio</span>`
      : `<span class="cat-pts ${c.points >= 0 ? "pos" : "neg"} num">${c.points >= 0 ? "+" : ""}${fmt(c.points)}</span>`;
    return `
      <button type="button" class="cat-btn" data-name="${esc(c.name)}" style="--i:${i}" aria-label="Categoría ${esc(c.name)}">
        <span class="emoji" aria-hidden="true">${emoji}</span>
        <span class="cat-name">${esc(c.name)}</span>
        ${pts}
      </button>
    `;
  }).join("");

  $$(".cat-btn", grid).forEach(btn => {
    btn.addEventListener("click", (e) => {
      addRipple(btn, e);
      const name = btn.getAttribute("data-name");
      const cat = person.categories.find(c => c.name === name);
      if (cat && cat.points !== null) {
        floatPoints(btn, cat.points);
      }
      toast(`Para registrar '${name}', anótalo en el Google Sheet y se sincronizará aquí.`, "info", 4000);
    });
  });
}

function renderCategorySummary(stats) {
  const container = $("#category-summary");
  const cats = Object.values(stats.byCat);
  if (cats.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="emoji">📊</div>
        <h3>Sin datos todavía</h3>
        <p>Los registros aparecerán en cuanto los agregues al Google Sheet.</p>
      </div>`;
    return;
  }
  cats.sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...cats.map(c => c.count));
  container.innerHTML = cats.map((c, i) => `
    <div class="cat-row" style="--i:${i}">
      <span class="emoji" aria-hidden="true">${catEmoji(c.name)}</span>
      <div class="info">
        <div class="name">${esc(c.name)}</div>
        <div class="bar"><div class="bar-fill" data-w="${(c.count / maxCount) * 100}"></div></div>
        <div class="count">${fmt(c.count)} ${c.count === 1 ? "registro" : "registros"}</div>
      </div>
      <div class="points num ${c.points >= 0 ? "pos" : "neg"}">${c.points >= 0 ? "+" : ""}${fmt(c.points)}</div>
    </div>
  `).join("");

  requestAnimationFrame(() => {
    $$(".bar-fill", container).forEach(b => {
      b.style.width = b.getAttribute("data-w") + "%";
    });
  });
}

function renderHistory(person) {
  const container = $("#history-list");
  const recs = [...(person.records || [])].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id - a.id;
  }).slice(0, 35);

  if (recs.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="emoji">🗒️</div>
        <h3>Aún no hay registros</h3>
        <p>Añade actividades en tu Google Sheet para ver el historial.</p>
      </div>`;
    return;
  }

  container.innerHTML = recs.map((r, i) => `
    <article class="history-item" data-id="${r.id}" style="--i:${i}">
      <span class="emoji" aria-hidden="true">${catEmoji(r.category)}</span>
      <div class="info">
        <div class="cat-name">${esc(r.category)}</div>
        ${r.reason ? `<div class="reason">${esc(r.reason)}</div>` : ""}
        <div class="meta">${esc(fmtDateShort(r.date))}</div>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <div class="pts num ${r.points >= 0 ? "pos" : "neg"}">${r.points >= 0 ? "+" : ""}${fmt(r.points)}</div>
      </div>
    </article>
  `).join("");
}

/* ==========================================================================
   GRÁFICOS (Chart.js)
   ========================================================================== */
let chartLine = null, chartBars = null;

function getChartColors() {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    text: isDark ? "#b8bfbb" : "#4a5451",
    grid: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
    pos: "#2f8f4f",
    neg: "#c7523a",
    forest: isDark ? "#3fa076" : "#1f5d3d"
  };
}

function renderCharts(stats) {
  if (typeof Chart === "undefined") return;
  const colors = getChartColors();
  const labels = stats.series.labels.map(fmtDateShort);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (chartLine) { chartLine.destroy(); chartLine = null; }
  if (chartBars) { chartBars.destroy(); chartBars = null; }

  const commonOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion ? false : { duration: 1100, easing: "easeOutQuart" },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(23,31,27,0.96)",
        titleColor: "#fff",
        bodyColor: "#fff",
        borderColor: "rgba(255,255,255,0.12)",
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        displayColors: false,
        titleFont: { family: "Manrope, system-ui", weight: "700", size: 12 },
        bodyFont: { family: "Manrope, system-ui", size: 13 },
        callbacks: {
          label: (ctx) => `${ctx.parsed.y >= 0 ? "+" : ""}${fmt(ctx.parsed.y)} pts`
        }
      }
    },
    scales: {
      x: {
        ticks: { color: colors.text, font: { family: "Manrope, system-ui", size: 10 }, maxRotation: 0, autoSkipPadding: 14 },
        grid: { display: false },
        border: { display: false }
      },
      y: {
        ticks: { color: colors.text, font: { family: "Manrope, system-ui", size: 10 }, callback: (v) => fmt(v) },
        grid: { color: colors.grid },
        border: { display: false }
      }
    }
  };

  const lineCanvas = $("#chart-line");
  if (lineCanvas) {
    const lineCtx = lineCanvas.getContext("2d");
    const gradient = lineCtx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, colors.forest + "66");
    gradient.addColorStop(1, colors.forest + "00");

    chartLine = new Chart(lineCtx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Acumulado",
          data: stats.series.accum,
          borderColor: colors.forest,
          backgroundColor: gradient,
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: colors.forest,
          pointHoverBorderColor: "#fff",
          pointHoverBorderWidth: 2,
          pointHitRadius: 12
        }]
      },
      options: commonOpts
    });
  }

  const barCanvas = $("#chart-bars");
  if (barCanvas) {
    const barColors = stats.series.daily.map(v => v >= 0 ? colors.pos : colors.neg);
    chartBars = new Chart(barCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Puntos",
          data: stats.series.daily,
          backgroundColor: barColors,
          borderRadius: 5,
          borderSkipped: false,
          maxBarThickness: 20
        }]
      },
      options: {
        ...commonOpts,
        animation: reduceMotion ? false : {
          duration: 1200,
          easing: "easeOutQuart",
          delay: (ctx) => ctx.type === "data" ? ctx.dataIndex * 25 : 0
        }
      }
    });
  }
}

/* ==========================================================================
   CONFETI
   ========================================================================== */
function triggerConfetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = $("#confetti");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = [];
  const colors = ["#c9a24f", "#e0c07a", "#1f5d3d", "#2d7a52", "#5bbd8e", "#fff5d1", "#f0d090"];
  const shapes = ["rect", "circle", "star"];

  for (let i = 0; i < 180; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 14 + 6;
    particles.push({
      x: canvas.width / 2,
      y: canvas.height * 0.35,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      g: 0.32,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      drag: 0.985
    });
  }

  const start = performance.now();
  function drawStar(x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.rot += p.vr;
      if (p.y < canvas.height + 40) alive++;
      ctx.fillStyle = p.color;
      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "star") {
        drawStar(p.x, p.y, p.size, p.rot);
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    });
    if (alive > 0 && elapsed < 4000) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}

/* ==========================================================================
   SELECTOR DE PERSONA
   ========================================================================== */
function renderPersonSelector() {
  const container = $(".person-selector");
  const pill = $("#selector-pill");
  container.innerHTML = `<span class="selector-pill" id="selector-pill"></span>` + state.persons.map(p => `
    <button type="button" class="person-btn" data-key="${p.key}" role="tab" aria-selected="${p.key === state.selectedKey}">
      <span class="avatar">${p.name.charAt(0)}</span>
      <span class="person-name">${esc(p.name)}</span>
    </button>
  `).join("");

  $$(".person-btn", container).forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-key");
      if (key === state.selectedKey) return;
      state.selectedKey = key;
      $$(".person-btn", container).forEach(b => b.setAttribute("aria-selected", b === btn));
      positionPill();
      render();
    });
  });
  positionPill();
}

function positionPill() {
  const pill = $("#selector-pill");
  const activeBtn = $(`.person-btn[data-key="${state.selectedKey}"]`);
  if (!pill || !activeBtn) return;
  pill.style.transform = `translateX(${activeBtn.offsetLeft - 4}px)`;
  pill.style.width = `${activeBtn.offsetWidth}px`;
}

/* ==========================================================================
   REVEAL Y TILT 3D
   ========================================================================== */
function setupReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  $$(".reveal").forEach(el => observer.observe(el));
}

function setupTilt() {
  if (window.matchMedia("(hover: none)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  $$(".card").forEach(card => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(1000px) rotateX(${-y * 2.2}deg) rotateY(${x * 2.2}deg) translateY(-2px)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

/* ==========================================================================
   SINCRONIZACIÓN EN TIEMPO REAL Y TIMER
   ========================================================================== */
let countdownTimer = null;

async function triggerDataSync(isManual = false) {
  if (state.isSyncing) return;
  state.isSyncing = true;

  const syncBadge = $("#sync-status");
  const syncLabel = $("#sync-label");
  const refreshBtn = $("#btn-manual-sync");

  if (syncBadge) syncBadge.classList.add("syncing");
  if (syncLabel) syncLabel.textContent = "Actualizando…";
  if (refreshBtn) refreshBtn.classList.add("spinning");

  try {
    const data = await apiGetAll();
    state.today = data.today || todayISO();
    state.persons = data.persons || [];
    if (!state.selectedKey && state.persons.length) {
      state.selectedKey = state.persons[0].key;
    }
    state.loaded = true;

    $("#initial-loading")?.classList.add("hidden");
    $("#dashboard")?.classList.remove("hidden");

    renderPersonSelector();
    render();
    positionPill();

    if (syncBadge) syncBadge.classList.remove("syncing", "error");
    if (syncLabel) {
      const timeStr = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      syncLabel.textContent = `Sincronizado (${timeStr})`;
    }
    if (isManual) {
      toast("Datos sincronizados desde Google Sheets", "success", 2500);
    }
  } catch (err) {
    console.error("Error en sincronización:", err);
    if (syncBadge) {
      syncBadge.classList.remove("syncing");
      syncBadge.classList.add("error");
    }
    if (syncLabel) syncLabel.textContent = "Error al sincronizar";
    if (isManual) {
      toast(err.message || "Error al sincronizar", "error", 4500);
    }
  } finally {
    state.isSyncing = false;
    state.syncCountdown = REFRESH_SECONDS;
    if (refreshBtn) refreshBtn.classList.remove("spinning");
  }
}

function startSyncLoop() {
  if (countdownTimer) clearInterval(countdownTimer);
  state.syncCountdown = REFRESH_SECONDS;

  countdownTimer = setInterval(async () => {
    state.syncCountdown--;
    const timerEl = $("#sync-timer");
    if (timerEl) {
      timerEl.textContent = `${state.syncCountdown}s`;
    }

    if (state.syncCountdown <= 0) {
      state.syncCountdown = REFRESH_SECONDS;
      await triggerDataSync(false);
    }
  }, 1000);
}

// Sincronizar inmediatamente cuando la pestaña vuelve a ser visible
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    triggerDataSync(false);
  }
});

/* ==========================================================================
   INICIALIZACIÓN
   ========================================================================== */
async function init() {
  const header = $("#header");
  const onScroll = () => {
    if (window.scrollY > 10) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Botón manual de refresco
  $("#btn-manual-sync")?.addEventListener("click", () => triggerDataSync(true));

  // Botón de modal de tiempo real
  $("#btn-config-realtime")?.addEventListener("click", openRealtimeModal);
  updateRealtimeButtonState();

  // Banner trophy click -> Confeti
  $(".trophy")?.addEventListener("click", triggerConfetti);

  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      positionPill();
      if (chartLine) chartLine.resize();
      if (chartBars) chartBars.resize();
      const cv = $("#confetti");
      if (cv) { cv.width = window.innerWidth; cv.height = window.innerHeight; }
    }, 150);
  });

  // Carga inicial
  await triggerDataSync(false);
  setupReveal();
  setupTilt();
  startSyncLoop();
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.loaded) {
    const person = currentPerson();
    if (person) renderCharts(computeStats(person));
  }
});

document.addEventListener("DOMContentLoaded", init);
