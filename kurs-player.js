document.addEventListener("DOMContentLoaded", async () => {
  // === CONFIG ===
  const DIRECTUS_URL = "https://beki-admin.onrender.com";

  function replaceAssets(content) {
    if (!content) return "";
    content = content.replace(
      /(?:src=["'])\/assets\/([^"']+)["']/g,
      `src="${DIRECTUS_URL}/assets/$1"`
    );
    content = content.replace(
      /https:\/\/liydrhstdmxsfcisgafw\.supabase\.co\/storage\/v1\/object\/public\/directus\//g,
      `${DIRECTUS_URL}/assets/`
    );
    return content;
  }

  function formatDuration(minutes) {
    if (!minutes) return "";
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}h ${m} Min` : `${h}h`;
    }
    return `${minutes} Min`;
  }

  // VIDEO OPTIMIERUNG
  function optimizeVideos(container, posterUrl) {
    container.querySelectorAll("video").forEach((v) => {
      v.setAttribute("preload", "metadata");
      v.setAttribute("playsinline", "true");
      v.setAttribute("controlsList", "nodownload");
      if (posterUrl) v.setAttribute("poster", `${DIRECTUS_URL}/assets/${posterUrl}`);
      v.addEventListener("loadedmetadata", () => { if (v.currentTime === 0) v.currentTime = 0.1; }, { once: true });
    });
    container.querySelectorAll("audio").forEach((a) => {
      if (!a.parentElement.classList.contains("audio-wrapper")) {
        const w = document.createElement("div");
        w.className = "audio-wrapper";
        a.parentNode.insertBefore(w, a);
        w.appendChild(a);
      }
    });
  }

  const typeLabels = {
    video: "Video",
    text: "Text",
    quiz: "Quiz",
    quiz_wheel: "Quiz-Rad",
    quiz_choice: "Quiz",
    pause: "Pause",
    aufgabe: "Aufgabe",
    basiskarte: "Basiskarte",
    checkliste: "Checkliste",
    checklist: "Checkliste",
    audio: "Audio",
    reflection: "Reflexion",
    fazit: "Fazit",
    abschluss: "Abschluss",
    welcome: "Willkommen",
  };

  const typeIcons = {
    video: "🎬",
    text: "📝",
    quiz: "❓",
    quiz_wheel: "🎡",
    quiz_choice: "✅",
    pause: "☕",
    aufgabe: "📋",
    basiskarte: "🃏",
    checkliste: "✓",
    checklist: "✓",
    audio: "🎧",
    reflection: "💭",
    fazit: "📊",
    abschluss: "🎓",
    welcome: "👋",
  };

  // MATERIAL DOWNLOAD
  async function loadCourseMaterials(courseId) {
    const { data: junctionData, error: junctionError } = await db
      .from("courses_files_1")
      .select("directus_files_id")
      .eq("courses_id", courseId);

    if (junctionError) {
      console.error("Junction-Fehler:", junctionError);
      return [];
    }

    if (!junctionData || junctionData.length === 0) {
      return [];
    }

    const fileIds = junctionData.map(j => j.directus_files_id);
    const { data: filesData, error: filesError } = await db
      .from("directus_files")
      .select("id, filename_download, title, type")
      .in("id", fileIds);

    if (filesError) {
      console.error("Files-Fehler:", filesError);
      return junctionData.map(j => ({ id: j.directus_files_id }));
    }

    return filesData || [];
  }

  async function initMaterialButton(courseId) {
    const btn = document.getElementById("kurs-material-btn");
    if (!btn) return;

    const materials = await loadCourseMaterials(courseId);
    console.log("Materials gefunden:", materials);

    if (!materials || materials.length === 0) {
      btn.style.display = "none";
      return;
    }

    btn.style.display = "flex";

    btn.addEventListener("click", () => {
      materials.forEach(file => downloadFile(file));
    });
  }

  function downloadFile(file) {
    const link = document.createElement("a");
    link.href = `${DIRECTUS_URL}/assets/${file.id}?download`;
    link.download = file.filename_download || file.title || "material";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // AUFGABE RESPONSES
  async function loadAufgabeResponses(lessonId) {
    const { data, error } = await db
      .from("user_aufgabe_responses")
      .select("responses")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId);

    if (error || !data || data.length === 0) {
      return [];
    }

    const responses = data[0].responses;
    return typeof responses === "string" 
      ? JSON.parse(responses) 
      : responses;
  }

  async function saveAufgabeResponses(lessonId, responses) {
    const { error } = await db
      .from("user_aufgabe_responses")
      .upsert({
        user_id: userId,
        lesson_id: lessonId,
        responses: responses,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id,lesson_id" });

    if (error) {
      console.error("Fehler beim Speichern der Aufgaben-Antworten:", error);
    }
  }

  // CHECKLISTE
  async function loadChecklistProgress(lessonId) {
    const { data, error } = await db
      .from("checklist_progress")
      .select("item_key, checked")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId);

    if (error || !data) {
      return new Map();
    }

    return new Map(data.map(item => [item.item_key, item.checked]));
  }

  async function saveChecklistItem(lessonId, itemKey, checked) {
    const { error } = await db
      .from("checklist_progress")
      .upsert({
        user_id: userId,
        lesson_id: lessonId,
        item_key: itemKey,
        checked: checked
      }, { onConflict: "user_id,lesson_id,item_key" });

    if (error) {
      console.error("Fehler beim Speichern des Checklisten-Items:", error);
    }
  }

  function generateChecklistHTML(items, progressMap) {
    if (!items || items.length === 0) return "";

    const rows = items.map((item, index) => {
      const itemKey = `item-${index}`;
      const isChecked = progressMap.get(itemKey) || false;

      return `
        <tr>
          <td class="checklist-category">${item.category || ""}</td>
          <td class="checklist-recommendation">${item.recommendation || ""}</td>
          <td class="checklist-checkbox-cell">
            <label class="checklist-checkbox">
              <input type="checkbox" 
                data-item-key="${itemKey}" 
                ${isChecked ? "checked" : ""}>
              <span class="checkmark">
                <svg width="14" height="12" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 6L5 10L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </label>
          </td>
        </tr>
      `;
    }).join("");

    return `
      <div class="checklist-container">
        <table class="checklist-table">
          <thead>
            <tr>
              <th>Vorbereitung</th>
              <th>Empfehlung</th>
              <th>Bereit?</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  // AUTH CHECK
  const {
    data: { session },
  } = await db.auth.getSession();
  if (!session) {
    window.location.href = "/login";
    return;
  }
  const userId = session.user.id;

  // URL PARAMS
  const params = new URLSearchParams(window.location.search);
  const kursId = params.get("id");
  const startLektionId = params.get("lektion");

  if (!kursId) {
    window.location.href = "/kurse";
    return;
  }

  // STATE
  let kurs = null;
  let allLessons = [];
  let currentLessonIndex = 0;
  let userProgress = new Set();

  // LOAD KURS DATA
  const { data: kursData, error: kursError } = await db
    .from("courses")
    .select(
      `
      *,
      chapters (
        id,
        title,
        description,
        order_index,
        lessons (
          id,
          title,
          lesson_type,
          duration_minutes,
          order_index,
          content,
          audio_url,
          image,
          reflection_question,
          badge_enabled,
          badge_id,
          aufgabe_fields,
          video_fields,
          checklist_items,
          sample_answer,
          quiz_questions (
            id,
            question_text,
            question_type,
            options,
            correct_answer,
            order_index
          )
        )
      )
    `
    )
    .eq("id", kursId)
    .single();

  if (kursError || !kursData) {
    console.error("Fehler beim Laden des Kurses:", kursError);
    return;
  }

  kurs = kursData;

  await initMaterialButton(kursId);

  // LOAD USER PROGRESS
  const lessonIds = [];
  kurs.chapters.forEach((ch) => {
    ch.lessons.forEach((l) => lessonIds.push(l.id));
  });

  const { data: progressData } = await db
    .from("user_progress")
    .select("lesson_id")
    .eq("user_id", userId)
    .eq("completed", true)
    .in("lesson_id", lessonIds);

  userProgress = new Set(progressData?.map((p) => p.lesson_id) || []);

  // === BUILD FLAT LESSONS ARRAY ===
  kurs.chapters
    .sort((a, b) => a.order_index - b.order_index)
    .forEach((chapter) => {
      chapter.lessons
        .sort((a, b) => a.order_index - b.order_index)
        .forEach((lesson) => {
          allLessons.push({
            ...lesson,
            chapter: chapter,
          });
        });
    });

  // === SET START LESSON ===
  if (startLektionId) {
    const idx = allLessons.findIndex((l) => l.id === startLektionId);
    if (idx >= 0) currentLessonIndex = idx;
  }

  // === APPLY THEME COLOR ===
  const themeColor = kurs.theme_color || "#4140A4";

  const themeColors = {
    "#FFD28B": {
      sidebarBg: "#FFEDD1",
      activeLektion: "#FFEDD1",
      headerFooterBg: "#FFD28B",
      titleColor: "#000000",
      bodyBg: "#FEFDFB",
      color40: "rgba(255, 210, 139, 0.4)",
    },
    "#4CAB5A": {
      sidebarBg: "#B7DDBD",
      activeLektion: "#B7DDBD",
      headerFooterBg: "#4CAB5A",
      titleColor: "#FFFFFF",
      bodyBg: "#FEFDFB",
      color40: "rgba(76, 171, 90, 0.4)",
    },
    "#4140A4": {
      sidebarBg: "#B3B3DB",
      activeLektion: "#B3B3DB",
      headerFooterBg: "#4140A4",
      titleColor: "#FFFFFF",
      bodyBg: "#FEFDFB",
      color40: "rgba(65, 64, 164, 0.4)",
    },
  };

  let activeTheme = themeColors["#4140A4"];
  for (const [key, value] of Object.entries(themeColors)) {
    if (key.toUpperCase() === themeColor.toUpperCase()) {
      activeTheme = value;
      break;
    }
  }

  document.documentElement.style.setProperty(
    "--theme-color",
    activeTheme.headerFooterBg
  );
  document.documentElement.style.setProperty(
    "--theme-color-light",
    activeTheme.sidebarBg
  );
  document.documentElement.style.setProperty(
    "--theme-active-lektion",
    activeTheme.activeLektion
  );
  document.documentElement.style.setProperty(
    "--theme-title-color",
    activeTheme.titleColor
  );
  document.documentElement.style.setProperty(
    "--theme-body-bg",
    activeTheme.bodyBg
  );
  document.documentElement.style.setProperty(
    "--theme-color-40",
    activeTheme.color40
  );

  // === RENDER SIDEBAR ===
  function renderSidebar() {
    document.getElementById("kurs-title").textContent = kurs.title;

    const totalMinutes = allLessons.reduce(
      (sum, l) => sum + (l.duration_minutes || 0),
      0
    );
    document.getElementById("kurs-duration").textContent =
      formatDuration(totalMinutes);

    updateProgress();

    const nav = document.getElementById("kapitel-nav");
    nav.innerHTML = "";

    const sortedChapters = kurs.chapters.sort(
      (a, b) => a.order_index - b.order_index
    );

    // Hilfsfunktion: Ist es ein Pause-Kapitel?
    function isPauseChapter(chapter) {
      const lessons = chapter.lessons || [];
      return lessons.length === 1 && lessons[0].lesson_type === "pause";
    }

    // Nur Nicht-Pause-Kapitel zählen
    const countableChapters = sortedChapters.filter(ch => !isPauseChapter(ch));
    const totalCountable = countableChapters.length;

    // Index für zählbare Kapitel tracken
    let countableIndex = 0;

    sortedChapters.forEach((chapter) => {
      const chapterLessons = chapter.lessons.sort(
        (a, b) => a.order_index - b.order_index
      );
      const completedInChapter = chapterLessons.filter((l) =>
        userProgress.has(l.id)
      ).length;
      const isChapterComplete =
        completedInChapter === chapterLessons.length &&
        chapterLessons.length > 0;
      const currentLesson = allLessons[currentLessonIndex];
      const isActiveChapter = currentLesson?.chapter?.id === chapter.id;

      const chapterDuration = chapterLessons.reduce(
        (sum, l) => sum + (l.duration_minutes || 0),
        0
      );

      const isPause = isPauseChapter(chapter);

      // Kapitel-Nummer nur für Nicht-Pause-Kapitel
      let chapterNumberDisplay = "";
      if (!isPause) {
        countableIndex++;
        chapterNumberDisplay = `${countableIndex}/${totalCountable}`;
      }

      const kapitelEl = document.createElement("div");
      kapitelEl.className = `kapitel-item ${isActiveChapter ? "open" : ""} ${isPause ? "pause-chapter" : ""}`;

      kapitelEl.innerHTML = `
        <div class="kapitel-header">
          <div class="kapitel-header-row1">
            <span class="kapitel-number">${chapterNumberDisplay}</span>
            <span class="kapitel-duration">${formatDuration(chapterDuration)}</span>
          </div>
          <div class="kapitel-header-row2">
            ${isChapterComplete 
              ? `<div class="kapitel-status filled">
                  <svg width="9" height="8" viewBox="0 0 9 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8.25 0.75L3.09375 7L0.75 4.15909" stroke="black" stroke-opacity="0.7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>`
              : `<div class="kapitel-status"></div>`
            }
            <span class="kapitel-title">${chapter.title}</span>
            <span class="kapitel-toggle">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 9.99994L8 5.99994L4 9.99994" stroke="black" stroke-width="1.99832" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          </div>
        </div>
        <div class="lektionen-liste"></div>
      `;

      kapitelEl
        .querySelector(".kapitel-header")
        .addEventListener("click", () => {
          kapitelEl.classList.toggle("open");
        });

      const lektionenListe = kapitelEl.querySelector(".lektionen-liste");
      chapterLessons.forEach((lesson) => {
        const globalIndex = allLessons.findIndex((l) => l.id === lesson.id);
        const isCompleted = userProgress.has(lesson.id);
        const isActive = globalIndex === currentLessonIndex;

        const lektionEl = document.createElement("div");
        lektionEl.className = `lektion-nav-item ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""}`;

        let statusHTML = "";
        if (isCompleted) {
          statusHTML = `<div class="lektion-nav-status completed">
            <svg width="9" height="8" viewBox="0 0 9 8" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8.25 0.75L3.09375 7L0.75 4.15909" stroke="black" stroke-opacity="0.7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>`;
        } else if (isActive) {
          statusHTML = `<div class="lektion-nav-status filled"></div>`;
        } else {
          statusHTML = `<div class="lektion-nav-status"></div>`;
        }

        lektionEl.innerHTML = `
          ${statusHTML}
          <div class="lektion-nav-info">
            <div class="lektion-nav-title">${lesson.title}</div>
            <div class="lektion-nav-meta">
              <span class="lektion-nav-type-icon">${typeIcons[lesson.lesson_type] || "📄"}</span>
              <span>${lesson.duration_minutes ? lesson.duration_minutes + " Min" : ""}</span>
            </div>
          </div>
        `;

        lektionEl.addEventListener("click", () => {
          currentLessonIndex = globalIndex;
          renderLesson();
          renderSidebar();
        });

        lektionenListe.appendChild(lektionEl);
      });

      nav.appendChild(kapitelEl);
    });
  }

  // === UPDATE PROGRESS ===
  function updateProgress() {
    const total = allLessons.length;
    const completed = userProgress.size;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById("kurs-progress-fill").style.width = `${percent}%`;
    document.getElementById("kurs-progress-text").textContent = `${percent} % `;
  }

  // === RENDER LESSON ===
  function renderLesson() {
    const lesson = allLessons[currentLessonIndex];
    if (!lesson) return;

    const newUrl = `/kurs?id=${kursId}&lektion=${lesson.id}`;
    window.history.replaceState({}, "", newUrl);

    document.getElementById("lektion-title").textContent = lesson.title;

    document.getElementById("lektion-type-icon").textContent =
      typeIcons[lesson.lesson_type] || "📄";
    document.getElementById("lektion-type-label").textContent =
      typeLabels[lesson.lesson_type] || "Lektion";
    document.getElementById("lektion-duration-label").textContent =
      lesson.duration_minutes ? `${lesson.duration_minutes} Min` : "";
    // Pause-Lektionen aus der Zählung ausschließen
    const countableLessons = allLessons.filter(l => l.lesson_type !== "pause");
    const currentCountableIndex = countableLessons.findIndex(l => l.id === lesson.id);
    
    if (lesson.lesson_type === "pause") {
      // Bei Pause: keine Position anzeigen
      document.getElementById("lektion-position").textContent = "";
    } else {
      document.getElementById("lektion-position").textContent = `${currentCountableIndex + 1}/${countableLessons.length}`;
    }

    document.getElementById("lektion-loading").style.display = "none";
    document.getElementById("lektion-text").style.display = "none";
    document.getElementById("lektion-quiz").style.display = "none";
    document.getElementById("lektion-pause").style.display = "none";
    document.getElementById("lektion-reflection").style.display = "none";

    // Reset Pause-spezifische Styles
    const kursContent = document.getElementById("kurs-content");
    if (kursContent) {
      kursContent.style.backgroundColor = "";
    }
    const lektionHeader = document.getElementById("lektion-header");
    if (lektionHeader) {
      lektionHeader.style.backgroundColor = "";
    }
    const lektionBody = document.getElementById("lektion-body");
    if (lektionBody) {
      lektionBody.style.backgroundColor = "";
      lektionBody.style.flex = "";
      lektionBody.style.display = "";
    }
    const lektionMeta = document.getElementById("lektion-content-meta");
    if (lektionMeta) {
      lektionMeta.style.display = "";
    }
    const pauseTitle = document.getElementById("pause-title");
    if (pauseTitle) {
      pauseTitle.style.display = "";
    }
    const pauseCard = document.querySelector(".pause-card");
    if (pauseCard) {
      pauseCard.style.cssText = "";
    }
    const pauseBadge = document.querySelector(".pause-badge");
    if (pauseBadge) {
      pauseBadge.style.width = "";
    }
    const pauseContent = document.querySelector(".pause-content");
    if (pauseContent) {
      pauseContent.style.width = "";
    }
    const pauseContainer = document.getElementById("lektion-pause");
    if (pauseContainer) {
      pauseContainer.style.height = "";
      pauseContainer.style.width = "";
    }

    switch (lesson.lesson_type) {
      case "video":
      case "text":
      case "audio":
      case "basiskarte":
      case "fazit":
      case "abschluss":
      case "welcome":
        renderText(lesson);
        break;
      case "checkliste":
      case "checklist":
        renderCheckliste(lesson);
        break;
      case "aufgabe":
        renderAufgabe(lesson);
        break;
      case "quiz":
      case "quiz_choice":
      case "quiz_wheel":
        renderQuiz(lesson);
        break;
      case "pause":
        renderPause(lesson);
        break;
      case "reflection":
        renderReflection(lesson);
        break;
      default:
        renderText(lesson);
    }

    const backBtn = document.getElementById("nav-back");
    backBtn.disabled = currentLessonIndex === 0;
    backBtn.style.display = currentLessonIndex === 0 ? "none" : "flex";

    const nextBtn = document.getElementById("nav-next");
    const isLastLesson = currentLessonIndex === allLessons.length - 1;
    
    // Info-Box entfernen falls vorhanden
    const existingInfo = document.getElementById("nav-info-box");
    if (existingInfo) existingInfo.remove();
    
    // Prüfen ob das die letzte Lektion des aktuellen Kapitels ist
    const currentChapter = lesson.chapter;
    const chapterLessons = allLessons.filter(l => l.chapter.id === currentChapter.id);
    const isLastInChapter = chapterLessons[chapterLessons.length - 1].id === lesson.id;
    
    // Prüfen ob das das letzte Kapitel ist
    const sortedChapters = kurs.chapters.sort((a, b) => a.order_index - b.order_index);
    const isLastChapter = currentChapter.id === sortedChapters[sortedChapters.length - 1].id;
    
    // Prüfen ob es ein Pause-Kapitel ist (1 Lektion vom Typ "pause")
    const isPauseChapter = chapterLessons.length === 1 && lesson.lesson_type === "pause";
    
    // Zähle fehlende Lektionen im aktuellen Kapitel
    const missingInChapter = chapterLessons.filter(l => !userProgress.has(l.id)).length;
    
    // Zähle fehlende Lektionen im gesamten Kurs (ohne aktuelle)
    const missingInCourse = allLessons.filter(l => !userProgress.has(l.id) && l.id !== lesson.id).length;

    if (isPauseChapter) {
      // Pause-Kapitel: immer "Abschließen & Weiter"
      nextBtn.innerHTML = "Abschließen & Weiter";
      nextBtn.disabled = false;
      nextBtn.classList.remove("disabled");
    } else if (currentLessonIndex === 0 && !userProgress.has(lesson.id)) {
      nextBtn.innerHTML = "Kapitel starten";
      nextBtn.disabled = false;
      nextBtn.classList.remove("disabled");
    } else if (isLastInChapter && isLastChapter) {
      // Letzte Lektion des letzten Kapitels = Kurs/Modul abschließen
      if (missingInCourse === 0) {
        nextBtn.innerHTML = "Modul abschließen";
        nextBtn.disabled = false;
        nextBtn.classList.remove("disabled");
      } else {
        nextBtn.innerHTML = "Modul abschließen";
        nextBtn.disabled = true;
        nextBtn.classList.add("disabled");
        
        // Info-Box einfügen
        const infoBox = document.createElement("div");
        infoBox.id = "nav-info-box";
        infoBox.innerHTML = `⚠️ Noch ${missingInCourse} Lektion${missingInCourse > 1 ? "en" : ""} offen`;
        nextBtn.parentNode.insertBefore(infoBox, nextBtn);
      }
    } else if (isLastInChapter) {
      // Letzte Lektion eines Kapitels (aber nicht letztes Kapitel)
      if (missingInChapter <= 1) {
        // Nur aktuelle Lektion fehlt oder alles erledigt
        nextBtn.innerHTML = "Kapitel abschließen";
        nextBtn.disabled = false;
        nextBtn.classList.remove("disabled");
      } else {
        // Noch andere Lektionen im Kapitel offen
        nextBtn.innerHTML = "Kapitel abschließen";
        nextBtn.disabled = true;
        nextBtn.classList.add("disabled");
        
        const infoBox = document.createElement("div");
        infoBox.id = "nav-info-box";
        infoBox.innerHTML = `⚠️ Noch ${missingInChapter - 1} Lektion${missingInChapter > 2 ? "en" : ""} im Kapitel offen`;
        nextBtn.parentNode.insertBefore(infoBox, nextBtn);
      }
    } else {
      nextBtn.innerHTML = "Weiter";
      nextBtn.disabled = false;
      nextBtn.classList.remove("disabled");
    }
  }

  // === RENDER TEXT ===
  async function renderText(lesson) {
    const textContainer = document.getElementById("lektion-text");
    let content = replaceAssets(lesson.content || "");

    if (lesson.image && lesson.image.trim() !== "") {
      const imgHtml = `<img src="${DIRECTUS_URL}/assets/${lesson.image}" alt="" style="max-width: 100%; border-radius: 12px; margin: 0 0 20px 0;">`;
      content = imgHtml + content;
    }

    // Video-Felder hinzufügen wenn vorhanden (wie Aufgaben)
    if (lesson.video_fields) {
      try {
        let fields = lesson.video_fields;
        
        // Falls String, parsen
        if (typeof fields === "string") {
          fields = JSON.parse(fields);
        }
        
        // Sicherstellen dass es ein Array ist
        if (!Array.isArray(fields)) {
          fields = [fields];
        }
        
        if (fields.length > 0) {
          // Gespeicherte Antworten laden
          const savedResponses = await loadAufgabeResponses(lesson.id);

          fields.forEach((field, index) => {
            // Unterstütze sowohl "question" als auch "label"
            const fieldLabel = field.question || field.label;
            
            if (field && fieldLabel) {
              // Gespeicherte Antwort finden
              const savedAnswer = savedResponses.find(r => r.question === fieldLabel);
              const answerValue = savedAnswer ? savedAnswer.answer : "";

              content += `
                <div class="aufgabe-field video-field">
                  <label class="field-label">${fieldLabel}</label>
                  <textarea 
                    id="video-field-${index}" 
                    data-question="${fieldLabel.replace(/"/g, '&quot;')}"
                    placeholder="${field.placeholder || ''}"
                  >${answerValue}</textarea>
                </div>
              `;
            }
          });
        }
      } catch (e) {
        console.error("Fehler beim Parsen von video_fields:", e, lesson.video_fields);
      }
    }

    if (content && content.trim() !== "") {
      textContainer.style.display = "block";
      textContainer.innerHTML = content;
      optimizeVideos(textContainer, lesson.image);
    } else {
      textContainer.style.display = "none";
      textContainer.innerHTML = "";
    }
  }

  // === RENDER CHECKLISTE ===
  async function renderCheckliste(lesson) {
    const textContainer = document.getElementById("lektion-text");
    let content = replaceAssets(lesson.content || "");

    // Bild hinzufügen wenn vorhanden
    if (lesson.image && lesson.image.trim() !== "") {
      const imgHtml = `<img src="${DIRECTUS_URL}/assets/${lesson.image}" alt="" style="max-width: 100%; border-radius: 12px; margin: 0 0 20px 0;">`;
      content = imgHtml + content;
    }

    // Checklisten-Items parsen
    let checklistItems = [];
    if (lesson.checklist_items) {
      checklistItems = typeof lesson.checklist_items === "string"
        ? JSON.parse(lesson.checklist_items)
        : lesson.checklist_items;
    }

    // Progress laden
    const progressMap = await loadChecklistProgress(lesson.id);

    // Checkliste HTML generieren
    const checklistHTML = generateChecklistHTML(checklistItems, progressMap);

    // {{CHECKLISTE}} Platzhalter ersetzen oder am Ende anfügen
    if (content.includes("{{CHECKLISTE}}")) {
      content = content.replace("{{CHECKLISTE}}", checklistHTML);
    } else {
      // Fallback: Checkliste nach dem ersten Absatz oder am Ende
      const firstParagraphEnd = content.indexOf("</p>");
      if (firstParagraphEnd > -1) {
        content = content.slice(0, firstParagraphEnd + 4) + checklistHTML + content.slice(firstParagraphEnd + 4);
      } else {
        content = content + checklistHTML;
      }
    }

    if (content && content.trim() !== "") {
      textContainer.style.display = "block";
      textContainer.innerHTML = content;
      optimizeVideos(textContainer, lesson.image);

      // Checkbox Event Listeners
      const checkboxes = textContainer.querySelectorAll(".checklist-checkbox input");
      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener("change", async (e) => {
          const itemKey = e.target.dataset.itemKey;
          const checked = e.target.checked;
          await saveChecklistItem(lesson.id, itemKey, checked);
        });
      });
    } else {
      textContainer.style.display = "none";
      textContainer.innerHTML = "";
    }
  }

  // === RENDER AUFGABE ===
  async function renderAufgabe(lesson) {
    const textContainer = document.getElementById("lektion-text");
    let content = replaceAssets(lesson.content || "");

    // Bild hinzufügen wenn vorhanden
    if (lesson.image && lesson.image.trim() !== "") {
      const imgHtml = `<img src="${DIRECTUS_URL}/assets/${lesson.image}" alt="" style="max-width: 100%; border-radius: 12px; margin: 0 0 20px 0;">`;
      content = imgHtml + content;
    }

    // Gespeicherte Antworten laden
    const savedResponses = await loadAufgabeResponses(lesson.id);

    // Aufgabe-Felder hinzufügen wenn vorhanden
    if (lesson.aufgabe_fields && lesson.aufgabe_fields.length > 0) {
      const fields = typeof lesson.aufgabe_fields === "string"
        ? JSON.parse(lesson.aufgabe_fields)
        : lesson.aufgabe_fields;

      fields.forEach((field, index) => {
        // Gespeicherte Antwort finden
        const savedAnswer = savedResponses.find(r => r.question === field.question);
        const answerValue = savedAnswer ? savedAnswer.answer : "";

        content += `
          <div class="aufgabe-field">
            <h3>${field.question}</h3>
            <textarea 
              id="aufgabe-field-${index}" 
              data-question="${field.question.replace(/"/g, '&quot;')}"
              placeholder="${field.placeholder || ''}"
            >${answerValue}</textarea>
          </div>
        `;
      });
    }

    // Sample Answer Trigger hinzufügen wenn vorhanden
    if (lesson.sample_answer && lesson.sample_answer.trim() !== "") {
      content += `
        <div class="sample-answer-trigger" id="sample-answer-trigger">
          <img src="https://cdn.prod.website-files.com/68ecc710e558140c0c35a381/6943b3e742d4822a053e043e_Box-So%20haetten%20wir%20geantwortet.svg" alt="So hätten wir geantwortet">
        </div>
      `;
    }

    if (content && content.trim() !== "") {
      textContainer.style.display = "block";
      textContainer.innerHTML = content;
      optimizeVideos(textContainer, lesson.image);

      // Sample Answer Trigger Event Listener
      const trigger = document.getElementById("sample-answer-trigger");
      if (trigger) {
        trigger.addEventListener("click", () => {
          showSampleAnswerModal(lesson.sample_answer);
        });
      }
    } else {
      textContainer.style.display = "none";
      textContainer.innerHTML = "";
    }
  }

  // === COLLECT AUFGABE RESPONSES ===
  function collectAufgabeResponses() {
    const responses = [];
    const textareas = document.querySelectorAll("#lektion-text textarea[data-question]");
    
    textareas.forEach((textarea) => {
      const question = textarea.getAttribute("data-question");
      const answer = textarea.value.trim();
      
      if (answer) {
        responses.push({ question, answer });
      }
    });

    return responses;
  }

  // === RENDER PAUSE ===
  function renderPause(lesson) {
    const pauseContainer = document.getElementById("lektion-pause");
    pauseContainer.style.display = "flex";
    pauseContainer.style.height = "100%";
    pauseContainer.style.width = "100%";
    
    // Theme-Farbe
    const themeColor = kurs.theme_color || "#FFD28B";
    
    // Header-Titel auf "Pause" setzen
    const lektionTitle = document.getElementById("lektion-title");
    if (lektionTitle) {
      lektionTitle.textContent = "Pause";
    }
    
    // Gesamten Content-Bereich in Theme-Farbe
    const kursContent = document.getElementById("kurs-content");
    if (kursContent) {
      kursContent.style.backgroundColor = themeColor;
    }
    
    // Header auch einfärben
    const lektionHeader = document.getElementById("lektion-header");
    if (lektionHeader) {
      lektionHeader.style.backgroundColor = themeColor;
    }
    
    // Body auch einfärben und volle Höhe
    const lektionBody = document.getElementById("lektion-body");
    if (lektionBody) {
      lektionBody.style.backgroundColor = themeColor;
      lektionBody.style.flex = "1";
      lektionBody.style.display = "flex";
    }
    
    // Pause-Container selbst
    pauseContainer.style.backgroundColor = themeColor;
    
    // Lektion-Meta ausblenden bei Pause
    const lektionMeta = document.getElementById("lektion-content-meta");
    if (lektionMeta) {
      lektionMeta.style.display = "none";
    }
    
    // Badge oben = lesson.title (ohne Stern)
    const badgeSpan = document.querySelector(".pause-badge span");
    if (badgeSpan) {
      badgeSpan.textContent = lesson.title || "Zeit für eine Pause";
    }
    
    // Bild in der Mitte
    const illustrationEl = document.getElementById("pause-illustration");
    if (illustrationEl) {
      if (lesson.image && lesson.image.trim() !== "") {
        illustrationEl.innerHTML = `<img src="${DIRECTUS_URL}/assets/${lesson.image}" alt="">`;
        illustrationEl.style.display = "block";
      } else {
        illustrationEl.style.display = "none";
      }
    }
    
    // Titel in Content-Box ausblenden (da title jetzt oben ist)
    const titleEl = document.getElementById("pause-title");
    if (titleEl) {
      titleEl.style.display = "none";
    }
    
    // Text in der Content-Box (HTML erlauben)
    const textEl = document.getElementById("pause-text");
    if (textEl) {
      if (lesson.content) {
        textEl.innerHTML = replaceAssets(lesson.content);
      } else {
        textEl.textContent = "";
      }
    }
    
    // Pause-Card Layout anpassen
    const pauseCard = document.querySelector(".pause-card");
    if (pauseCard) {
      pauseCard.style.cssText = `
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: 100%;
        width: 100%;
      `;
    }
    
    // Badge volle Breite
    const pauseBadge = document.querySelector(".pause-badge");
    if (pauseBadge) {
      pauseBadge.style.width = "100%";
    }
    
    // Content volle Breite
    const pauseContent = document.querySelector(".pause-content");
    if (pauseContent) {
      pauseContent.style.width = "100%";
    }
  }

  // === RENDER REFLECTION ===
  function renderReflection(lesson) {
    document.getElementById("lektion-reflection").style.display = "block";
    document.getElementById("reflection-question").textContent =
      lesson.reflection_question || lesson.title;

    if (lesson.content && lesson.content.trim() !== "") {
      const textContainer = document.getElementById("lektion-text");
      textContainer.style.display = "block";
      textContainer.innerHTML = replaceAssets(lesson.content);
      optimizeVideos(textContainer, lesson.image);
    }
  }

  // === RENDER QUIZ ===
  function renderQuiz(lesson) {
    document.getElementById("lektion-quiz").style.display = "block";
    const quizContainer = document.getElementById("quiz-fragen");
    quizContainer.innerHTML = "";

    if (!lesson.quiz_questions || lesson.quiz_questions.length === 0) {
      quizContainer.innerHTML = "<p>Keine Fragen verfügbar.</p>";
      return;
    }

    const quizFragen = lesson.quiz_questions.sort(
      (a, b) => (a.order_index || 0) - (b.order_index || 0)
    );

    quizFragen.forEach((frage) => {
      let optionenHTML = "";

      if (frage.question_type === "multiple_choice" && frage.options) {
        const optionen =
          typeof frage.options === "string"
            ? JSON.parse(frage.options)
            : frage.options;
        optionen.forEach((opt) => {
          optionenHTML += `
            <label class="quiz-option">
              <input type="radio" name="frage-${frage.id}" value="${opt}">
              <span>${opt}</span>
            </label>
          `;
        });
      } else if (frage.question_type === "true_false") {
        optionenHTML = `
          <label class="quiz-option">
            <input type="radio" name="frage-${frage.id}" value="true">
            <span>Stimmt</span>
          </label>
          <label class="quiz-option">
            <input type="radio" name="frage-${frage.id}" value="false">
            <span>Stimmt nicht</span>
          </label>
        `;
      }

      quizContainer.innerHTML += `
        <div id="frage-container-${frage.id}" class="quiz-frage">
          <p class="quiz-frage-text">${frage.question_text}</p>
          <div id="optionen-${frage.id}">${optionenHTML}</div>
          <p id="feedback-${frage.id}" class="quiz-feedback"></p>
        </div>
      `;
    });

    document.getElementById("quiz-pruefen-btn").onclick = async () => {
      let richtig = 0;
      const gesamt = quizFragen.length;

      quizFragen.forEach((frage) => {
        const selected = document.querySelector(
          `input[name="frage-${frage.id}"]:checked`
        );
        const userAntwort = selected ? selected.value : null;
        let korrekteAntwort = frage.correct_answer;

        if (typeof korrekteAntwort === "string") {
          try {
            korrekteAntwort = JSON.parse(korrekteAntwort);
          } catch (e) {}
        }

        const container = document.getElementById(`frage-container-${frage.id}`);
        const feedback = document.getElementById(`feedback-${frage.id}`);
        const istRichtig = String(userAntwort) === String(korrekteAntwort);

        if (istRichtig) {
          richtig++;
          container.classList.add("correct");
          feedback.innerHTML = "✅ Richtig!";
        } else {
          container.classList.add("wrong");
          feedback.innerHTML = "❌ Falsch.";
        }
        feedback.style.display = "block";
      });

      const ergebnisDiv = document.getElementById("quiz-ergebnis");
      const prozent = Math.round((richtig / gesamt) * 100);
      ergebnisDiv.style.display = "block";
      ergebnisDiv.innerHTML = `
        <div class="quiz-ergebnis-box ${prozent >= 70 ? "success" : "fail"}">
          <h3>${richtig} von ${gesamt} richtig (${prozent}%)</h3>
          <p>${prozent >= 70 ? "🎉 Bestanden!" : "📚 Versuch es nochmal!"}</p>
        </div>
      `;
    };
  }

  // === COMPLETE LESSON ===
  async function completeLesson() {
    const lesson = allLessons[currentLessonIndex];

    // Aufgaben-Antworten speichern wenn es eine Aufgabe ist
    if (lesson.lesson_type === "aufgabe") {
      const responses = collectAufgabeResponses();
      if (responses.length > 0) {
        await saveAufgabeResponses(lesson.id, responses);
      }
    }

    // Video-Feld Antworten speichern wenn vorhanden
    if (lesson.video_fields && lesson.video_fields.length > 0) {
      const responses = collectAufgabeResponses();
      if (responses.length > 0) {
        await saveAufgabeResponses(lesson.id, responses);
      }
    }

    await db.from("user_progress").upsert(
      {
        user_id: userId,
        lesson_id: lesson.id,
        completed: true,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lesson_id" }
    );

    userProgress.add(lesson.id);

    if (lesson.badge_enabled && lesson.badge_id) {
      await db.from("user_badges").upsert(
        {
          user_id: userId,
          badge_id: lesson.badge_id,
          earned_at: new Date().toISOString(),
        },
        { onConflict: "user_id,badge_id" }
      );

      const { data: badge } = await db
        .from("badges")
        .select("id, title, image, description")
        .eq("id", lesson.badge_id)
        .single();

      if (badge) {
        showBadgeModal(badge);
        return;
      }
    }

    navigateNext();
  }

  // === NAVIGATE NEXT ===
  function navigateNext() {
    const lesson = allLessons[currentLessonIndex];
    const currentChapter = lesson.chapter;
    const chapterLessons = allLessons.filter(l => l.chapter.id === currentChapter.id);
    const isLastInChapter = chapterLessons[chapterLessons.length - 1].id === lesson.id;
    
    if (!isLastInChapter) {
      // Noch nicht am Kapitel-Ende - einfach weiter
      currentLessonIndex++;
      renderLesson();
      renderSidebar();
      window.scrollTo(0, 0);
    } else {
      // Letzte Lektion des Kapitels
      const sortedChapters = kurs.chapters.sort((a, b) => a.order_index - b.order_index);
      const currentChapterIndex = sortedChapters.findIndex(ch => ch.id === currentChapter.id);
      const isLastChapter = currentChapterIndex === sortedChapters.length - 1;
      
      if (isLastChapter) {
        // Letztes Kapitel - Modul abgeschlossen, Modal anzeigen
        showKursCompleteModal();
      } else {
        // Nächstes Kapitel finden
        const nextChapter = sortedChapters[currentChapterIndex + 1];
        
        // Erste Lektion des nächsten Kapitels finden
        const firstLessonOfNextChapter = allLessons.findIndex(l => l.chapter.id === nextChapter.id);
        
        if (firstLessonOfNextChapter >= 0) {
          currentLessonIndex = firstLessonOfNextChapter;
          renderLesson();
          renderSidebar();
          window.scrollTo(0, 0);
        }
      }
    }
  }

  // === SAMPLE ANSWER MODAL ===
  function showSampleAnswerModal(sampleAnswerContent) {
    // Modal erstellen falls nicht vorhanden
    let modal = document.getElementById("sample-answer-modal");
    
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "sample-answer-modal";
      modal.className = "sample-answer-modal";
      modal.innerHTML = `
        <div class="sample-answer-overlay"></div>
        <button class="sample-answer-close-x" id="sample-answer-close-x">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="sample-answer-container">
          <header class="sample-answer-header">
            <h2>So hätten wir geantwortet</h2>
          </header>
          <div class="sample-answer-body">
            <div class="sample-answer-content" id="sample-answer-content"></div>
          </div>
          <footer class="sample-answer-footer">
            <button class="nav-btn nav-btn-next" id="sample-answer-close-btn">Schließen</button>
          </footer>
        </div>
      `;
      document.body.appendChild(modal);
      
      // Event Listeners
      modal.querySelector(".sample-answer-overlay").addEventListener("click", closeSampleAnswerModal);
      modal.querySelector("#sample-answer-close-x").addEventListener("click", closeSampleAnswerModal);
      modal.querySelector("#sample-answer-close-btn").addEventListener("click", closeSampleAnswerModal);
    }
    
    // Content einfügen
    document.getElementById("sample-answer-content").innerHTML = replaceAssets(sampleAnswerContent);
    
    // Modal anzeigen
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeSampleAnswerModal() {
    const modal = document.getElementById("sample-answer-modal");
    if (modal) {
      modal.style.display = "none";
      document.body.style.overflow = "";
    }
  }

  // === KURS COMPLETE MODAL ===
  function showKursCompleteModal() {
    const moduleOrderIndex = kurs.order_index || 1;
    const totalModules = 5;
    
    if (window.KursCompleteModal) {
      window.KursCompleteModal.show({
        themeColor: kurs.theme_color || "#4140A4",
        moduleName: kurs.title || "Modul",
        moduleOrderIndex: moduleOrderIndex,
        totalModules: totalModules,
        progressPercent: 100
      });
    } else {
      alert("🎉 Glückwunsch! Du hast den Kurs abgeschlossen!");
      window.location.href = "/kurse";
    }
  }

  // === BADGE MODAL ===
  function getCourseBadges() {
    // Alle Badges im Kurs sammeln
    const badges = [];
    allLessons.forEach(lesson => {
      if (lesson.badge_enabled && lesson.badge_id) {
        badges.push({
          lessonId: lesson.id,
          badgeId: lesson.badge_id
        });
      }
    });
    return badges;
  }

  // Badge Platzhalter - URL von Webflow
  const BADGE_PLACEHOLDER_URL = "https://cdn.prod.website-files.com/68ecc710e558140c0c35a381/6943cc9ba8c2847d4a1405a3_zertifikat%20modul%201-s.svg";

  function showBadgeModal(badge) {
    const courseBadges = getCourseBadges();
    const currentBadgeIndex = courseBadges.findIndex(b => String(b.badgeId) === String(badge.id));
    const themeColor = kurs.theme_color || "#FFD28B";
    
    // Theme-Klasse bestimmen
    let themeClass = 'theme-orange';
    if (themeColor === '#4CAB5A') themeClass = 'theme-green';
    else if (themeColor === '#4140A4') themeClass = 'theme-purple';
    
    // Modal erstellen falls nicht vorhanden
    let modal = document.getElementById("badge-modal-new");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "badge-modal-new";
      document.body.appendChild(modal);
    }
    modal.className = `badge-modal-new ${themeClass}`;
    
    // Platzhalter HTML generieren
    let placeholdersHTML = '';
    const badgeImgSrc = `${DIRECTUS_URL}/assets/${badge.image}`;
    
    if (courseBadges.length === 0 || currentBadgeIndex === -1) {
      // Fallback: nur dieses Badge anzeigen
      placeholdersHTML = `
        <div class="badge-placeholder active">
          <div class="badge-slot">
            <img class="badge-placeholder-img" src="${BADGE_PLACEHOLDER_URL}" alt="">
            <img class="badge-earned-img" src="${badgeImgSrc}" alt="${badge.title}">
          </div>
          <span class="badge-placeholder-label">Modul 01</span>
        </div>`;
    } else {
      courseBadges.forEach((b, i) => {
        const isActive = i === currentBadgeIndex;
        placeholdersHTML += `
          <div class="badge-placeholder ${isActive ? 'active' : ''}">
            <div class="badge-slot">
              <img class="badge-placeholder-img" src="${BADGE_PLACEHOLDER_URL}" alt="">
              ${isActive ? `<img class="badge-earned-img" src="${badgeImgSrc}" alt="${badge.title}">` : ''}
            </div>
            <span class="badge-placeholder-label">Modul ${String(i + 1).padStart(2, '0')}</span>
          </div>`;
      });
    }
    
    modal.innerHTML = `
      <div class="badge-modal-overlay"></div>
      <div class="badge-modal-container">
        <button class="badge-modal-close-x" id="badge-modal-close-x">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <header class="badge-modal-header">
          <p class="badge-modal-subtitle">Herzlichen Glückwunsch! Du hast erfolgreich den Badge freigeschaltet:</p>
          <h2 class="badge-modal-title">${badge.title}</h2>
        </header>
        <div class="badge-modal-body">
          <div class="badge-placeholders-wrapper">
            ${placeholdersHTML}
          </div>
        </div>
        <footer class="badge-modal-footer">
          <button class="nav-btn nav-btn-back" id="badge-btn-achievements">Alle Abzeichen ansehen</button>
          <button class="nav-btn nav-btn-next" id="badge-btn-continue">Schließen</button>
        </footer>
      </div>
    `;
    
    // Event Listeners
    modal.querySelector(".badge-modal-overlay").addEventListener("click", closeBadgeModal);
    modal.querySelector("#badge-modal-close-x").addEventListener("click", closeBadgeModal);
    modal.querySelector("#badge-btn-continue").addEventListener("click", closeBadgeModal);
    modal.querySelector("#badge-btn-achievements").addEventListener("click", () => {
      window.location.href = "/lerntagebuch";
    });
    
    // Modal anzeigen
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
    
    // Animation starten wenn Bild geladen ist
    const earnedBadge = modal.querySelector(".badge-earned-img");
    if (earnedBadge) {
      if (earnedBadge.complete) {
        // Bild bereits geladen
        setTimeout(() => earnedBadge.classList.add("animate-in"), 100);
      } else {
        // Auf Bildladung warten
        earnedBadge.onload = () => {
          setTimeout(() => earnedBadge.classList.add("animate-in"), 100);
        };
      }
    }
  }

  function closeBadgeModal() {
    const modal = document.getElementById("badge-modal-new");
    if (modal) {
      modal.style.display = "none";
      document.body.style.overflow = "";
    }
    navigateNext();
  }

  // === NAVIGATION EVENTS ===
  document.getElementById("nav-back").addEventListener("click", () => {
    if (currentLessonIndex > 0) {
      currentLessonIndex--;
      renderLesson();
      renderSidebar();
      window.scrollTo(0, 0);
    }
  });

  document.getElementById("nav-next").addEventListener("click", () => {
    completeLesson();
  });

  // === FULLSCREEN TOGGLE ===
  let isFullscreen = false;
  const fullscreenBtn = document.getElementById("fullscreen-btn") || document.querySelector(".fullscreen-btn");
  const sidebar = document.querySelector(".kurs-sidebar");
  const content = document.querySelector(".kurs-content");

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      isFullscreen = !isFullscreen;
      
      if (isFullscreen) {
        sidebar.style.display = "none";
        content.style.width = "100%";
      } else {
        sidebar.style.display = "flex";
        content.style.width = "";
      }
    });
  }

  // === INITIAL RENDER ===
  renderSidebar();
  renderLesson();
});
