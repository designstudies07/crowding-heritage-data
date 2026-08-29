(() => {
  "use strict";
  const C = window.STUDY2_CONFIG;
  const app = document.getElementById("app");
  const participantChip = document.getElementById("participant-chip");
  const programChip = document.getElementById("program-chip");
  const versionLabel = document.getElementById("version-label");
  const focusOverlay = document.getElementById("focus-overlay");
  const focusReturnBtn = document.getElementById("focus-return-btn");

  const nowIso = () => new Date().toISOString();
  const perf = () => performance.now();
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (s = "") => String(s).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));

  function initialState() {
    return {
      version: C.version,
      screen: "boot",
      assignedAt: null,
      participantId: null,
      programCode: null,
      mainGroup: null,
      orderVariant: null,
      serial: null,
      initialDensityOrder: null,
      assignmentSource: null,
      profile: {},
      familiarity: {},
      tutorial: { visited: [], practiceA: false, practiceB: false },
      timedAcknowledged: false,
      trialIndex: 0,
      trialResults: [],
      current: null,
      final: {},
      events: [],
      completedAt: null,
      uploaded: false,
      completionRegistered: false
    };
  }

  let state = loadState() || initialState();
  let dwellTimer = null;
  const preloadedStimuli = [];
  let stimulusPreloadStarted = false;

  function allStimulusUrls() {
    const practice = Object.values(C.practice.images);
    const main = Object.values(C.landmarks).flatMap(landmark => Object.values(landmark.images));
    return [...new Set([...practice, ...main])];
  }

  function preloadStimuliInBackground() {
    if (stimulusPreloadStarted) return;
    stimulusPreloadStarted = true;
    const queue = allStimulusUrls();
    let cursor = 0;

    const loadOne = url => new Promise(resolve => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => { preloadedStimuli.push(image); resolve(); };
      image.onerror = () => { console.warn(`Uyaran ön yüklenemedi: ${url}`); resolve(); };
      image.src = url;
    });

    const worker = async () => {
      while (cursor < queue.length) {
        const url = queue[cursor++];
        await loadOne(url);
      }
    };

    Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
      .then(() => console.info(`${preloadedStimuli.length}/${queue.length} uyaran tarayıcı önbelleğine alındı.`));
  }

  function saveState() {
    localStorage.setItem(C.storageKey, JSON.stringify(state));
    updateHeader();
  }
  function loadState() {
    try { return JSON.parse(localStorage.getItem(C.storageKey)); } catch { return null; }
  }
  function clearState() {
    localStorage.removeItem(C.storageKey);
    state = initialState();
  }
  function log(type, payload = {}) {
    state.events.push({ event_type: type, event_time: nowIso(), perf_ms: Math.round(perf()), screen: state.screen, trial_index: state.trialIndex, ...payload });
    if (state.events.length > 6000) state.events = state.events.slice(-6000);
    saveState();
  }
  function updateHeader() {
    versionLabel.textContent = `App sürümü: ${C.version}`;
    if (state.participantId) {
      participantChip.textContent = `Katılımcı: ${state.participantId}`;
      participantChip.classList.remove("hidden");
      programChip.textContent = `Program: ${state.programCode}`;
      programChip.classList.remove("hidden");
    } else {
      participantChip.classList.add("hidden");
      programChip.classList.add("hidden");
    }
  }

  function isMobileDevice() {
    const uaMobile = navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const coarseOnly = matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;
    return uaMobile || coarseOnly;
  }
  function isViewportTooNarrow() {
    return window.innerWidth < C.minimumDesktopWidth;
  }

  function browserName() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return "Edge";
    if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
    return "Other";
  }

  function schedule() {
    return C.schedules[state.programCode] || C.schedules.A1;
  }

  function initialDensitySequence() {
    const valid = C.densities.map(d => d.id);
    if (Array.isArray(state.initialDensityOrder) &&
        state.initialDensityOrder.length === valid.length &&
        valid.every(d => state.initialDensityOrder.includes(d))) {
      return state.initialDensityOrder;
    }
    const shuffled = [...valid];
    const randomValues = new Uint32Array(shuffled.length);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(randomValues);
    else for (let i = 0; i < randomValues.length; i++) randomValues[i] = Math.floor(Math.random() * 0x100000000);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomValues[i] % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    state.initialDensityOrder = shuffled;
    return state.initialDensityOrder;
  }

  async function assignParticipant() {
    state.screen = "assigning";
    render();
    const local = location.protocol === "file:" || ["localhost","127.0.0.1"].includes(location.hostname);
    if (local && C.localDemoEnabled) {
      await new Promise(r => setTimeout(r, 500));
      const data = localDemoAssign();
      applyAssignment(data, "local-demo");
      state.screen = "consent";
      saveState(); render(); return;
    }
    try {
      const res = await fetch(C.assignmentEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Atama servisi yanıt vermedi.");
      applyAssignment(data, "server");
      state.screen = "consent";
      saveState(); render();
    } catch (error) {
      state.screen = "assignment-error";
      state.assignmentError = String(error.message || error);
      render();
    }
  }

  function localDemoAssign() {
    const counts = JSON.parse(localStorage.getItem("study2DemoCounts") || "{}");
    const serials = JSON.parse(localStorage.getItem("study2DemoSerials") || "{}");
    const codes = Object.keys(C.schedules);
    const min = Math.min(...codes.map(c => counts[c] || 0));
    const eligible = codes.filter(c => (counts[c] || 0) === min);
    const code = eligible[Math.floor(Math.random() * eligible.length)];
    serials[code] = (serials[code] || 0) + 1;
    localStorage.setItem("study2DemoSerials", JSON.stringify(serials));
    const serial = serials[code];
    return { participant_id: `${code}-${String(serial).padStart(3,"0")}`, program_code: code, main_group: code[0], order_variant: Number(code[1]), serial };
  }

  function applyAssignment(data, source) {
    state.participantId = data.participant_id;
    state.programCode = data.program_code;
    state.mainGroup = data.main_group || data.program_code[0];
    state.orderVariant = Number(data.order_variant || data.program_code[1]);
    state.serial = Number(data.serial || data.participant_id.split("-").pop());
    state.assignedAt = nowIso();
    state.assignmentSource = source;
    log("participant_assigned", { participant_id: state.participantId, program_code: state.programCode, assignment_source: source });
  }

  function screenCard(title, content, cls = "narrow") {
    return `<section class="card padded ${cls}"><h2>${title}</h2>${content}</section>`;
  }

  function render() {
    updateHeader();
    switch (state.screen) {
      case "blocked": return renderBlocked();
      case "resize-required": return renderResizeRequired();
      case "assigning": return renderAssigning();
      case "assignment-error": return renderAssignmentError();
      case "consent": return renderConsent();
      case "profile": return renderProfile();
      case "familiarity": return renderFamiliarity();
      case "tutorial": return renderTutorial();
      case "practice-a-intro": return renderPracticeAIntro();
      case "practice-a": return renderPracticeA();
      case "practice-b-intro": return renderPracticeBIntro();
      case "practice-b": return renderPracticeB();
      case "timed-warning": return renderTimedWarning();
      case "trial-intro": return renderTrialIntro();
      case "explore": return renderExplore();
      case "feature-task": return renderFeatureTask();
      case "rating": return renderRating();
      case "final": return renderFinal();
      case "complete": return renderComplete();
      default: return renderAssigning();
    }
  }

  function renderBlocked() {
    app.innerHTML = screenCard("Bu cihazdan devam edilemez", `
      <div class="notice danger"><strong>Bu çalışma yalnızca masaüstü veya dizüstü bilgisayardan tamamlanabilir.</strong><br>Telefon ve tabletlerde deneysel görevler, tıklama ölçümleri ve süre kayıtları güvenilir biçimde uygulanamadığı için bu cihazdan devam edemezsiniz.</div>
      <p class="muted">Lütfen güncel Chrome veya Edge tarayıcısıyla, fare ya da trackpad bulunan bir bilgisayar kullanın.</p>
    `);
  }

  function renderResizeRequired() {
    app.innerHTML = screenCard("Pencereyi büyütün", `
      <div class="notice warning"><strong>Bu bilgisayar uygun, ancak deney penceresi yeterince geniş değil.</strong><br>Pencereyi büyütün veya tam ekran yapın. En az ${C.minimumDesktopWidth} piksel genişlik gereklidir.</div>
      <div class="btn-row"><button id="recheck-size" class="btn primary">Boyutu yeniden kontrol et</button></div>
    `);
    $("#recheck-size").onclick = () => {
      if (isViewportTooNarrow()) return alert("Pencere hâlâ yeterince geniş değil.");
      state.screen = state.participantId ? (state.screenBeforeResize || "consent") : "assigning";
      saveState();
      if (!state.participantId) assignParticipant(); else render();
    };
  }

  function renderAssigning() {
    app.innerHTML = `<section class="card medium assignment-loader"><div class="spinner"></div><h2>Anonim deney programınız hazırlanıyor</h2><p class="muted">Sistem, tamamlanmış katılımcı sayısı en düşük olan karşı dengelenmiş programı belirliyor.</p></section>`;
  }

  function renderAssignmentError() {
    app.innerHTML = screenCard("Otomatik atama tamamlanamadı", `
      <div class="notice danger">${escapeHtml(state.assignmentError || "Atama servisi yapılandırılmamış olabilir.")}</div>
      <p>Netlify ortam değişkenleri ve Supabase atama servisi kurulmadan çevrim içi üretim ataması yapılamaz.</p>
      <div class="btn-row"><button id="retry-assign" class="btn primary">Yeniden dene</button>${C.localDemoEnabled ? '<button id="demo-assign" class="btn secondary">Yerel test atamasıyla devam et</button>' : ''}</div>
    `);
    $("#retry-assign").onclick = assignParticipant;
    if ($("#demo-assign")) $("#demo-assign").onclick = () => { applyAssignment(localDemoAssign(), "manual-local-demo"); state.screen="consent"; saveState(); render(); };
  }

  function renderConsent() {
    app.innerHTML = screenCard("Bilgilendirilmiş onam", `
      <p class="lead">Bu çalışma, dijital mekân temsillerinde insan yoğunluğunun farklı bilgi ihtiyaçları için nasıl kullanıldığını araştırmaktadır.</p>
      <div class="notice"><strong>Anonim katılımcı kodunuz:</strong> ${escapeHtml(state.participantId)}<br>Bu kod otomatik oluşturulmuştur; adınız veya e-posta adresiniz toplanmayacaktır.</div>
      <div class="consent-list">
        <label class="choice-card"><input type="checkbox" id="c1"> Katılımın gönüllü olduğunu ve istediğim anda ayrılabileceğimi anlıyorum.</label>
        <label class="choice-card"><input type="checkbox" id="c2"> Yoğunluk seçimlerimin, tıklamalarımın ve görev sürelerimin kaydedileceğini anlıyorum.</label>
        <label class="choice-card"><input type="checkbox" id="c3"> Verilerin anonim katılımcı koduyla saklanacağını anlıyorum.</label>
        <label class="choice-card"><input type="checkbox" id="c4"> 18 yaşında veya daha büyük olduğumu ve çalışmaya gönüllü olarak katıldığımı onaylıyorum.</label>
      </div>
      <div class="btn-row right"><button id="consent-next" class="btn primary" disabled>Onayla ve devam et</button></div>
    `);
    const checks = $$("input[type=checkbox]");
    const btn = $("#consent-next");
    checks.forEach(c => c.onchange = () => btn.disabled = !checks.every(x => x.checked));
    btn.onclick = () => { log("consent_given"); state.screen="profile"; saveState(); render(); };
  }

  function renderProfile() {
    app.innerHTML = screenCard("Katılımcı bilgileri", `
      <form id="profile-form">
        <div class="grid two">
          <div class="field"><label>Yaş</label><input id="age" type="number" min="18" max="99" required value="${escapeHtml(state.profile.age || "")}"></div>
          <div class="field"><label>Cinsiyet (isteğe bağlı)</label><select id="gender"><option value="">Belirtmek istemiyorum</option><option value="female">Kadın</option><option value="male">Erkek</option><option value="other">Diğer / non-binary</option></select></div>
        </div>
        <div class="field"><label>Tasarım veya mimarlık eğitimi aldınız mı?</label><div class="radio-row"><label class="choice-card"><input type="radio" name="design" value="yes" required> Evet</label><label class="choice-card"><input type="radio" name="design" value="no"> Hayır</label></div></div>
        <div class="field"><label>Sanal tur, Street View veya çevrim içi mekân platformlarını ne sıklıkla kullanırsınız?</label><select id="digital-use" required><option value="">Seçiniz</option><option value="1">Hiç</option><option value="2">Nadiren</option><option value="3">Bazen</option><option value="4">Sık</option><option value="5">Çok sık</option></select></div>
        ${likertHtml("crowd_discomfort", "Kalabalık mekânlarda genellikle ne kadar rahatsız olursunuz?", "Hiç", "Çok fazla", state.profile.crowd_discomfort)}
        <div class="btn-row right"><button class="btn primary" type="submit">Devam et</button></div>
      </form>
    `);
    if (state.profile.gender) $("#gender").value = state.profile.gender;
    if (state.profile.design_education) $(`input[name=design][value=${state.profile.design_education}]`).checked = true;
    if (state.profile.digital_use) $("#digital-use").value = state.profile.digital_use;
    $("#profile-form").onsubmit = e => {
      e.preventDefault();
      const crowd = selectedRadio("crowd_discomfort");
      if (!crowd) return alert("Lütfen kalabalık rahatsızlığı sorusunu yanıtlayın.");
      state.profile = { age: Number($("#age").value), gender: $("#gender").value, design_education: selectedRadio("design"), digital_use: Number($("#digital-use").value), crowd_discomfort: Number(crowd), browser: browserName(), screen_width: screen.width, screen_height: screen.height, viewport_width: innerWidth, viewport_height: innerHeight };
      log("profile_completed", state.profile); state.screen="familiarity"; saveState(); render();
    };
  }

  function renderFamiliarity() {
    const cards = Object.entries(C.landmarks).map(([id,l]) => {
      const f = state.familiarity[id] || {};
      return `<div class="familiarity-card" data-landmark="${id}"><h3>${escapeHtml(l.title)}</h3>
        <div class="field"><label>Bu yapıyı daha önce fiziksel olarak ziyaret ettiniz mi?</label><div class="radio-row"><label class="choice-card"><input type="radio" name="visit_${id}" value="yes" ${f.visited==='yes'?'checked':''}> Evet</label><label class="choice-card"><input type="radio" name="visit_${id}" value="no" ${f.visited==='no'?'checked':''}> Hayır</label></div></div>
        ${likertHtml(`visual_${id}`, "Bu yapının görsellerine daha önce ne ölçüde aşinaydınız?", "Hiç aşina değildim", "Çok aşinaydım", f.visual)}
        ${likertHtml(`spatial_${id}`, "Bu yapının mekânsal düzeni veya belirgin mimari öğeleri hakkında önceden ne ölçüde bilgi sahibiydiniz?", "Hiç bilgim yoktu", "Çok iyi biliyordum", f.spatial)}
      </div>`;
    }).join("");
    app.innerHTML = screenCard("Yapı aşinalığı", `<p class="lead">Aşağıdaki soruları her yapı için ayrı ayrı yanıtlayın. Görsel gösterilmemesi, deney öncesi ek maruziyeti önlemek içindir.</p><form id="fam-form"><div class="familiarity-grid">${cards}</div><div class="btn-row right"><button class="btn primary" type="submit">Eğitime geç</button></div></form>`, "medium");
    $("#fam-form").onsubmit = e => {
      e.preventDefault(); const out = {};
      for (const id of Object.keys(C.landmarks)) {
        const visited = selectedRadio(`visit_${id}`); const visual = selectedRadio(`visual_${id}`); const spatial = selectedRadio(`spatial_${id}`);
        if (!visited || !visual || !spatial) return alert("Lütfen her yapı için tüm soruları yanıtlayın.");
        out[id] = { visited, visual: Number(visual), spatial: Number(spatial) };
      }
      state.familiarity = out; log("familiarity_completed"); state.screen="tutorial"; saveState(); render();
    };
  }

  function likertHtml(name, title, low, high, selected = null) {
    const opts = [1,2,3,4,5,6,7].map(v => `<label><input type="radio" name="${name}" value="${v}" ${Number(selected)===v?'checked':''}><span>${v}</span></label>`).join("");
    return `<div class="field"><div class="question-title">${escapeHtml(title)}</div><div class="likert">${opts}</div><div class="anchors"><span><strong>1</strong> — ${escapeHtml(low)}</span><span><strong>7</strong> — ${escapeHtml(high)}</span></div></div>`;
  }
  function selectedRadio(name) { return $(`input[name="${name}"]:checked`)?.value || null; }

  function densityButtons(active, visited = []) {
    return C.densities.map((d,i) => `<button class="density-btn ${active===d.id?'active':''} ${visited.includes(d.id)?'visited':''}" type="button" data-density="${d.id}"><small>${i+1}</small><br>${escapeHtml(d.tr)}</button>`).join("");
  }

  function renderTutorial() {
    const active = state.tutorial.currentDensity || "empty";
    app.innerHTML = `<div class="tutorial-layout"><section class="card stimulus-card"><div class="task-badge">Eğitim</div><h2>İnsan yoğunluğu kontrolünü tanıma</h2><p class="task-prompt">Bu çalışmada aynı mekânın dört insan yoğunluğu temsilini göreceksiniz. Lütfen dört düzeyin tamamını en az bir kez inceleyin.</p><div class="image-stage"><img id="tutorial-img" src="${C.practice.images[active]}" alt="${escapeHtml(C.practice.title)}"></div><div class="density-block"><div class="density-head"><strong>İnsan yoğunluğu</strong><span class="muted">Tek bir evrensel doğru seçim yoktur.</span></div><div class="density-segment" id="tutorial-density">${densityButtons(active, state.tutorial.visited)}</div></div></section><aside class="card side-card"><h3>Ne öğreneceksiniz?</h3><p>Görevlerin gerektirdiği bilgiye göre temsiller arasında serbestçe geçiş yapabilirsiniz.</p><div class="notice">İncelenen düzeyler: <strong id="visited-count">${state.tutorial.visited.length}/4</strong></div><div class="btn-row"><button id="tutorial-next" class="btn primary" ${state.tutorial.visited.length<4?'disabled':''}>Anladım, pratiğe devam et</button></div></aside></div>`;
    $$("#tutorial-density .density-btn").forEach(btn => btn.onclick = () => {
      const d=btn.dataset.density; state.tutorial.currentDensity=d; if(!state.tutorial.visited.includes(d)) state.tutorial.visited.push(d); log("tutorial_density_view",{density:d}); saveState(); renderTutorial();
    });
    $("#tutorial-next").onclick = () => { state.screen="practice-a-intro"; saveState(); render(); };
  }

  function renderPracticeAIntro() {
    app.innerHTML = screenCard("Mini pratik A — Mimari öğe bulma", `<p class="lead">Bir sonraki ekranda <strong>${escapeHtml(C.practice.targetLabel)}</strong> bulmanız istenecektir.</p><div class="notice">Önce yoğunlukları inceleyin, görev için yararlı bulduğunuz görünümü seçip kilitleyin; ardından hedefi bir kez tıklayın.</div><div class="btn-row right"><button id="start-pa" class="btn primary">Pratiği başlat</button></div>`);
    $("#start-pa").onclick = () => { state.practiceRuntime = makeRuntime("practice","feature","empty"); state.screen="practice-a"; render(); };
  }

  function renderPracticeA() { renderPracticeExplore("feature"); }
  function renderPracticeBIntro() {
    app.innerHTML = screenCard("Mini pratik B — Ziyaret deneyimi", `<p class="lead">Bu yapıyı ilk kez ziyaret edeceğinizi düşünün.</p><div class="notice">Dört yoğunluğu karşılaştırın ve ziyaret koşullarını anlamanıza en fazla yardımcı olan görünümü seçip kilitleyin.</div><div class="btn-row right"><button id="start-pb" class="btn primary">Pratiği başlat</button></div>`);
    $("#start-pb").onclick = () => { state.practiceRuntime = makeRuntime("practice","visit","low"); state.screen="practice-b"; render(); };
  }
  function renderPracticeB() { renderPracticeExplore("visit"); }

  function renderPracticeExplore(taskType) {
    const rt = state.practiceRuntime; const active=rt.currentDensity;
    if(!Array.isArray(rt.densityButtonsClicked))rt.densityButtonsClicked=[];
    const clickedCount=rt.densityButtonsClicked.length;
    const allLevelsClicked=C.densities.every(d=>rt.densityButtonsClicked.includes(d.id));
    const prompt = taskType==='feature' ? `Önce dört yoğunluğun tamamını açın. Kilitledikten sonra ${C.practice.targetLabel} bulun.` : "Dört yoğunluğun tamamını açın ve ziyaret koşullarını anlamanıza en fazla yardımcı olan görünümü seçin.";
    app.innerHTML = `<div class="trial-layout"><section class="card stimulus-card"><div class="task-badge ${taskType==='visit'?'visit':''}">Mini pratik ${taskType==='feature'?'A':'B'}</div><h2>${C.practice.title}</h2><p class="task-prompt ${taskType==='visit'?'visit':''}">${prompt}</p><div class="image-stage ${rt.locked && taskType==='feature'?'clickable':''}" id="practice-stage"><img src="${C.practice.images[active]}" alt="${escapeHtml(C.practice.title)}">${rt.click?`<div class="click-marker" style="left:${rt.click.x*100}%;top:${rt.click.y*100}%"></div>`:''}</div>${!rt.locked?`<div class="density-block"><div class="density-head"><strong>İnsan yoğunluğunu değiştirin</strong><span class="muted">Her yoğunluk düğmesine en az bir kez tıklayın.</span></div><div class="density-segment" id="practice-density">${densityButtons(active,rt.densityButtonsClicked)}</div></div>`:''}</section><aside class="card side-card">${!rt.locked?`<h3>Temsili seçin</h3><p>Önce dört yoğunluk düzeyinin tamamını açın. Ardından görev için en yararlı bulduğunuz yoğunluk açıkken seçiminizi kilitleyin.</p><div class="notice"><strong>Tıklanan yoğunluklar:</strong> ${clickedCount}/4<br><strong>Aktif görünüm:</strong> ${densityLabel(rt.currentDensity)}</div><div class="btn-row"><button id="practice-lock" class="btn primary" ${allLevelsClicked?'':'disabled'}>Bu görünümü kullan</button></div><p class="trial-note">${allLevelsClicked?'Dört yoğunluk düzeyi de incelendi. Seçiminizi kilitleyebilirsiniz.':'Devam etmek için dört yoğunluk düğmesinin tamamına en az bir kez tıklayın.'}</p>`:taskType==='feature'?`<h3>Hedefi tıklayın</h3><p>Seçtiğiniz görünüm kilitlendi. Lütfen ${escapeHtml(C.practice.targetLabel)} bir kez tıklayın.</p>${rt.click?'<button id="practice-confirm" class="btn primary">Yanıtımı onayla</button>':''}`:`<h3>Pratik değerlendirme</h3>${likertHtml('practice_help','Bu görünüm ziyaret koşullarını anlamanıza ne kadar yardımcı oldu?','Hiç yardımcı olmadı','Çok yardımcı oldu')}<button id="practice-b-done" class="btn primary">Pratiği tamamla</button>`}</aside></div>`;
    if (!rt.locked) {
      $$("#practice-density .density-btn").forEach(b=>b.onclick=()=>{switchRuntimeDensity(rt,b.dataset.density,"practice");renderPracticeExplore(taskType);});
      if(allLevelsClicked)$("#practice-lock").onclick=()=>{stopDwell(rt);rt.locked=true;rt.committedDensity=rt.currentDensity;rt.lockedAt=perf();log("practice_locked",{task_type:taskType,density:rt.currentDensity,all_density_levels_clicked:true});renderPracticeExplore(taskType);};
    } else if (taskType==='feature') {
      const stage=$("#practice-stage");
      if (!rt.click) stage.onclick=e=>{const p=relativePoint(e,stage);rt.click=p;rt.correct=inAoi(p,C.practice.targetAoi);log("practice_target_click",{...p,correct:rt.correct});renderPracticeExplore(taskType);};
      if ($("#practice-confirm")) $("#practice-confirm").onclick=()=>{ if(!rt.correct){alert("Pratik hedefi doğru alana tıklamadınız. Hedefi yeniden bulmak için pratiği tekrar başlatın."); state.practiceRuntime=makeRuntime("practice","feature","empty"); renderPracticeExplore(taskType);return;} state.tutorial.practiceA=true;state.screen="practice-b-intro";saveState();render();};
    } else {
      $("#practice-b-done").onclick=()=>{if(!selectedRadio('practice_help'))return alert('Lütfen örnek değerlendirmeyi yanıtlayın.');state.tutorial.practiceB=true;state.screen='timed-warning';saveState();render();};
    }
  }

  function renderTimedWarning() {
    app.innerHTML = screenCard("Süreli deney bölümü başlıyor", `<div class="notice warning"><strong>Bu aşamadan itibaren dört deneysel görev başlayacaktır.</strong><br>Sistem; insan yoğunluğu seçeneklerini inceleme sürenizi, seçenekler arasında yaptığınız geçişleri, temsil seçme sürenizi, görev tamamlama sürenizi ve verdiğiniz yanıtları kaydedecektir.</div><p>Süre ölçümleri araştırmanın temel verileri arasındadır. Bu nedenle bu bölümü ara vermeden, başka bir sekmeye veya uygulamaya geçmeden ve pencereyi küçültmeden tamamlamanız önemlidir.</p><label class="choice-card"><input id="timed-ack" type="checkbox"> Okudum, anladım ve süreli görevleri başlatmaya hazırım.</label><div class="btn-row right"><button id="timed-start" class="btn primary" disabled>Tam ekrana geç ve deneyi başlat</button></div>`);
    $("#timed-ack").onchange=e=>$("#timed-start").disabled=!e.target.checked;
    $("#timed-start").onclick=async()=>{try{await document.documentElement.requestFullscreen();}catch{} state.timedAcknowledged=true;state.screen="trial-intro";log("timed_section_started");saveState();render();};
  }

  function currentTrialSpec() {
    const [landmarkId,taskType]=schedule()[state.trialIndex];
    return { trialId:`${state.programCode}-T${state.trialIndex+1}`, landmarkId, taskType, landmark:C.landmarks[landmarkId], initialDensity:initialDensitySequence()[state.trialIndex] };
  }

  function progressHtml() {
    const n=state.trialIndex+1; return `<div class="progress-wrap"><div class="progress-top"><span>Deneme ${n}/4</span><span>${Math.round((state.trialIndex/4)*100)}% tamamlandı</span></div><div class="progress-track"><div class="progress-bar" style="width:${(state.trialIndex/4)*100}%"></div></div></div>`;
  }

  function renderTrialIntro() {
    const t=currentTrialSpec(); const isF=t.taskType==='feature';
    app.innerHTML = `${progressHtml()}${screenCard(isF?'Mimari öğe bulma görevi':'Ziyaret deneyimi görevi', `<div class="task-badge ${isF?'':'visit'}">${t.landmark.title}</div>${isF?`<p class="lead">Bir sonraki ekranda bu yapının <strong>${escapeHtml(t.landmark.targetLabel)}</strong> bulunuz.</p><div class="notice">Hedefi aramadan önce dört yoğunluk temsilini inceleyebilir ve görev için en yararlı bulduğunuz görünümü seçip kilitleyebilirsiniz. Kilitledikten sonra hedefi mümkün olduğunca hızlı ve doğru biçimde bir kez tıklayın.</div>`:`<p class="lead">Bu yapının ilk ziyaretiniz olduğunu düşünün.</p><div class="notice">Dört insan yoğunluğu temsilini karşılaştırın ve ziyaretin nasıl hissedilebileceğini anlamanıza en fazla yardımcı olan görünümü seçin. Seçiminizi kilitledikten sonra görsel kaldırılacak ve kısa sorular açılacaktır.</div>`}<div class="btn-row right"><button id="trial-start" class="btn primary">Görevi başlat</button></div>`)} `;
    $("#trial-start").onclick=()=>{state.current=makeRuntime(t.landmarkId,t.taskType,t.initialDensity);state.current.trialId=t.trialId;state.current.startedAt=perf();state.current.startedIso=nowIso();state.screen='explore';log('trial_started',{trial_id:t.trialId,landmark_id:t.landmarkId,task_type:t.taskType,initial_density:t.initialDensity});saveState();render();};
  }

  function makeRuntime(landmarkId,taskType,initialDensity) {
    return { landmarkId,taskType,currentDensity:initialDensity,initialDensity,firstUserSelected:null,committedDensity:null,sequence:[initialDensity],visited:[initialDensity],densityButtonsClicked:[],switchCount:0,timeByDensity:{empty:0,low:0,moderate:0,high:0},densityEnteredAt:perf(),startedAt:perf(),lockedAt:null,click:null,correct:null,aoiDistance:null,ratings:{},openExplanation:"" };
  }
  function switchRuntimeDensity(rt,density,context='trial') {
    if(!Array.isArray(rt.densityButtonsClicked))rt.densityButtonsClicked=[];
    if(!rt.densityButtonsClicked.includes(density))rt.densityButtonsClicked.push(density);
    log('density_button_clicked',{context,density,clicked_count:rt.densityButtonsClicked.length});
    if(!rt.firstUserSelected)rt.firstUserSelected=density;
    if(rt.currentDensity===density){saveState();return;}
    stopDwell(rt); rt.currentDensity=density;rt.densityEnteredAt=perf();rt.switchCount++;rt.sequence.push(density);if(!rt.visited.includes(density))rt.visited.push(density);log('density_changed',{context,density,switch_count:rt.switchCount});saveState();
  }
  function stopDwell(rt) { if(rt.densityEnteredAt){rt.timeByDensity[rt.currentDensity]+=perf()-rt.densityEnteredAt;rt.densityEnteredAt=null;} }

  function renderExplore() {
    const t=currentTrialSpec();const rt=state.current;const isF=rt.taskType==='feature';
    if(!Array.isArray(rt.densityButtonsClicked))rt.densityButtonsClicked=[];
    const allLevelsClicked=C.densities.every(d=>rt.densityButtonsClicked.includes(d.id));
    app.innerHTML=`${progressHtml()}<div class="trial-layout"><section class="card stimulus-card"><div class="task-badge ${isF?'':'visit'}">${isF?'Mimari öğe bulma':'Ziyaret deneyimi'}</div><div class="screen-title"><div><h2>${t.landmark.title}</h2><p class="task-prompt ${isF?'':'visit'}">${isF?`Bu görev için yararlı bulduğunuz görünümü seçin. Kilitledikten sonra ${escapeHtml(t.landmark.targetLabel)} bulun.`:'İlk ziyaret koşullarını anlamanıza en fazla yardımcı olan görünümü seçin.'}</p></div></div><div class="image-stage"><img id="stimulus" src="${t.landmark.images[rt.currentDensity]}" alt="${escapeHtml(t.landmark.title)}"></div><div class="density-block"><div class="density-head"><strong>İnsan yoğunluğunu değiştirin</strong><span class="muted">Düzeyler arasında istediğiniz kadar geçiş yapabilirsiniz.</span></div><div class="density-segment" id="density-buttons">${densityButtons(rt.currentDensity,rt.densityButtonsClicked)}</div></div></section><aside class="card side-card"><h3>Temsil seçimi</h3><p>Görev için yararlı bulduğunuz yoğunluk açıkken seçiminizi kilitleyin. Ana denemelerde dört düzeyin tamamını açmanız zorunlu değildir.</p><div class="notice"><strong>Görülen yoğunluklar:</strong> ${rt.visited.length}/4<br><strong>Aktif görünüm:</strong> ${densityLabel(rt.currentDensity)}</div><div class="btn-row"><button id="lock-view" class="btn primary">Bu görünümü kullan</button></div><p class="trial-note">Seçiminizi kilitledikten sonra yoğunluk değiştirilemez.</p></aside></div>`;
    $$("#density-buttons .density-btn").forEach(b=>b.onclick=()=>{switchRuntimeDensity(rt,b.dataset.density);renderExplore();});
    $("#lock-view").onclick=()=>{stopDwell(rt);if(!rt.firstUserSelected)rt.firstUserSelected=rt.currentDensity;rt.lockedAt=perf();rt.committedDensity=rt.currentDensity;log('representation_committed',{trial_id:rt.trialId,committed_density:rt.committedDensity,selection_time_ms:Math.round(rt.lockedAt-rt.startedAt),all_density_levels_clicked:allLevelsClicked});state.screen=isF?'feature-task':'rating';saveState();render();};
  }
  function densityLabel(id){const d=C.densities.find(x=>x.id===id);return `${d.tr} (${d.label})`;}

  function renderFeatureTask() {
    const t=currentTrialSpec();const rt=state.current;
    app.innerHTML=`${progressHtml()}<div class="trial-layout"><section class="card stimulus-card"><div class="task-badge">Mimari öğe bulma</div><h2>${t.landmark.title}</h2><p class="task-prompt">${escapeHtml(t.landmark.targetLabel)} mümkün olduğunca hızlı ve doğru biçimde bir kez tıklayın.</p><div id="feature-stage" class="image-stage clickable"><img src="${t.landmark.images[rt.committedDensity]}" alt="${escapeHtml(t.landmark.title)}">${rt.click?`<div class="click-marker" style="left:${rt.click.x*100}%;top:${rt.click.y*100}%"></div>`:''}</div></section><aside class="card side-card"><h3>Seçilen görünüm</h3><div class="lock-summary">${densityLabel(rt.committedDensity)}</div>${rt.click?`<p>Yanıtınız kaydedildi. Doğruluk bilgisi deney sırasında gösterilmeyecektir.</p><button id="confirm-click" class="btn primary">Yanıtımı onayla</button>`:`<p>Hedefi görsel üzerinde yalnızca bir kez tıklayın. İlk tıklamanız görev süresi olarak kaydedilir.</p>`}</aside></div>`;
    const stage=$("#feature-stage");
    if(!rt.click)stage.onclick=e=>{const p=relativePoint(e,stage);rt.click=p;rt.taskClickedAt=perf();rt.correct=inAoi(p,t.landmark.targetAoi);rt.aoiDistance=aoiDistance(p,t.landmark.targetAoi);log('target_clicked',{trial_id:rt.trialId,...p,accuracy:rt.correct?1:0,aoi_distance:rt.aoiDistance,localization_time_ms:Math.round(rt.taskClickedAt-rt.lockedAt)});saveState();renderFeatureTask();};
    if($("#confirm-click"))$("#confirm-click").onclick=()=>{state.screen='rating';saveState();render();};
  }
  function relativePoint(e,stage){const r=stage.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
  function inAoi(p,a){return p.x>=a.xMin&&p.x<=a.xMax&&p.y>=a.yMin&&p.y<=a.yMax;}
  function aoiDistance(p,a){const cx=(a.xMin+a.xMax)/2,cy=(a.yMin+a.yMax)/2;return Math.sqrt((p.x-cx)**2+(p.y-cy)**2);}

  function taskQuestions(taskType) {
    if(taskType==='feature')return [
      {id:'answer_confidence',q:'Verdiğiniz yanıttan ne kadar eminsiniz?',low:'Hiç emin değilim',high:'Çok eminim'},
      {id:'control_usefulness',q:'İnsan yoğunluğunu değiştirebilme özelliği bu görevi tamamlamanız için ne kadar kullanışlıydı?',low:'Hiç kullanışlı değil',high:'Çok kullanışlı'},
      {id:'comparison_benefit',q:'Farklı yoğunluk düzeylerini karşılaştırmak hedef mimari öğeyi belirlemenize ne kadar yardımcı oldu?',low:'Hiç yardımcı olmadı',high:'Çok yardımcı oldu'}
    ];
    return [
      {id:'self_location_imagery',q:'Bu mekânda bulunduğunuzu ne ölçüde hayal edebildiniz?',low:'Hiç hayal edemedim',high:'Çok canlı hayal edebildim'},
      {id:'informational_adequacy',q:'Seçtiğiniz temsil ziyaret koşulları hakkında ne kadar bilgi sağladı?',low:'Hiç bilgi sağlamadı',high:'Çok fazla bilgi sağladı'},
      {id:'representational_realism',q:'Seçtiğiniz yoğunluk ziyaret ortamı açısından ne kadar gerçekçi geldi?',low:'Hiç gerçekçi değil',high:'Çok gerçekçi'},
      {id:'aesthetic_appeal',q:'Seçtiğiniz temsil estetik açıdan ne kadar çekiciydi?',low:'Hiç çekici değil',high:'Çok çekici'},
      {id:'expected_comfort',q:'Bu yoğunlukta bulunmak sizin için ne kadar rahat olurdu?',low:'Hiç rahat olmazdı',high:'Çok rahat olurdu'},
      {id:'control_usefulness',q:'Yoğunluk kontrolü ziyaret koşullarını anlamanız için ne kadar kullanışlıydı?',low:'Hiç kullanışlı değil',high:'Çok kullanışlı'}
    ];
  }

  function renderRating() {
    const t=currentTrialSpec();const rt=state.current;const qs=taskQuestions(rt.taskType);
    app.innerHTML=`${progressHtml()}<section class="card padded medium"><div class="task-badge ${rt.taskType==='visit'?'visit':''}">${rt.taskType==='feature'?'Görev sonrası değerlendirme':'Ziyaret deneyimi değerlendirmesi'}</div><h2>${t.landmark.title}</h2><div class="notice">Görsel kaldırılmıştır. Lütfen az önceki deneyiminize dayanarak yanıt verin.</div><form id="rating-form">${qs.map(x=>`<div class="rating-card">${likertHtml(`rating_${x.id}`,x.q,x.low,x.high,rt.ratings[x.id])}</div>`).join('')}${rt.taskType==='visit'?`<div class="rating-card"><div class="question-title">Bu mekânı gerçekte ziyaret etseydiniz hangi insan yoğunluğunu tercih ederdiniz?</div><div class="option-four">${C.densities.map(d=>`<label><input type="radio" name="ideal_density" value="${d.id}" ${rt.ratings.ideal_density===d.id?'checked':''}><span>${d.tr}</span></label>`).join('')}</div></div><div class="field"><label>Bu yoğunluk size nasıl yardımcı oldu veya neden yardımcı olmadı?</label><textarea id="trial-open" rows="4">${escapeHtml(rt.openExplanation||'')}</textarea></div>`:''}<div class="btn-row right"><button class="btn primary" type="submit">${state.trialIndex===3?'Deney sonu değerlendirmesine geç':'Sonraki denemeye geç'}</button></div></form></section>`;
    $("#rating-form").onsubmit=async e=>{e.preventDefault();for(const q of qs){const v=selectedRadio(`rating_${q.id}`);if(!v)return alert('Lütfen tüm 7’li ölçekleri yanıtlayın.');rt.ratings[q.id]=Number(v);}if(rt.taskType==='visit'){const ideal=selectedRadio('ideal_density');if(!ideal)return alert('Lütfen ideal yoğunluk tercihinizi belirtin.');rt.ratings.ideal_density=ideal;rt.openExplanation=$("#trial-open").value.trim();}rt.ratingCompletedAt=perf();const result=finalizeTrial(rt,t);state.trialResults.push(result);log('trial_completed',{trial_id:result.trial_id});saveState();submitTrial(result).catch(()=>{});state.current=null;state.trialIndex++;if(state.trialIndex>=4)state.screen='final';else state.screen='trial-intro';saveState();render();};
  }

  function finalizeTrial(rt,t) {
    return {
      participant_id:state.participantId,program_code:state.programCode,main_group:state.mainGroup,order_variant:state.orderVariant,trial_id:rt.trialId,trial_order:state.trialIndex+1,landmark_id:t.landmarkId,landmark_title:t.landmark.title,task_type:rt.taskType,initial_density:rt.initialDensity,first_user_selected_density:rt.firstUserSelected||'',committed_density:rt.committedDensity,density_sequence:rt.sequence.join('>'),switch_count:rt.switchCount,unique_levels_viewed:rt.visited.length,density_buttons_clicked:(rt.densityButtonsClicked||[]).join('>'),all_density_levels_clicked:C.densities.every(d=>(rt.densityButtonsClicked||[]).includes(d.id))?1:0,time_empty_ms:Math.round(rt.timeByDensity.empty),time_low_ms:Math.round(rt.timeByDensity.low),time_moderate_ms:Math.round(rt.timeByDensity.moderate),time_high_ms:Math.round(rt.timeByDensity.high),selection_time_ms:Math.round(rt.lockedAt-rt.startedAt),localization_time_ms:rt.taskClickedAt?Math.round(rt.taskClickedAt-rt.lockedAt):'',click_x:rt.click?.x??'',click_y:rt.click?.y??'',accuracy:rt.correct===null?'':rt.correct?1:0,aoi_distance:rt.aoiDistance??'',ratings:rt.ratings,open_explanation:rt.openExplanation,started_iso:rt.startedIso,completed_iso:nowIso(),familiarity:state.familiarity[t.landmarkId],initial_density_sequence:initialDensitySequence().join('>')
    };
  }

  function renderFinal() {
    app.innerHTML=screenCard("Deney sonu — Arayüz değerlendirmesi",`<p class="lead">Dört görevin tamamını bitirdiniz. Son olarak yoğunluk kontrolünün genel arayüz değerini değerlendirin.</p><form id="final-form">${likertHtml('final_usefulness','Genel olarak, insan yoğunluğunu kontrol edebilmek ne kadar kullanışlıydı?','Hiç kullanışlı değil','Çok kullanışlı',state.final.usefulness)}${likertHtml('final_ease','İnsan yoğunluğu kontrolünü anlamak ve kullanmak ne kadar kolaydı?','Çok zor','Çok kolay',state.final.ease)}${likertHtml('final_value','Tek bir sabit görüntüyle karşılaştırıldığında, yoğunluklar arasında geçiş yapmak mekânı daha bütünlüklü anlamanıza ne kadar yardımcı oldu?','Hiç yardımcı olmadı','Çok yardımcı oldu',state.final.representational_value)}${likertHtml('final_future','Dijital miras veya seyahat platformlarında bu tür bir yoğunluk kontrolünün bulunmasını ne ölçüde isterdiniz?','Kesinlikle istemem','Kesinlikle isterdim',state.final.future_preference)}<div class="field"><label>Yoğunluk kontrolünün size nasıl yardımcı olduğunu veya neden yardımcı olmadığını kısaca açıklayın.</label><textarea id="final-comment" rows="5">${escapeHtml(state.final.comment||'')}</textarea></div><div class="btn-row right"><button class="btn primary" type="submit">Verileri gönder ve çalışmayı tamamla</button></div></form>`,"medium");
    $("#final-form").onsubmit=async e=>{e.preventDefault();const names=['final_usefulness','final_ease','final_value','final_future'];if(names.some(n=>!selectedRadio(n)))return alert('Lütfen tüm değerlendirmeleri yanıtlayın.');state.final={usefulness:Number(selectedRadio('final_usefulness')),ease:Number(selectedRadio('final_ease')),representational_value:Number(selectedRadio('final_value')),future_preference:Number(selectedRadio('final_future')),comment:$("#final-comment").value.trim()};state.screen='complete';saveState();renderComplete(true);};
  }

  async function renderComplete(performUpload=false) {
    app.innerHTML=screenCard("Çalışma tamamlanıyor",`<div class="assignment-loader"><div class="spinner"></div><h2>Veriler güvenli biçimde gönderiliyor</h2><p class="muted" id="upload-status">Lütfen bu pencereyi kapatmayın.</p></div>`,"medium");
    if(!performUpload){showCompleteResult();return;}
    state.completedAt=nowIso();log('session_completion_requested');
    const status=$("#upload-status");
    try{
      if(!state.uploaded||!state.completionRegistered){
        status.textContent='Oturum verisi güvenli araştırma veritabanına gönderiliyor…';
        await submitSession();state.uploaded=true;state.completionRegistered=true;saveState();
      }
      log('session_completed',{uploaded:true,completion_registered:true});
      if(state.assignmentSource.includes('local-demo'))incrementLocalCompleted();
      showCompleteResult();
    }catch(error){state.uploadError=String(error.message||error);saveState();showCompleteResult();}
  }

  function showCompleteResult() {
    const ok=state.uploaded&&state.completionRegistered;
    if(ok){
      app.innerHTML=screenCard('Çalışma tamamlandı',`<div class="completion-icon">✓</div><div class="center"><h2>Katılımınız için teşekkür ederiz.</h2><p>Yanıtlarınız başarıyla kaydedildi. Bu pencereyi kapatabilirsiniz.</p></div>`,"narrow");
      return;
    }
    app.innerHTML=screenCard('Veriler henüz gönderilemedi',`<div class="completion-icon">!</div><div class="center"><h2>Otomatik gönderim tamamlanamadı.</h2><p>Veriler bu tarayıcıda geçici olarak korunmaktadır. İnternet bağlantınızı kontrol edip yeniden göndermeyi deneyin.</p>${state.uploadError?`<div class="notice danger">${escapeHtml(state.uploadError)}</div>`:''}</div><div class="download-list"><button id="retry-upload" class="btn primary">Gönderimi yeniden dene</button><button id="download-json" class="btn secondary">Yedek veri dosyasını indir</button></div>`,"narrow");
    $("#retry-upload").onclick=()=>renderComplete(true);
    $("#download-json").onclick=()=>download(`${state.participantId}_session.json`,JSON.stringify(sessionPayload(),null,2),'application/json');
  }

  function sessionPayload(){return{app_version:C.version,production_ready:C.productionReady,participant_id:state.participantId,program_code:state.programCode,main_group:state.mainGroup,order_variant:state.orderVariant,serial:state.serial,assignment_source:state.assignmentSource,assigned_at:state.assignedAt,profile:state.profile,familiarity:state.familiarity,tutorial:state.tutorial,timed_acknowledged:state.timedAcknowledged,trials:state.trialResults,final:state.final,events:state.events,completed_at:state.completedAt,device:{browser:browserName(),screen_width:screen.width,screen_height:screen.height,viewport_width:innerWidth,viewport_height:innerHeight}};}

  async function submitTrial(result){if(location.protocol==='file:'||['localhost','127.0.0.1'].includes(location.hostname))return;await postJson(C.trialEndpoint,{trial:result},'Deneme verisi kaydedilemedi.');}
  async function submitSession(){if(location.protocol==='file:'||['localhost','127.0.0.1'].includes(location.hostname)){state.uploaded=true;state.completionRegistered=true;return;}await postJson(C.completionEndpoint,{session:sessionPayload()},'Oturum verisi kaydedilemedi.');}
  async function postJson(endpoint,payload,fallback){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});let data={};try{data=await r.json();}catch{}if(!r.ok)throw new Error(data.error||fallback||`Gönderim başarısız (${r.status}).`);return data;}
  function incrementLocalCompleted(){const counts=JSON.parse(localStorage.getItem('study2DemoCounts')||'{}');if(!state._localCompletionCounted){counts[state.programCode]=(counts[state.programCode]||0)+1;localStorage.setItem('study2DemoCounts',JSON.stringify(counts));state._localCompletionCounted=true;saveState();}}

  function toCsv(rows){if(!rows.length)return'';const flat=rows.map(r=>flatten(r));const keys=[...new Set(flat.flatMap(r=>Object.keys(r)))];const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;return '\ufeff'+[keys.map(esc).join(','),...flat.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n');}
  function flatten(obj,prefix='',out={}){for(const[k,v]of Object.entries(obj||{})){const key=prefix?`${prefix}.${k}`:k;if(v&&typeof v==='object'&&!Array.isArray(v))flatten(v,key,out);else out[key]=Array.isArray(v)?JSON.stringify(v):v;}return out;}
  function download(name,content,type){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

  function monitorFocus() {
    const timed = ['trial-intro','explore','feature-task','rating'].includes(state.screen) && state.timedAcknowledged;
    if(!timed)return;
    const invalid=document.hidden||innerWidth<C.minimumDesktopWidth||!document.fullscreenElement;
    focusOverlay.classList.toggle('hidden',!invalid);
    if(invalid)log('visibility_or_layout_violation',{document_hidden:document.hidden,inner_width:innerWidth,fullscreen:!!document.fullscreenElement});
  }
  focusReturnBtn.onclick=async()=>{try{await document.documentElement.requestFullscreen();}catch{}focusOverlay.classList.add('hidden');};
  document.addEventListener('visibilitychange',monitorFocus);window.addEventListener('resize',monitorFocus);document.addEventListener('fullscreenchange',monitorFocus);

  async function boot(){
    updateHeader();
    if(isMobileDevice()){state.screen='blocked';render();return;}
    if(isViewportTooNarrow()){state.screenBeforeResize=state.screen;state.screen='resize-required';render();return;}
    preloadStimuliInBackground();
    if(state.completedAt){state.screen='complete';render();return;}
    if(state.participantId){
      if(['explore','feature-task','rating'].includes(state.screen) && state.current){
        state.events.push({event_type:'session_reloaded_during_trial',event_time:nowIso(),trial_index:state.trialIndex});
        state.current=null;
        state.screen='trial-intro';
        saveState();
      } else if(state.screen==='boot'||state.screen==='assigning') state.screen='consent';
      render();return;
    }
    await assignParticipant();
  }
  boot();
})();
