import { FilesetResolver, HandLandmarker, FaceLandmarker, PoseLandmarker, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import { verifyAdminPassword } from "./admin-auth.js";

// Configuración inicial

const $ = (id) => document.getElementById(id);
const letters = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");

const words = [
  {name:"Hola",emoji:"👋",category:"Saludos",desc:"Una forma cotidiana de iniciar una conversación."},
  {name:"Buenos días",emoji:"🌅",category:"Saludos",desc:"Expresión de saludo usada por la mañana."},
  {name:"Buenas tardes",emoji:"🌤️",category:"Saludos",desc:"Expresión de saludo para la tarde."},
  {name:"Buenas noches",emoji:"🌙",category:"Saludos",desc:"Saludo o despedida relacionada con la noche."},
  {name:"Adiós",emoji:"👋",category:"Saludos",desc:"Expresión para despedirse."},
  {name:"Gracias",emoji:"💚",category:"Cortesía",desc:"Expresión para agradecer."},
  {name:"Por favor",emoji:"🙏",category:"Cortesía",desc:"Expresión de cortesía al pedir algo."},
  {name:"Perdón",emoji:"🤝",category:"Cortesía",desc:"Expresión para disculparse o pedir permiso."},
  {name:"Sí",emoji:"✅",category:"Respuestas",desc:"Respuesta afirmativa."},
  {name:"No",emoji:"❌",category:"Respuestas",desc:"Respuesta negativa."},
  {name:"Familia",emoji:"👨‍👩‍👧",category:"Familia",desc:"Palabra relacionada con familiares y vínculos."},
  {name:"Mamá",emoji:"👩",category:"Familia",desc:"Nombre familiar para la madre."},
  {name:"Papá",emoji:"👨",category:"Familia",desc:"Nombre familiar para el padre."},
  {name:"Amigo",emoji:"🤝",category:"Familia",desc:"Palabra para hablar de amistad."},
  {name:"Escuela",emoji:"🏫",category:"Escuela",desc:"Lugar donde se realizan actividades de aprendizaje."},
  {name:"Maestro",emoji:"🧑‍🏫",category:"Escuela",desc:"Persona que enseña o acompaña el aprendizaje."},
  {name:"Libro",emoji:"📘",category:"Escuela",desc:"Material impreso o digital para leer y estudiar."},
  {name:"Estudiar",emoji:"📚",category:"Escuela",desc:"Actividad de aprender y repasar conocimientos."},
  {name:"Agua",emoji:"💧",category:"Vida diaria",desc:"Palabra cotidiana relacionada con una bebida esencial."},
  {name:"Comida",emoji:"🍎",category:"Vida diaria",desc:"Palabra relacionada con los alimentos."},
  {name:"Casa",emoji:"🏠",category:"Vida diaria",desc:"Lugar donde vive una persona o familia."},
  {name:"Ayuda",emoji:"🆘",category:"Vida diaria",desc:"Palabra para solicitar apoyo."},
  {name:"Feliz",emoji:"😊",category:"Emociones",desc:"Describe un estado de alegría o bienestar."},
  {name:"Triste",emoji:"😔",category:"Emociones",desc:"Describe un estado de tristeza."}
];

const vocabCategories = ["Todas", ...new Set(words.map(w=>w.category))];
let activeVocabCategory = "Todas";

let progress = JSON.parse(localStorage.getItem("lsmProgress") || '{"letters":[],"words":[],"lessons":[]}');
progress.lessons = progress.lessons || [];

let selectedLetter = null;
let recallIndex = 0, recallRemembered = 0, recallNeedsWork = 0;
let selectedStudy = null;
let selectedPractice = null;

let practiceTemplates = {};
try {
  practiceTemplates = JSON.parse(localStorage.getItem("lsmPracticeTemplates_v1") || "{}");
} catch (e) {
  practiceTemplates = {};
}

let practiceRecordingMode = null, practiceFrames = [], practiceRecordingStartedAt = 0, lastPracticeSampleAt = 0;
let adminModeActive = false, adminFailedAttempts = 0, adminLockedUntil = 0;

const MAX_PRACTICE_FRAMES = 90;

let stream = null, handTask = null, faceTask = null, poseTask = null, raf = null, lastVideoTime = -1;
let visionReady = false;

// Sistema de progreso

function saveProgress(){
  localStorage.setItem("lsmProgress",JSON.stringify(progress));
  updateStats();
}

function updateStats(){
  $("statLessons").textContent = progress.lessons.length;
  $("statWords").textContent = progress.words.length;
  $("statStreak").textContent = progress.letters.length+progress.words.length ? "1 día" : "0 días";
  $("letterCounter").textContent = `${progress.letters.length} / ${letters.length} exploradas`;

  const total=lessons.length+letters.length+words.length, done=progress.lessons.length+progress.letters.length+progress.words.length;
  const pct=Math.round(done/total*100);

  $("progressPercent").textContent=pct+"%";
  $("progressText").textContent=`Has explorado ${done} de ${total} elementos disponibles. Cada práctica cuenta.`;

  document.querySelector(".progress-ring").style.background=`conic-gradient(#5368dc ${pct*3.6}deg,#e9edf5 0deg)`;

  const activity=[
    ...progress.lessons.map(id=>({name:lessons.find(l=>l.id===id)?.title||id,type:"Teoría"})),
    ...progress.letters.map(x=>({name:`Letra ${x}`,type:"Abecedario"})),
    ...progress.words.map(x=>({name:x,type:"Vocabulario"}))
  ];

  $("activityList").innerHTML=activity.length
    ?activity.map(a=>`<div class="activity-row"><span>${a.name} · ${a.type}</span><span>✓ Estudiado</span></div>`).join("")
    :'<p class="muted">Todavía no hay actividad registrada.</p>';

  document.querySelectorAll(".letter-tile").forEach(tile=>tile.classList.toggle("done",progress.letters.includes(tile.dataset.letter)));
}

// Abecedario

function renderAlphabet(){
  $("alphabetGrid").innerHTML=letters.map(l=>`<button class="letter-tile ${progress.letters.includes(l)?"done":""}" data-letter="${l}"><strong>${l}</strong><small>${progress.letters.includes(l)?"Estudiada":"Explorar"}</small></button>`).join("");

  $("alphabetGrid").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>openLetter(b.dataset.letter)));
}

function openLetter(l){
  selectedLetter=l;
  selectedStudy={type:"letter",value:l,name:`Letra ${l}`};

  $("studyType").textContent="ABECEDARIO · FICHA DE ESTUDIO";
  $("modalLetter").textContent=l;
  $("modalTitle").textContent=`Letra ${l}`;
  $("modalDescription").textContent=`Estudia la letra ${l} del alfabeto dactilológico mexicano. Abre la referencia de UABCS para observar el material visual de cada letra.`;

  $("studyReference").href="https://biblio.uabcs.mx/recursosedu/lsm/";
  $("studyReference").textContent="Ver alfabeto visual UABCS ↗";

  $("markLetter").textContent=progress.letters.includes(l)?"Ya está estudiada":"Marcar como estudiada";
  $("letterModal").hidden=false;
}

// Vocabulario

function openWord(index){
  const w=words[index];

  selectedLetter=null;
  selectedStudy={type:"word",value:w.name,name:w.name};

  $("studyType").textContent="VOCABULARIO · FICHA DE ESTUDIO";
  $("modalLetter").textContent=w.emoji;
  $("modalTitle").textContent=w.name;
  $("modalDescription").textContent=`${w.desc} Consulta el glosario de INDISCAPACIDAD CDMX y busca esta palabra para observar una referencia en video, si está disponible.`;

  $("studyReference").href="https://lsm.indiscapacidad.cdmx.gob.mx/";
  $("studyReference").textContent=`Buscar “${w.name}” en el glosario LSM ↗`;

  $("markLetter").textContent=progress.words.includes(w.name)?"Ya está estudiada":"Marcar como estudiada";
  $("letterModal").hidden=false;
}

function renderWords(){
  const query=($("vocabSearch")?.value||"").trim().toLocaleLowerCase("es-MX");

  const filtered=words.map((w,i)=>({...w,index:i})).filter(w=>
    (activeVocabCategory==="Todas"||w.category===activeVocabCategory)&&
    (`${w.name} ${w.desc} ${w.category}`).toLocaleLowerCase("es-MX").includes(query)
  );

  $("vocabGrid").innerHTML=filtered.length
    ?filtered.map(w=>`<article class="vocab-card"><div class="vocab-emoji">${w.emoji}</div><span class="vocab-category">${w.category}</span><h3>${w.name}</h3><p>${w.desc}</p><button class="text-link" data-word="${w.index}">${progress.words.includes(w.name)?"✓ Estudiada":"Abrir ficha de aprendizaje"} →</button></article>`).join("")
    :'<div class="empty-catalog">No se encontraron palabras. Prueba otra búsqueda o categoría.</div>';

  $("vocabGrid").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>openWord(Number(b.dataset.word))));

  if($("catalogCount"))$("catalogCount").textContent=`Mostrando ${filtered.length} de ${words.length} palabras`;

  if($("categoryFilters"))$("categoryFilters").querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.category===activeVocabCategory));
}

function renderVocabFilters(){
  $("categoryFilters").innerHTML=vocabCategories.map(category=>`<button type="button" class="category-chip ${category===activeVocabCategory?"active":""}" data-category="${category}">${category}</button>`).join("");

  $("categoryFilters").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{
    activeVocabCategory=b.dataset.category;
    renderWords();
  }));
}

// Contenido de las lecciones

const lessons = [
  {
    id:"intro",
    level:"01 · FUNDAMENTOS",
    title:"¿Qué es la LSM?",
    time:"5 min",
    summary:"Comprende qué tipo de lengua es y quiénes la utilizan.",
    sections:[
      ["Una lengua completa", "La Lengua de Señas Mexicana (LSM) es una lengua natural que utiliza configuraciones y movimientos de las manos, el espacio, el cuerpo y elementos no manuales para construir significado. Tiene vocabulario y reglas gramaticales propias; no es simplemente español representado con las manos."],
      ["Una lengua de una comunidad", "La LSM forma parte de la identidad, cultura y vida comunitaria de muchas personas sordas en México. No todas las personas sordas usan LSM: algunas se comunican de otras maneras y sus preferencias deben respetarse."],
      ["¿Dónde se utiliza?", "Se utiliza en conversaciones cotidianas, educación, reuniones, actividades culturales y distintos espacios comunitarios. Su uso puede presentar variaciones regionales y sociales."]
    ],
    takeaway:"La LSM es una lengua natural con estructura propia, vinculada a una comunidad y cultura; no es universal ni una traducción literal del español.",
    question:"¿Cuál afirmación describe correctamente a la LSM?",
    options:["Es una lengua natural con gramática propia.","Es español representado palabra por palabra.","Es un sistema universal idéntico en todos los países."],
    answer:0,
    explain:"La LSM tiene estructura lingüística propia y se desarrolla dentro de la comunidad sorda de México."
  },
  {
    id:"mitos",
    level:"02 · CULTURA Y RESPETO",
    title:"Mitos y realidades",
    time:"4 min",
    summary:"Identifica ideas equivocadas y aprende a comunicarte con respeto.",
    sections:[
      ["No existe una lengua de señas universal", "Cada país o comunidad puede tener una lengua de señas distinta. La LSM no es igual a ASL (lengua de señas estadounidense) ni a otras lenguas."],
      ["No todas las personas sordas señan", "Las personas sordas son diversas. Algunas usan LSM, otras usan español escrito, lectura labial, apoyos tecnológicos u otras estrategias. Pregunta cuál forma de comunicación prefieren."],
      ["La comunidad no es homogénea", "Hay diversidad de experiencias, identidades, edades y formas de participar. Evita asumir que una persona representa a todas las personas sordas."]
    ],
    takeaway:"Pregunta cómo prefiere comunicarse cada persona y evita generalizaciones sobre la comunidad sorda.",
    question:"¿La LSM es igual a la lengua de señas usada en todos los países?",
    options:["Sí, todas son iguales.","No, existen distintas lenguas de señas.","Sí, solo cambia el alfabeto."],
    answer:1,
    explain:"Las lenguas de señas son lenguas distintas, desarrolladas en comunidades y contextos específicos."
  },
  {
    id:"components",
    level:"03 · LINGÜÍSTICA VISUAL",
    title:"Elementos de una seña",
    time:"6 min",
    summary:"Conoce los parámetros que ayudan a describir cómo se articula una seña.",
    sections:[
      ["Configuración manual", "Es la forma o posición que adopta la mano o las manos. Los dedos pueden estar extendidos, flexionados o colocados de distintas maneras."],
      ["Lugar de articulación", "Es la zona del espacio o del cuerpo donde se realiza la seña. La ubicación puede ayudar a distinguir significados."],
      ["Movimiento y orientación", "El movimiento describe cómo se desplazan las manos; la orientación se refiere hacia dónde apunta la palma o los dedos. Estos rasgos pueden cambiar el significado."],
      ["Elementos no manuales", "La expresión facial, la mirada, la posición de la cabeza y el cuerpo también pueden aportar información gramatical o discursiva. No son adornos opcionales."]
    ],
    takeaway:"Para observar una seña no basta con mirar la forma de la mano: también importan el lugar, movimiento, orientación y elementos no manuales.",
    question:"¿Cuál de estos elementos también puede formar parte de la estructura de una seña?",
    options:["La expresión facial.","El color de la ropa.","El sonido de la voz."],
    answer:0,
    explain:"Los elementos no manuales, como la expresión facial y la postura, pueden aportar información lingüística."
  },
  {
    id:"grammar",
    level:"04 · GRAMÁTICA",
    title:"Cómo se organiza la LSM",
    time:"6 min",
    summary:"Entiende por qué no se debe traducir palabra por palabra desde el español.",
    sections:[
      ["No es español manual", "La LSM tiene recursos y reglas gramaticales propios. El orden y la forma de expresar información pueden diferir del español, por lo que traducir cada palabra de manera mecánica no produce necesariamente una expresión natural."],
      ["El espacio comunica", "El espacio frente al cuerpo puede utilizarse para establecer referentes, relacionarlos y organizar partes del discurso. La mirada y la dirección del movimiento pueden contribuir a esas relaciones."],
      ["El rostro también aporta gramática", "Movimientos de cejas, boca, cabeza y cuerpo pueden acompañar construcciones lingüísticas. Su función depende del contexto y de la estructura de la lengua."]
    ],
    takeaway:"Aprender LSM implica aprender cómo organiza significados, no memorizar equivalencias palabra por palabra.",
    question:"¿Por qué no conviene traducir cada palabra del español directamente a señas?",
    options:["Porque la LSM tiene reglas gramaticales propias.","Porque la LSM no puede expresar ideas complejas.","Porque todas las señas tienen un único significado."],
    answer:0,
    explain:"La LSM es una lengua completa y sus estructuras no corresponden necesariamente palabra por palabra con el español."
  },
  {
    id:"interaction",
    level:"05 · COMUNICACIÓN",
    title:"Comunicación respetuosa",
    time:"5 min",
    summary:"Aprende buenas prácticas para iniciar una conversación accesible.",
    sections:[
      ["Antes de iniciar", "Asegúrate de tener la atención de la persona de forma respetuosa. Puedes saludar con un gesto visible o acercarte dentro de su campo visual; evita tocarla bruscamente."],
      ["Mantén el contacto visual", "Cuando converses en LSM, presta atención a la persona y a sus expresiones. No cubras tu rostro ni exageres movimientos de la boca."],
      ["Si no comprendes", "Pide que repita o que explique de otra manera. No finjas entender. Si participa una persona intérprete, dirige la conversación a la persona con quien estás hablando, no a la intérprete."],
      ["Respeta la preferencia", "Pregunta si la persona desea comunicarse mediante LSM, escritura u otro medio. No todas las personas tienen las mismas preferencias."]
    ],
    takeaway:"La comunicación accesible empieza escuchando las preferencias de la persona y tratando a cada interlocutor con respeto.",
    question:"Si no entiendes una seña durante una conversación, ¿qué es lo más adecuado?",
    options:["Fingir que entendiste.","Pedir respetuosamente que la repita o aclare.","Cambiar de tema sin decir nada."],
    answer:1,
    explain:"Pedir una aclaración evita malentendidos y muestra respeto por la comunicación."
  },
  {
    id:"learning",
    level:"06 · MÉTODO DE ESTUDIO",
    title:"Cómo aprender nuevas señas",
    time:"4 min",
    summary:"Usa una rutina de observación, práctica y retroalimentación.",
    sections:[
      ["Observa el modelo completo", "Mira la seña en contexto y presta atención a ambas manos, orientación, movimiento, ubicación, expresión facial y postura."],
      ["Practica con intención", "Repite lentamente y después a una velocidad natural. Evita practicar solo una posición estática cuando la seña requiere movimiento."],
      ["Comprueba con fuentes confiables", "Utiliza materiales elaborados o revisados por personas sordas y docentes competentes en LSM. Las variantes regionales y el contexto importan."],
      ["Recibe retroalimentación", "Pide a una persona competente que revise tu ejecución. Una cámara que detecta puntos de las manos no puede confirmar por sí sola que una seña sea correcta."]
    ],
    takeaway:"Combina modelos confiables, práctica contextualizada y retroalimentación humana; la detección de puntos no equivale a evaluar el significado de una seña.",
    question:"¿Qué permite comprobar mejor si estás realizando una seña de forma adecuada?",
    options:["Solo ver si la cámara detecta una mano.","Comparar con material validado y recibir retroalimentación competente.","Repetir cualquier movimiento muchas veces."],
    answer:1,
    explain:"La detección visual identifica puntos corporales, pero la corrección lingüística requiere modelos de referencia y evaluación competente."
  }
];

let activeLesson = null;

// Sistema de lecciones

function renderLessons(){
  const host=$("lessonCatalog");

  host.innerHTML=lessons.map((l,i)=>`<article class="lesson-card"><div class="lesson-top"><span>${l.level}</span><span>${progress.lessons.includes(l.id)?"✓ Completada":"Lección " + (i+1)}</span></div><div class="lesson-icon">${["📘","🤝","✋","🧠","💬","🎯"][i]}</div><h3>${l.title}</h3><p>${l.summary}</p><div class="lesson-bottom"><small>◷ ${l.time}</small><button class="text-link" data-lesson="${l.id}">${progress.lessons.includes(l.id)?"Repasar":"Comenzar"} →</button></div></article>`).join("");

  host.querySelectorAll("[data-lesson]").forEach(b=>b.addEventListener("click",()=>openLesson(b.dataset.lesson)));
}

function openLesson(id){
  activeLesson=lessons.find(l=>l.id===id);
  if(!activeLesson)return;

  const reader=$("lessonReader");

  reader.innerHTML=`<div class="lesson-reader-head"><button class="btn btn-secondary btn-small" id="backLessons">← Todas las clases</button><span class="lesson-level">${activeLesson.level}</span></div><h2>${activeLesson.title}</h2><p class="lesson-intro">${activeLesson.summary}</p>${activeLesson.sections.map((part,i)=>`<section class="theory-block"><h3>${i+1}. ${part[0]}</h3><p>${part[1]}</p></section>`).join("")}<div class="takeaway"><strong>IDEA CLAVE</strong><p>${activeLesson.takeaway}</p></div><div class="lesson-quiz" id="lessonQuiz"><h3>Comprueba lo aprendido</h3><p>${activeLesson.question}</p><div class="quiz-options">${activeLesson.options.map((o,i)=>`<button class="quiz-option" data-answer="${i}">${String.fromCharCode(65+i)}. ${o}</button>`).join("")}</div><p class="quiz-feedback" id="quizFeedback" aria-live="polite"></p></div>`;

  reader.hidden=false;
  $("lessonCatalog").hidden=true;
  reader.scrollIntoView({behavior:"smooth",block:"start"});

  $("backLessons").addEventListener("click",()=>{
    reader.hidden=true;
    $("lessonCatalog").hidden=false;
    renderLessons();
  });

  reader.querySelectorAll("[data-answer]").forEach(btn=>btn.addEventListener("click",()=>{
    const chosen=Number(btn.dataset.answer),feedback=$("quizFeedback");

    reader.querySelectorAll("[data-answer]").forEach(b=>b.disabled=true);

    if(chosen===activeLesson.answer){
      btn.classList.add("correct");
      feedback.textContent="¡Muy bien! "+activeLesson.explain;
      feedback.className="quiz-feedback success";

      if(!progress.lessons.includes(activeLesson.id)){
        progress.lessons.push(activeLesson.id);
        saveProgress();
        showToast("Lección completada y guardada.");
      }

      renderLessons();
    }else{
      btn.classList.add("incorrect");
      feedback.textContent="Todavía no. "+activeLesson.explain+" Puedes volver a intentarlo.";
      feedback.className="quiz-feedback error";

      const retry=document.createElement("button");
      retry.className="btn btn-secondary btn-small retry-quiz";
      retry.textContent="Intentar de nuevo";
      retry.onclick=()=>openLesson(activeLesson.id);

      feedback.appendChild(retry);
    }
  }));
}

// Repaso de memoria

function renderRecall(){
  recallIndex=0;
  recallRemembered=0;
  recallNeedsWork=0;

  $("recallFinish").hidden=true;
  $("recallCounter").textContent=`Tarjeta 1 de ${words.length}`;
  $("recallScore").textContent="0 recordadas";

  showRecallCard();
}

function showRecallCard(){
  if(recallIndex>=words.length){
    $("recallWord").textContent="Ronda completada";
    $("recallPrompt").textContent="Has terminado todas las tarjetas de esta ronda.";
    $("recallReference").hidden=true;
    $("recallRemember").hidden=true;
    $("recallAgain").hidden=true;

    $("recallCounter").textContent=`${words.length} de ${words.length} tarjetas`;
    $("recallResult").textContent=`Marcaste ${recallRemembered} como recordadas y ${recallNeedsWork} para repasar. Es una autoevaluación personal, no una calificación de la seña.`;
    $("recallFinish").hidden=false;

    return;
  }

  const w=words[recallIndex];

  $("recallWord").textContent=w.name;
  $("recallPrompt").textContent=`${w.desc} Intenta recordar la seña antes de consultar una referencia visual.`;
  $("recallReference").hidden=false;
  $("recallCounter").textContent=`Tarjeta ${recallIndex+1} de ${words.length}`;
  $("recallScore").textContent=`${recallRemembered} recordadas`;

  $("recallRemember").hidden=false;
  $("recallAgain").hidden=false;
}

function answerRecall(remembered){
  if(remembered)recallRemembered++;
  else recallNeedsWork++;

  recallIndex++;
  showRecallCard();
}

$("recallRemember").addEventListener("click",()=>answerRecall(true));
$("recallAgain").addEventListener("click",()=>answerRecall(false));

$("restartRecall").addEventListener("click",()=>{
  $("recallRemember").hidden=false;
  $("recallAgain").hidden=false;
  renderRecall();
});

// Notificaciones

function showToast(msg){
  $("toast").textContent=msg;
  $("toast").classList.add("show");
  setTimeout(()=>$("toast").classList.remove("show"),2300);
}

// Práctica asistida

const fingerGroups = [
  { name: "pulgar", from: 1, to: 4 },
  { name: "índice", from: 5, to: 8 },
  { name: "dedo medio", from: 9, to: 12 },
  { name: "anular", from: 13, to: 16 },
  { name: "meñique", from: 17, to: 20 }
];

function currentPracticeKey() {
  return selectedPractice ? `${selectedPractice.type}:${selectedPractice.value}` : "";
}

function currentPracticeTemplate() {
  const key = currentPracticeKey();
  return key ? practiceTemplates[key] || null : null;
}

function isOfficialReference(template) {
  return Boolean(template && template.locked === true && template.validated === true && template.approvedBy && template.approvedAt);
}

function setPracticeFeedback(message, kind = "info") {
  const el = $("practiceFeedback");
  if (!el) return;

  el.className = `practice-feedback ${kind}`;
  el.textContent = message;
}

function updateAdminModeUI() {
  $("adminLoginArea").hidden = adminModeActive;
  $("adminActivePanel").hidden = !adminModeActive;
  $("officialReferenceControls").hidden = !adminModeActive;
  $("showAdminLogin").hidden = false;

  if (!adminModeActive) {
    $("adminLoginForm").hidden = true;
    $("adminPassword").value = "";
    $("adminLoginMessage").textContent = "";
  }

  updatePracticeButtons();
}

function updatePracticeReferenceStatus() {
  if (!$("practiceReferenceStatus")) return;

  if (!selectedPractice) {
    $("practiceReferenceStatus").textContent = "Primero selecciona una letra o palabra desde su ficha de aprendizaje.";
    updatePracticeButtons();
    return;
  }

  const template = currentPracticeTemplate();

  if (!template) {
    $("practiceReferenceStatus").textContent = `Todavía no existe una referencia oficial para ${selectedPractice.name}. El personal docente autorizado debe registrarla y aprobarla.`;
  } else if (!isOfficialReference(template)) {
    $("practiceReferenceStatus").textContent = `Existe una referencia anterior o pendiente para ${selectedPractice.name}, pero no está aprobada y bloqueada. No se utilizará para corregir a estudiantes; el personal docente debe grabar y aprobar una nueva.`;
  } else {
    const date = new Date(template.approvedAt).toLocaleDateString("es-MX");
    const reviewer = template.approvedBy;

    $("practiceReferenceStatus").textContent = `✓ Referencia oficial aprobada · ${template.frames.length} fotogramas · aprobada el ${date} · responsable registrado: ${reviewer}. Solo el modo docente puede reemplazarla.`;
  }

  updatePracticeButtons();
}

function updatePracticeButtons() {
  const active = Boolean(stream && visionReady);
  const hasTarget = Boolean(selectedPractice);
  const template = currentPracticeTemplate();
  const hasOfficialTemplate = isOfficialReference(template);

  if ($("recordReference")) $("recordReference").disabled = !adminModeActive || !active || !hasTarget || Boolean(practiceRecordingMode);
  if ($("startAttempt")) $("startAttempt").disabled = !active || !hasTarget || !hasOfficialTemplate || Boolean(practiceRecordingMode);
  if ($("stopPracticeRecording")) $("stopPracticeRecording").hidden = !practiceRecordingMode;
  if ($("clearPracticeReference")) $("clearPracticeReference").disabled = !adminModeActive || !template || Boolean(practiceRecordingMode);
}

function setPracticeTarget(item) {
  if (practiceRecordingMode) {
    practiceRecordingMode = null;
    practiceFrames = [];

    if ($("stopPracticeRecording")) $("stopPracticeRecording").hidden = true;
  }

  selectedPractice = item ? { ...item } : null;

  if ($("referenceReviewed")) $("referenceReviewed").checked = false;
  if ($("referenceReviewer")) $("referenceReviewer").value = "";

  if (!selectedPractice) {
    $("practiceTargetName").textContent = "Ninguna letra o palabra seleccionada";
    $("practiceTargetDescription").textContent = "Abre una ficha del abecedario o vocabulario y pulsa “Practicar con cámara”.";
    $("practiceTargetType").textContent = "Sin selección";

    setPracticeFeedback("Cuando exista una referencia oficial aprobada, podrás practicar y comparar tus movimientos.");
  } else {
    const typeLabel = selectedPractice.type === "letter" ? "ABECEDARIO" : "VOCABULARIO";

    $("practiceTargetName").textContent = selectedPractice.name;

    $("practiceTargetDescription").textContent = selectedPractice.type === "letter"
      ? `Vas a practicar la configuración manual de la letra ${selectedPractice.value}.`
      : `Vas a practicar la seña de “${selectedPractice.value}”.`;

    $("practiceTargetType").textContent = typeLabel;

    setPracticeFeedback("La práctica utiliza únicamente una referencia oficial aprobada por el personal autorizado. Si aún no existe, solicita al docente que la registre.");
  }

  updatePracticeReferenceStatus();
  updatePracticeButtons();
}

// Procesamiento de características de las manos

function roundFeature(value) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(3));
}

function makeHandFeatures(points, posePoints) {
  if (!points || points.length < 21) return null;

  const wrist = points[0];
  const middleBase = points[9];
  const palmScale = Math.max(0.035, Math.hypot(middleBase.x - wrist.x, middleBase.y - wrist.y));

  const features = [];

  for (let i = 0; i < 21; i++) {
    const point = points[i];

    features.push(
      roundFeature((point.x - wrist.x) / palmScale),
      roundFeature((point.y - wrist.y) / palmScale),
      roundFeature((point.z - (wrist.z || 0)) / palmScale)
    );
  }

  const leftShoulder = posePoints?.[11];
  const rightShoulder = posePoints?.[12];

  if (leftShoulder && rightShoulder && (leftShoulder.visibility ?? 1) > 0.35 && (rightShoulder.visibility ?? 1) > 0.35) {
    const centerX = (leftShoulder.x + rightShoulder.x) / 2;
    const centerY = (leftShoulder.y + rightShoulder.y) / 2;
    const shoulderWidth = Math.max(0.07, Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y));

    features.push(roundFeature((wrist.x - centerX) / shoulderWidth), roundFeature((wrist.y - centerY) / shoulderWidth));
  } else {
    features.push(roundFeature(wrist.x), roundFeature(wrist.y));
  }

  return features;
}

function makePracticeFrame(handResult, poseResult) {
  const frame = { left: null, right: null };
  const posePoints = poseResult?.landmarks?.[0] || null;

  (handResult?.landmarks || []).forEach((points, index) => {
    const handed = (handResult?.handedness?.[index]?.[0]?.categoryName || "").toLowerCase();
    const side = handed.includes("left") ? "left" : handed.includes("right") ? "right" : null;

    if (side && !frame[side]) frame[side] = makeHandFeatures(points, posePoints);
  });

  return frame;
}

// Comparación de movimientos

function frameMetrics(referenceFrame, attemptFrame) {
  let total = 0, pointCount = 0, anchorTotal = 0, anchorCount = 0, missingSides = 0;

  const groupTotals = Object.fromEntries(fingerGroups.map(group => [group.name, { total: 0, count: 0 }]));

  for (const side of ["left", "right"]) {
    const reference = referenceFrame?.[side];
    const attempt = attemptFrame?.[side];

    if (reference && attempt) {
      for (let joint = 0; joint < 21; joint++) {
        const offset = joint * 3;

        const dx = (reference[offset] || 0) - (attempt[offset] || 0);
        const dy = (reference[offset + 1] || 0) - (attempt[offset + 1] || 0);
        const dz = (reference[offset + 2] || 0) - (attempt[offset + 2] || 0);

        const error = Math.sqrt(dx * dx + dy * dy + dz * dz);

        total += error;
        pointCount++;

        const group = fingerGroups.find(item => joint >= item.from && joint <= item.to);

        if (group) {
          groupTotals[group.name].total += error;
          groupTotals[group.name].count++;
        }
      }

      const anchorDx = (reference[63] || 0) - (attempt[63] || 0);
      const anchorDy = (reference[64] || 0) - (attempt[64] || 0);

      anchorTotal += Math.hypot(anchorDx, anchorDy);
      anchorCount++;
    } else if (reference || attempt) {
      // Penaliza una mano que aparece en una toma pero no en la otra.
      missingSides++;

      for (let joint = 0; joint < 21; joint++) {
        total += 0.36;
        pointCount++;

        const group = fingerGroups.find(item => joint >= item.from && joint <= item.to);

        if (group) {
          groupTotals[group.name].total += 0.36;
          groupTotals[group.name].count++;
        }
      }

      anchorTotal += 0.36;
      anchorCount++;
    }
  }

  if (!pointCount) return {
    error: 0.5,
    anchorError: 0.5,
    groups: Object.fromEntries(fingerGroups.map(g => [g.name, 0.5])),
    missingSides: 2
  };

  return {
    error: total / pointCount,
    anchorError: anchorCount ? anchorTotal / anchorCount : 0,
    groups: Object.fromEntries(fingerGroups.map(group => [group.name, groupTotals[group.name].count ? groupTotals[group.name].total / groupTotals[group.name].count : 0])),
    missingSides
  };
}

function compareFrameDistance(a, b) {
  return frameMetrics(a, b).error;
}

function comparePracticeSequences(referenceFrames, attemptFrames) {
  const n = referenceFrames.length, m = attemptFrames.length;

  if (!n || !m) throw new Error("No hay suficientes fotogramas para comparar.");

  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  const from = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));

  dp[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diagonal = dp[i - 1][j - 1], up = dp[i - 1][j], left = dp[i][j - 1];

      let best = diagonal, direction = 1;

      if (up < best) {
        best = up;
        direction = 2;
      }

      if (left < best) {
        best = left;
        direction = 3;
      }

      dp[i][j] = compareFrameDistance(referenceFrames[i - 1], attemptFrames[j - 1]) + best;
      from[i][j] = direction;
    }
  }

  const path = [];
  let i = n, j = m;

  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1]);

    const direction = from[i][j];

    if (direction === 1) {
      i--;
      j--;
    } else if (direction === 2) i--;
    else j--;
  }

  path.reverse();

  const totals = {
    error: 0,
    anchorError: 0,
    pairs: 0,
    missingSides: 0,
    groups: Object.fromEntries(fingerGroups.map(g => [g.name, 0]))
  };

  path.forEach(([ri, ai]) => {
    const metrics = frameMetrics(referenceFrames[ri], attemptFrames[ai]);

    totals.error += metrics.error;
    totals.anchorError += metrics.anchorError;
    totals.missingSides += metrics.missingSides;

    for (const group of fingerGroups) totals.groups[group.name] += metrics.groups[group.name];

    totals.pairs++;
  });

  return {
    error: totals.error / Math.max(1, totals.pairs),
    anchorError: totals.anchorError / Math.max(1, totals.pairs),
    groups: Object.fromEntries(fingerGroups.map(g => [g.name, totals.groups[g.name] / Math.max(1, totals.pairs)])),
    missingSides: totals.missingSides / Math.max(1, totals.pairs),
    pathLength: path.length
  };
}

function wristMotion(frames, side) {
  const usable = frames.map(frame => frame?.[side]).filter(Boolean);

  if (usable.length < 2) return null;

  return {
    x: usable[usable.length - 1][63] - usable[0][63],
    y: usable[usable.length - 1][64] - usable[0][64]
  };
}

function motionSuggestions(referenceFrames, attemptFrames) {
  const suggestions = [];

  for (const side of ["left", "right"]) {
    const reference = wristMotion(referenceFrames, side);
    const attempt = wristMotion(attemptFrames, side);

    if (!reference || !attempt) continue;

    const rMag = Math.hypot(reference.x, reference.y), aMag = Math.hypot(attempt.x, attempt.y);

    if (rMag > 0.12 && aMag < 0.045) {
      suggestions.push("La referencia incluye un desplazamiento y en tu intento casi no se aprecia. Completa el recorrido de la mano.");
      break;
    }

    if (rMag <= 0.06 && aMag > 0.14) {
      suggestions.push("La referencia mantiene la muñeca relativamente estable. Evita agregar un desplazamiento que no aparece en el modelo.");
      break;
    }

    if (rMag > 0.08 && aMag > 0.06) {
      const dot = reference.x * attempt.x + reference.y * attempt.y;
      const cosine = dot / (rMag * aMag);

      if (cosine < 0.35) {
        suggestions.push("La dirección del desplazamiento de tu muñeca difiere de la referencia. Observa si el recorrido va hacia arriba, abajo o hacia un lado.");
        break;
      }
    }
  }

  return suggestions;
}

// Resultados de la práctica

function setFinalPracticeReport(template, result, attemptFrames, durationMs) {
  const score = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-2.15 * result.error))));
  const suggestions = [];

  if (result.error < 0.12) suggestions.push("La forma de las manos muestra una coincidencia geométrica cercana con la referencia.");
  else suggestions.push("Repite lentamente y compara la forma de cada dedo con la demostración.");

  const largest = Object.entries(result.groups).sort((a, b) => b[1] - a[1]).filter(item => item[1] > 0.17).slice(0, 2);

  largest.forEach(([finger]) => suggestions.push(`Revisa el ${finger}: su posición es una de las diferencias más grandes respecto a la referencia.`));

  if (result.anchorError > 0.22) suggestions.push("La ubicación de la muñeca cambia respecto al cuerpo. Ajusta la altura o la distancia de la mano al torso.");

  suggestions.push(...motionSuggestions(template.frames, attemptFrames));

  if (result.missingSides > 0.35) suggestions.push("En algunos fotogramas no se detectó la misma mano que aparece en la referencia. Mantén ambas manos dentro del encuadre, si la seña lo requiere.");

  const referenceDuration = Math.max(1, template.durationMs || 1);
  const ratio = durationMs / referenceDuration;

  if (ratio > 1.65) suggestions.push("Tu intento duró bastante más que la referencia. Revisa el ritmo sin acelerar tanto que pierdas claridad.");
  else if (ratio < 0.6) suggestions.push("Tu intento fue mucho más rápido que la referencia. Reduce la velocidad y completa cada parte del movimiento.");

  const el = $("practiceFeedback");

  el.className = `practice-feedback ${score >= 75 ? "success" : score >= 45 ? "warning" : "error"}`;
  el.innerHTML = `<div class="practice-score"><strong>${score}%</strong><span>coincidencia geométrica estimada<br>no equivale a exactitud lingüística</span></div><p>${suggestions.map(x => x.replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))).join("</p><p>")}</p>`;
}

function livePracticeAdvice(liveFrame, template) {
  const nearest = template.frames.reduce((best, frame) => {
    const metrics = frameMetrics(frame, liveFrame);
    return !best || metrics.error < best.metrics.error ? { metrics, frame } : best;
  }, null);

  if (!nearest || nearest.metrics.error > 0.34) {
    setPracticeFeedback("Compara la forma de tus dedos y la ubicación de la muñeca con la demostración. Si no aparece la mano, acércala al encuadre.", "warning");
    return;
  }

  const topGroup = Object.entries(nearest.metrics.groups).sort((a, b) => b[1] - a[1])[0];

  if (nearest.metrics.anchorError > 0.25) {
    setPracticeFeedback("Ajusta la ubicación: tu muñeca está más arriba, abajo o separada del cuerpo que en una fase de la referencia.", "warning");
  } else if (topGroup && topGroup[1] > 0.22) {
    setPracticeFeedback(`Revisa el ${topGroup[0]}. La posición de ese dedo se aleja más que las demás de la referencia.`, "warning");
  } else {
    setPracticeFeedback("La posición actual de tu mano se parece a una fase de la referencia. Continúa el movimiento completo.", "success");
  }
}

// Grabación de referencias e intentos

function beginPracticeCapture(mode) {
  if (!stream || !visionReady) return showToast("Primero activa la cámara.");
  if (!selectedPractice) return showToast("Selecciona primero una letra o palabra.");

  const template = currentPracticeTemplate();

  if (mode === "reference") {
    if (!adminModeActive) return showToast("Solo el modo docente puede registrar referencias.");
    if (!$("referenceReviewed").checked) return showToast("Confirma que la demostración fue revisada por una persona competente en LSM.");
    if (!$("referenceReviewer").value.trim()) return showToast("Escribe el nombre o código de la persona que valida la referencia.");
  }

  if (mode === "attempt" && !isOfficialReference(template)) return showToast("Esta seña todavía no tiene una referencia oficial aprobada.");

  practiceRecordingMode = mode;
  practiceFrames = [];
  practiceRecordingStartedAt = performance.now();
  lastPracticeSampleAt = 0;

  $("recordReference").disabled = true;
  $("startAttempt").disabled = true;
  $("stopPracticeRecording").hidden = false;
  $("stopPracticeRecording").textContent = mode === "reference" ? "■ Guardar referencia" : "■ Finalizar intento";

  $("practiceReferenceStatus").textContent = mode === "reference"
    ? `Grabando demostración para ${selectedPractice.name}. Realiza el movimiento completo durante unos segundos.`
    : `Grabando tu intento para ${selectedPractice.name}. Sigue la referencia y mantén tus manos visibles.`;

  setPracticeFeedback(mode === "reference"
    ? "Muestra la seña completa a velocidad natural. Esta toma quedará guardada localmente como modelo de comparación."
    : "Comparación en vivo activada. Las indicaciones se basan en puntos detectados, no en una comprensión del significado de la seña.");

  updatePracticeButtons();
}

function finishPracticeCapture() {
  if (!practiceRecordingMode) return;

  const mode = practiceRecordingMode;
  const frames = practiceFrames.slice();
  const durationMs = Math.max(1, performance.now() - practiceRecordingStartedAt);

  practiceRecordingMode = null;
  practiceFrames = [];

  if (frames.length < 8) {
    setPracticeFeedback("Se detectaron muy pocos fotogramas. Vuelve a intentarlo, con buena iluminación y las manos dentro del encuadre.", "warning");
    updatePracticeReferenceStatus();
    updatePracticeButtons();
    return;
  }

  if (mode === "reference") {
    if (!adminModeActive || !$("referenceReviewed").checked || !$("referenceReviewer").value.trim()) {
      setPracticeFeedback("La referencia no se guardó: falta la autorización docente o la confirmación de revisión.", "error");
      updatePracticeReferenceStatus();
      updatePracticeButtons();
      return;
    }

    const now = new Date().toISOString();

    const template = {
      frames,
      durationMs,
      createdAt: now,
      validated: true,
      locked: true,
      approvedBy: $("referenceReviewer").value.trim(),
      approvedAt: now,
      lockedAt: now,
      label: selectedPractice.name,
      validationStatement: "Revisión declarada por personal autorizado en el modo docente."
    };

    try {
      practiceTemplates[currentPracticeKey()] = template;
      localStorage.setItem("lsmPracticeTemplates_v1", JSON.stringify(practiceTemplates));

      setPracticeFeedback("Referencia oficial guardada y bloqueada. Los estudiantes ya pueden practicar; solo el modo docente podrá reemplazarla o eliminarla. La comparación sigue siendo geométrica y no certifica exactitud lingüística.", "success");
    } catch (error) {
      delete practiceTemplates[currentPracticeKey()];
      setPracticeFeedback("No se pudo guardar la referencia en el almacenamiento del navegador. Puede faltar espacio disponible.", "error");
    }

    updatePracticeReferenceStatus();
  } else {
    const template = currentPracticeTemplate();

    if (!template) {
      setPracticeFeedback("No se encontró una referencia guardada para esta seña. Grábala de nuevo.", "error");
    } else {
      try {
        const result = comparePracticeSequences(template.frames, frames);
        setFinalPracticeReport(template, result, frames, durationMs);
      } catch (error) {
        setPracticeFeedback(error.message || "No se pudo comparar el intento.", "error");
      }
    }
  }

  $("stopPracticeRecording").hidden = true;
  updatePracticeButtons();
}

function clearPracticeReference() {
  if (!adminModeActive) return showToast("Solo el modo docente puede eliminar una referencia.");
  if (!selectedPractice) return;

  if (!window.confirm(`¿Eliminar la referencia oficial de ${selectedPractice.name}? Los estudiantes ya no podrán practicar esta seña hasta que se registre otra.`)) return;

  delete practiceTemplates[currentPracticeKey()];

  try {
    localStorage.setItem("lsmPracticeTemplates_v1", JSON.stringify(practiceTemplates));
  } catch (error) {
    console.warn("No se pudo actualizar el almacenamiento local", error);
  }

  updatePracticeReferenceStatus();
  setPracticeFeedback("Referencia oficial eliminada por el modo docente. Registra y aprueba una nueva demostración para habilitar la práctica.", "warning");
}

function handlePracticeFrame(handResult, poseResult, timestamp) {
  if (!practiceRecordingMode || timestamp - lastPracticeSampleAt < 100) return;

  lastPracticeSampleAt = timestamp;

  const frame = makePracticeFrame(handResult, poseResult);

  if (!frame.left && !frame.right) return;

  if (practiceFrames.length < MAX_PRACTICE_FRAMES) practiceFrames.push(frame);

  if (practiceRecordingMode === "attempt" && practiceFrames.length % 3 === 0) {
    const template = currentPracticeTemplate();

    if (template) livePracticeAdvice(frame, template);
  }

  if (practiceRecordingMode && practiceFrames.length >= MAX_PRACTICE_FRAMES) {
    finishPracticeCapture();
    showToast("Se alcanzó el límite de 90 fotogramas; la toma se finalizó automáticamente.");
  }
}

// Administración docente

$("recordReference").addEventListener("click", () => beginPracticeCapture("reference"));
$("startAttempt").addEventListener("click", () => beginPracticeCapture("attempt"));
$("stopPracticeRecording").addEventListener("click", finishPracticeCapture);
$("clearPracticeReference").addEventListener("click", clearPracticeReference);

$("showAdminLogin").addEventListener("click", () => {
  $("adminLoginForm").hidden = false;
  $("showAdminLogin").hidden = true;
  $("adminPassword").focus();
});

$("cancelAdminLogin").addEventListener("click", () => {
  $("adminLoginForm").hidden = true;
  $("showAdminLogin").hidden = false;
  $("adminPassword").value = "";
  $("adminLoginMessage").textContent = "";
});

$("adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const now = Date.now();

  if (now < adminLockedUntil) {
    const seconds = Math.ceil((adminLockedUntil - now) / 1000);
    $("adminLoginMessage").textContent = `Demasiados intentos. Espera ${seconds} segundos.`;
    return;
  }

  const password = $("adminPassword").value;

  try {
    const valid = await verifyAdminPassword(password);

    if (!valid) {
      adminFailedAttempts++;

      if (adminFailedAttempts >= 5) {
        adminLockedUntil = Date.now() + 30_000;
        adminFailedAttempts = 0;
        $("adminLoginMessage").textContent = "Se alcanzó el límite de intentos. Espera 30 segundos.";
      } else {
        $("adminLoginMessage").textContent = "Contraseña incorrecta.";
      }

      $("adminPassword").value = "";
      return;
    }

    adminFailedAttempts = 0;
    adminModeActive = true;

    updateAdminModeUI();
    updatePracticeReferenceStatus();

    setPracticeFeedback("Modo docente activado. Selecciona una seña, activa la cámara y registra una demostración revisada para guardarla como referencia oficial.", "success");

    showToast("Modo docente activado.");
  } catch (error) {
    $("adminLoginMessage").textContent = error.message || "No se pudo verificar la contraseña.";
  }
});

$("adminLogout").addEventListener("click", () => {
  if (practiceRecordingMode) {
    const wasReference = practiceRecordingMode === "reference";

    practiceRecordingMode = null;
    practiceFrames = [];

    $("stopPracticeRecording").hidden = true;

    setPracticeFeedback(wasReference
      ? "La grabación de referencia se canceló al cerrar el modo docente. No se guardaron los fotogramas."
      : "El intento se canceló al cerrar la sesión docente.", "warning");
  }

  adminModeActive = false;

  updateAdminModeUI();
  updatePracticeReferenceStatus();

  showToast("Sesión docente cerrada.");
});

$("referenceReviewed").addEventListener("change", () => {
  if (!$("referenceReviewed").checked) return;

  $("adminLoginMessage").textContent = "";
});

updateAdminModeUI();

// Navegación

function navigate(id){
  document.querySelectorAll(".page-section").forEach(s=>s.classList.toggle("visible",s.id===id));
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.section===id));

  const labels={
    inicio:"Inicio",
    aprender:"Aprender teoría",
    abecedario:"Abecedario",
    vocabulario:"Vocabulario",
    repaso:"Repaso de memoria",
    biblioteca:"Biblioteca visual",
    "practica":"Práctica con cámara",
    progreso:"Mi progreso"
  };

  $("crumb").textContent=labels[id];
  $("sidebar").classList.remove("open");
  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.section)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.go)));

$("mobileMenu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
$("closeModal").addEventListener("click",()=>$("letterModal").hidden=true);

$("letterModal").addEventListener("click",e=>{
  if(e.target===$("letterModal"))$("letterModal").hidden=true;
});

// Registro de progreso

$("markLetter").addEventListener("click",()=>{
  if(!selectedStudy){
    $("letterModal").hidden=true;
    return;
  }

  if(selectedStudy.type==="letter"&&!progress.letters.includes(selectedStudy.value)){
    progress.letters.push(selectedStudy.value);
    saveProgress();
    renderAlphabet();
    showToast(`Letra ${selectedStudy.value} agregada a tu progreso.`);
  }else if(selectedStudy.type==="word"&&!progress.words.includes(selectedStudy.value)){
    progress.words.push(selectedStudy.value);
    saveProgress();
    renderWords();
    showToast(`"${selectedStudy.value}" agregada a tu progreso.`);
  }else{
    showToast("Este elemento ya está en tu progreso.");
  }

  $("letterModal").hidden=true;
});

$("goPractice").addEventListener("click",()=>{
  $("letterModal").hidden=true;
  setPracticeTarget(selectedStudy);
  navigate("practica");
});

$("resetProgress").addEventListener("click",()=>{
  if(confirm("¿Seguro que deseas reiniciar todo tu progreso?")){
    progress={letters:[],words:[],lessons:[]};
    saveProgress();
    renderAlphabet();
    renderWords();
    renderLessons();
    showToast("Tu progreso se reinició.");
  }
});

$("mirrorToggle").addEventListener("change",()=>{
  $("webcam").style.transform=$("mirrorToggle").checked?"scaleX(-1)":"none";
});

// Configuración de modelos de inteligencia artificial

const HAND_URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_URL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

async function loadModels(){
  $("modelStatus").textContent="Cargando modelos de manos, rostro y postura. La primera descarga puede tardar...";

  const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");

  const createWithFallback=async(factory,modelUrl,extra={})=>{
    try{
      return await factory.createFromOptions(vision,{
        runningMode:"VIDEO",
        ...extra,
        baseOptions:{
          modelAssetPath:modelUrl,
          delegate:"GPU"
        }
      });
    }catch(gpuError){
      console.warn("No se pudo iniciar MediaPipe con GPU; se intentará CPU.",gpuError);

      return await factory.createFromOptions(vision,{
        runningMode:"VIDEO",
        ...extra,
        baseOptions:{
          modelAssetPath:modelUrl,
          delegate:"CPU"
        }
      });
    }
  };

  [handTask,faceTask,poseTask]=await Promise.all([
    createWithFallback(HandLandmarker,HAND_URL,{numHands:2}),
    createWithFallback(FaceLandmarker,FACE_URL,{outputFaceBlendshapes:false}),
    createWithFallback(PoseLandmarker,POSE_URL,{numPoses:1})
  ]);

  visionReady=true;

  $("modelStatus").textContent="Modelos listos. Se detectan puntos de manos, rostro y postura en tu navegador.";

  updatePracticeButtons();
}

// Detección y dibujo de puntos

function setDetection(id,stateId,found,label){
  $(id).textContent=found?label:"Sin detectar";
  $(stateId).textContent=found?"Detectado":"—";
  $(stateId).classList.toggle("found",found);
}

function drawPoints(ctx,landmarks,color="#7c8cff",radius=3){
  landmarks.forEach(p=>{
    ctx.beginPath();
    ctx.arc(p.x*ctx.canvas.width,p.y*ctx.canvas.height,radius,0,Math.PI*2);
    ctx.fillStyle=color;
    ctx.fill();
  });
}

function drawConnections(ctx,landmarks,connections,color="#8fa1ff"){
  ctx.strokeStyle=color;
  ctx.lineWidth=2;

  connections.forEach(c=>{
    const a=landmarks[c.start],b=landmarks[c.end];

    if(!a||!b)return;

    ctx.beginPath();
    ctx.moveTo(a.x*ctx.canvas.width,a.y*ctx.canvas.height);
    ctx.lineTo(b.x*ctx.canvas.width,b.y*ctx.canvas.height);
    ctx.stroke();
  });
}

// Procesamiento de cámara

function renderLoop(){
  if(!stream||!visionReady)return;

  const video=$("webcam"),canvas=$("overlay"),ctx=canvas.getContext("2d");

  if(video.readyState>=2&&video.currentTime!==lastVideoTime){
    lastVideoTime=video.currentTime;

    const w=video.videoWidth,h=video.videoHeight;

    if(canvas.width!==w||canvas.height!==h){
      canvas.width=w;
      canvas.height=h;
    }

    ctx.clearRect(0,0,w,h);

    // El video se muestra como espejo; reflejamos también las coordenadas del dibujo.
    ctx.save();

    if($("mirrorToggle").checked){
      ctx.translate(w,0);
      ctx.scale(-1,1);
    }

    const frameTimestamp=performance.now();

    const hand=handTask.detectForVideo(video,frameTimestamp);
    const face=faceTask.detectForVideo(video,frameTimestamp);
    const pose=poseTask.detectForVideo(video,frameTimestamp);

    handlePracticeFrame(hand,pose,frameTimestamp);

    const handCount=hand.landmarks?.length||0;
    const handedness=(hand.handedness||[]).map(item=>(item[0]?.categoryName||"").toLowerCase());

    const hasLeft=handedness.includes("left"), hasRight=handedness.includes("right");

    setDetection("leftHand","leftState",hasLeft,"Mano izquierda detectada");
    setDetection("rightHand","rightState",hasRight,"Mano derecha detectada");
    setDetection("faceStatus","faceState",(face.faceLandmarks?.length||0)>0,"Rostro detectado");
    setDetection("poseStatus","poseState",(pose.landmarks?.length||0)>0,"Cuerpo detectado");

    if(handCount){
      hand.landmarks.forEach(lm=>{
        drawConnections(ctx,lm,HandLandmarker.HAND_CONNECTIONS);
        drawPoints(ctx,lm,"#a8b5ff",3);
      });
    }

    if(face.faceLandmarks?.length){
      const fl=face.faceLandmarks[0];
      drawPoints(ctx,fl.filter((_,i)=>i%12===0),"#f2b7a4",1.5);
    }

    if(pose.landmarks?.length){
      const pl=pose.landmarks[0];
      drawPoints(ctx,pl.filter(p=>p.visibility===undefined||p.visibility>.5),"#46d6b1",4);
    }

    ctx.restore();

    $("practiceTip").textContent=handCount===0
      ?"Acerca las manos al encuadre y procura que estén bien iluminadas."
      :handCount===1
      ?"¡Bien! Se detectó una mano. Intenta mantener ambas manos visibles si la seña lo requiere."
      :"¡Excelente! Se detectan ambas manos. Prueba distintas posiciones y movimientos.";
  }

  raf=requestAnimationFrame(renderLoop);
}

// Activación y desactivación de cámara

async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){
    showToast("Tu navegador no permite acceder a la cámara en este contexto. Usa localhost o HTTPS.");
    return;
  }

  $("startCamera").disabled=true;

  try{
    stream=await navigator.mediaDevices.getUserMedia({
      video:{
        facingMode:"user",
        width:{ideal:1280},
        height:{ideal:720}
      },
      audio:false
    });

    $("webcam").srcObject=stream;

    await new Promise(resolve=>$("webcam").onloadedmetadata=resolve);

    $("cameraPlaceholder").style.display="none";
    $("cameraStatus").textContent="Cámara activa";
    $("liveDot").classList.add("on");

    $("startCamera").disabled=true;
    $("stopCamera").disabled=false;

    $("cameraHint").textContent="Detección activa · Mantén tus manos visibles";

    if(!visionReady)await loadModels();

    updatePracticeButtons();
    renderLoop();
  }catch(err){
    console.error(err);
    stopCamera();

    const message=err.name==="NotAllowedError"
      ?"Permite el acceso a la cámara en tu navegador."
      :err.name==="NotFoundError"
      ?"No se encontró una cámara disponible."
      :"No se pudo iniciar la cámara o cargar los modelos.";

    $("modelStatus").textContent=message;
    showToast(message);
  }finally{
    if(!stream)$("startCamera").disabled=false;
  }
}

function stopCamera(){
  if(practiceRecordingMode){
    practiceRecordingMode=null;
    practiceFrames=[];
    $("stopPracticeRecording").hidden=true;

    setPracticeFeedback("La cámara se detuvo; la grabación de práctica se canceló sin guardar.","warning");
  }

  if(raf)cancelAnimationFrame(raf);
  raf=null;

  if(stream){
    stream.getTracks().forEach(t=>t.stop());
    stream=null;
  }

  $("webcam").srcObject=null;
  $("overlay").getContext("2d").clearRect(0,0,$("overlay").width,$("overlay").height);

  $("cameraPlaceholder").style.display="block";
  $("cameraStatus").textContent="Cámara desactivada";
  $("liveDot").classList.remove("on");

  $("startCamera").disabled=false;
  $("stopCamera").disabled=true;
  $("cameraHint").textContent="Coloca las manos dentro del encuadre";

  setDetection("leftHand","leftState",false);
  setDetection("rightHand","rightState",false);
  setDetection("faceStatus","faceState",false);
  setDetection("poseStatus","poseState",false);

  $("modelStatus").textContent=visionReady
    ?"Modelos cargados. Puedes volver a activar la cámara."
    :"Los modelos de IA se cargarán al activar la cámara.";

  updatePracticeButtons();
}

$("startCamera").addEventListener("click",startCamera);
$("stopCamera").addEventListener("click",stopCamera);

// Cierre de la aplicación

window.addEventListener("beforeunload", stopCamera);

// Inicialización

// Esta llamada se conserva aunque se hayan retirado los módulos de laboratorio y procesamiento.

renderAlphabet();
renderVocabFilters();
renderWords();
renderLessons();
renderRecall();
updateStats();
setPracticeTarget(null);

$("vocabSearch").addEventListener("input",renderWords);