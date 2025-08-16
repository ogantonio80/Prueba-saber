// ------ UTILIDADES ------
const $ = (s) => document.querySelector(s);

// Estado global
let MANIFEST = null;                 // manifest.json
let CONTENT_CACHE = {};              // { subject: { area: areaDataJson } }
let CURRENT_USER = null;             // "Alba" | "Lara" | "Prueba"
let MODE = "estudio";                // "estudio" | "practica" | "simulador"
let CURRENT_SELECTION = { subject: null, area: null, topic: null };
let PRACTICE_QUEUE = [];             // cola de preguntas del tema actual
let PRACTICE_IDX = 0;

// Temas por usuaria (colores)
const USER_STYLE = {
  Alba:  { bg: "pink",   badge: "Rosa"   },
  Lara:  { bg: "violet", badge: "Morado" },
  Prueba:{ bg: "lightgreen", badge: "Verde" },
};

// ------ LOGIN ------
function attachLogin() {
  document.querySelectorAll(".user-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      CURRENT_USER = btn.dataset.user;
      $("#current-user").textContent = `Usuario: ${CURRENT_USER} (${USER_STYLE[CURRENT_USER].badge})`;
      $("#login-screen").style.display = "none";
      $("#main-app").style.display = "block";
      loadManifest().then(() => populateSubjects());
    });
  });
}

// ------ CARGA MANIFEST Y CONTENIDOS ------
async function loadManifest() {
  try {
    const res = await fetch("manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo cargar manifest.json");
    MANIFEST = await res.json(); // { subjects: { "Matemáticas": { areas: { "Álgebra": "content/matematicas_algebra.json", ... } } } }
  } catch (e) {
    alert("No pude cargar manifest.json. Sube este archivo a la raíz del repo.");
    console.error(e);
  }
}

function subjectsList() {
  if (!MANIFEST || !MANIFEST.subjects) return [];
  return Object.keys(MANIFEST.subjects);
}

function areasMap(subject) {
  // { "Álgebra": "content/matematicas_algebra.json", ... }
  if (!MANIFEST?.subjects?.[subject]?.areas) return {};
  return MANIFEST.subjects[subject].areas;
}

async function ensureAreaLoaded(subject, area) {
  CONTENT_CACHE[subject] = CONTENT_CACHE[subject] || {};
  if (CONTENT_CACHE[subject][area]) return;
  const path = areasMap(subject)[area];
  if (!path) return;
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    console.warn("No se pudo cargar el archivo de área:", path);
    return;
  }
  CONTENT_CACHE[subject][area] = await res.json(); // { "Tema X": { lesson:{...}, items:[...] }, ... }
}

function topicsList(subject, area) {
  const areaData = CONTENT_CACHE?.[subject]?.[area] || {};
  return Object.keys(areaData);
}

function getLesson(subject, area, topic) {
  return CONTENT_CACHE?.[subject]?.[area]?.[topic]?.lesson || null;
}

function getItems(subject, area, topic) {
  return CONTENT_CACHE?.[subject]?.[area]?.[topic]?.items || [];
}

// ------ MENÚS (2 select: Materia y Tema) ------
// Materia = Asignatura
// Tema = "Área — Tema" (unimos área+tema en una sola lista para simplificar el HTML)
async function populateSubjects() {
  const selMateria = $("#materia");
  const subs = subjectsList();
  selMateria.innerHTML = subs.map(s => `<option value="${s}">${s}</option>`).join("");
  selMateria.onchange = () => populateTopics();
  // Inicial
  if (subs.length) {
    selMateria.value = subs[0];
    await populateTopics();
  }
}

async function populateTopics() {
  const subject = $("#materia").value;
  const selTema = $("#tema");
  selTema.innerHTML = `<option>Cargando temas…</option>`;

  // Cargar todas las áreas del subject y construir una lista combinada "Área — Tema"
  const areas = Object.keys(areasMap(subject));
  const combined = [];
  for (const area of areas) {
    await ensureAreaLoaded(subject, area);
    const topics = topicsList(subject, area);
    topics.forEach(t => combined.push({ area, topic: t }));
  }

  if (!combined.length) {
    selTema.innerHTML = `<option>No hay temas (sube archivos a /content y actualiza manifest.json)</option>`;
    return;
  }

  selTema.innerHTML = combined
    .map(obj => `<option value="${obj.area}::${obj.topic}">${obj.area} — ${obj.topic}</option>`)
    .join("");

  // Botón comenzar
  $("#start-btn").onclick = () => {
    const val = $("#tema").value || "";
    const [area, topic] = val.split("::");
    CURRENT_SELECTION = { subject, area, topic };
    startMode();
  };
}

// ------ CAMBIO DE MODO ------
function attachModeButtons() {
  document.querySelectorAll(".menu-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      MODE = btn.dataset.mode; // estudio | practica | simulador
      startMode();
    });
  });
}

function startMode() {
  $("#content-panel").style.display = "block";
  $("#study-content").style.display = MODE === "estudio" ? "block" : "none";
  $("#practice-content").style.display = MODE === "practica" ? "block" : "none";
  $("#simulator-content").style.display = MODE === "simulador" ? "block" : "none";

  if (!CURRENT_SELECTION.subject) return;

  if (MODE === "estudio") renderStudy();
  if (MODE === "practica") startPractice();
  if (MODE === "simulador") startSimulator();
}

// ------ ESTUDIO ------
function renderStudy() {
  const { subject, area, topic } = CURRENT_SELECTION;
  const L = getLesson(subject, area, topic);
  $("#study-title").textContent = `${subject} → ${area} → ${topic}`;
  if (!L) {
    $("#study-text").textContent = "No hay lección en este tema. Sube contenido en /content y actualiza manifest.json.";
    $("#study-image").style.display = "none";
  } else {
    $("#study-text").textContent = L.summary || "Sin resumen.";
    // Si hay imágenes SVG en la lección, ignóralas aquí (este HTML base no las renderiza).
    $("#study-image").style.display = "none";
  }
  $("#next-topic-btn").onclick = nextTopic;
}

function nextTopic() {
  const { subject } = CURRENT_SELECTION;
  const areas = Object.keys(areasMap(subject));
  // Construimos lista combinada para encontrar el "siguiente"
  const list = [];
  for (const a of areas) {
    const ts = topicsList(subject, a);
    ts.forEach(t => list.push({ area: a, topic: t }));
  }
  const idx = list.findIndex(x => x.area === CURRENT_SELECTION.area && x.topic === CURRENT_SELECTION.topic);
  const nxt = list[(idx + 1) % list.length];
  CURRENT_SELECTION.area = nxt.area;
  CURRENT_SELECTION.topic = nxt.topic;
  if (MODE === "estudio") renderStudy();
  if (MODE === "practica") startPractice();
}

// ------ PRÁCTICA ------
function startPractice() {
  const { subject, area, topic } = CURRENT_SELECTION;
  const items = getItems(subject, area, topic);
  if (!items.length) {
    $("#question-title").textContent = "No hay preguntas en este tema.";
    $("#options").innerHTML = "";
    $("#feedback").textContent = "";
    $("#next-question-btn").style.display = "none";
    return;
  }
  // Cola simple (puedes mejorar a futuro con adaptatividad)
  PRACTICE_QUEUE = shuffle(items.slice()); // copia
  PRACTICE_IDX = 0;
  renderPracticeQuestion();
}

function renderPracticeQuestion() {
  const q = PRACTICE_QUEUE[PRACTICE_IDX];
  $("#question-title").textContent = q?.stem || "";
  const box = $("#options");
  box.innerHTML = "";
  $("#feedback").textContent = "";
  $("#next-question-btn").style.display = "none";

  q.choices.forEach((c, i) => {
    const btn = document.createElement("button");
    btn.textContent = c;
    btn.onclick = () => {
      // colorear
      [...box.children].forEach((b, k) => {
        b.disabled = true;
        if (k === q.answerIndex) b.classList.add("correct");
        if (k === i && i !== q.answerIndex) b.classList.add("incorrect");
      });
      // feedback
      $("#feedback").textContent = q.explanation || "";
      $("#next-question-btn").style.display = "inline-block";
    };
    box.appendChild(btn);
  });

  $("#next-question-btn").onclick = () => {
    PRACTICE_IDX++;
    if (PRACTICE_IDX >= PRACTICE_QUEUE.length) {
      PRACTICE_IDX = 0;
      PRACTICE_QUEUE = shuffle(PRACTICE_QUEUE);
    }
    renderPracticeQuestion();
  };
}

// ------ SIMULADOR (muy sencillo, usa el tema elegido) ------
function startSimulator() {
  const { subject, area, topic } = CURRENT_SELECTION;
  const items = getItems(subject, area, topic);
  const pool = items.slice(0, 20); // 20 por defecto; luego lo ampliamos
  let idx = 0;

  const render = () => {
    const q = pool[idx];
    $("#sim-question").textContent = q?.stem || "No hay preguntas.";
    const box = $("#sim-options");
    box.innerHTML = "";
    $("#sim-feedback").textContent = "";
    $("#next-sim-btn").style.display = pool.length ? "none" : "none";

    if (!q) return;

    q.choices.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.textContent = c;
      btn.onclick = () => {
        [...box.children].forEach((b, k) => {
          b.disabled = true;
          if (k === q.answerIndex) b.classList.add("correct");
          if (k === i && i !== q.answerIndex) b.classList.add("incorrect");
        });
        $("#sim-feedback").textContent = q.explanation || "";
        $("#next-sim-btn").style.display = "inline-block";
      };
      box.appendChild(btn);
    });
  };

  $("#next-sim-btn").onclick = () => {
    idx = (idx + 1) % pool.length;
    render();
  };

  render();
}

// ------ HELPERS ------
function shuffle(arr) {
  let a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ------ INICIO ------
attachLogin();
attachModeButtons();
