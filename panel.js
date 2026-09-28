(() => {
  "use strict";
  const DB_NAME = "voz-pronta-library";
  const DB_VERSION = 2;
  const MAX_FILE_SIZE = 32 * 1024 * 1024;
  const MAX_IMAGE_SIZE = 16 * 1024 * 1024;
  const activeJobs = new Map();
  let selectedFile = null;
  let selectedImage = null;
  let audioCache = [];
  let imageCache = [];
  let db;

  const $ = (selector) => document.querySelector(selector);
  const post = (payload) => parent.postMessage({ source: "voz-pronta-panel", payload }, "*");
  const request = (store, mode, operation) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = operation(tx.objectStore(store));
    result.onsuccess = () => resolve(result.result);
    result.onerror = () => reject(result.error);
  });
  const getAll = (store) => request(store, "readonly", (s) => s.getAll());
  const getOne = (store, id) => request(store, "readonly", (s) => s.get(id));
  const putOne = (store, value) => request(store, "readwrite", (s) => s.put(value));
  const deleteOne = (store, id) => request(store, "readwrite", (s) => s.delete(id));

  const openDb = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const nextDb = req.result;
      if (!nextDb.objectStoreNames.contains("audios")) nextDb.createObjectStore("audios", { keyPath: "id" });
      if (!nextDb.objectStoreNames.contains("images")) nextDb.createObjectStore("images", { keyPath: "id" });
      if (!nextDb.objectStoreNames.contains("funnels")) nextDb.createObjectStore("funnels", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const toast = (message, error = false) => {
    const element = $("#toast");
    element.textContent = message;
    element.classList.toggle("is-error", error);
    element.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { element.hidden = true; }, 4500);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    return `${mins}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
  };

  const encodeOggOpus = async (file) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    try {
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      const mono = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const data = decoded.getChannelData(channel);
        for (let i = 0; i < data.length; i += 1) mono[i] += data[i] / decoded.numberOfChannels;
      }

      await globalThis.vozProntaOpusReady;
      if (!globalThis.VozProntaOpus?.OggOpusEncoder) {
        throw new Error("O codificador OGG/Opus não foi carregado.");
      }

      const encoder = new globalThis.VozProntaOpus.OggOpusEncoder({
          originalSampleRate: decoded.sampleRate, encoderSampleRate: 48000,
          numberOfChannels: 1, encoderApplication: 2048, encoderFrameSize: 20,
          encoderBitRate: 24000, encoderComplexity: 6, maxFramesPerPage: 40,
          resampleQuality: 3, streamPages: false
      }, globalThis.VozProntaOpus.Module);

      const pages = [encoder.generateIdPage(), encoder.generateCommentPage()];
      const block = 4096;
      for (let offset = 0; offset < mono.length; offset += block) {
        pages.push(...encoder.encode([mono.subarray(offset, offset + block)]));
      }
      pages.push(...encoder.encodeFinalFrame());

      const validPages = pages.filter(Boolean).map((item) => item.page);
      const total = validPages.reduce((sum, page) => sum + page.length, 0);
      const output = new Uint8Array(total);
      let outputOffset = 0;
      validPages.forEach((page) => { output.set(page, outputOffset); outputOffset += page.length; });
      if (output.length < 64 || new TextDecoder().decode(output.slice(0, 4)) !== "OggS") {
        throw new Error("O codificador não produziu um arquivo OGG válido.");
      }
      return { bytes: output.buffer, duration: decoded.duration };
    } finally {
      void context.close();
    }
  };

  const audioOptions = (selected = "") => audioCache.map((audio) =>
    `<option value="${audio.id}" ${audio.id === selected ? "selected" : ""}>${escapeHtml(audio.name)}</option>`
  ).join("");
  const imageOptions = (selected = "") => imageCache.map((image) =>
    `<option value="${image.id}" ${image.id === selected ? "selected" : ""}>${escapeHtml(image.name)}</option>`
  ).join("");
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);

  const renderAudios = async () => {
    audioCache = (await getAll("audios")).sort((a, b) => b.createdAt - a.createdAt);
    $("#audio-count").textContent = `${audioCache.length} ${audioCache.length === 1 ? "item" : "itens"}`;
    const list = $("#audio-list");
    list.replaceChildren();
    if (!audioCache.length) {
      list.innerHTML = '<div class="empty">Sua biblioteca está vazia.<br>Adicione o primeiro áudio acima.</div>';
      return;
    }
    audioCache.forEach((audio) => {
      const card = document.createElement("article");
      card.className = "audio-card";
      card.innerHTML = `<div class="card-icon">♪</div><div class="card-copy"><strong>${escapeHtml(audio.name)}</strong><small>OGG/Opus · ${formatDuration(audio.duration)}</small></div><div class="card-actions"><button class="mini play">▶</button><button class="mini mini--send send">Enviar</button><button class="mini mini--danger remove">×</button></div>`;
      let player;
      card.querySelector(".play").onclick = () => {
        if (player && !player.paused) { player.pause(); return; }
        player = new Audio(URL.createObjectURL(new Blob([audio.bytes], { type: "audio/ogg; codecs=opus" })));
        player.play();
      };
      card.querySelector(".send").onclick = () => {
        post({ type: "SEND_AUDIO", audio: { name: audio.name, bytes: audio.bytes.slice(0) } });
        toast(`Enviando “${audio.name}” na conversa aberta…`);
      };
      card.querySelector(".remove").onclick = async () => {
        if (!confirm(`Excluir o áudio “${audio.name}”?`)) return;
        await deleteOne("audios", audio.id);
        await renderAudios();
        await renderFunnels();
      };
      list.appendChild(card);
    });
  };

  const renderImages = async () => {
    imageCache = (await getAll("images")).sort((a, b) => b.createdAt - a.createdAt);
    $("#image-count").textContent = `${imageCache.length} ${imageCache.length === 1 ? "item" : "itens"}`;
    const list = $("#image-list");
    list.replaceChildren();
    if (!imageCache.length) {
      list.innerHTML = '<div class="empty" style="grid-column:1/-1">Sua galeria está vazia.<br>Adicione a primeira imagem acima.</div>';
      return;
    }
    imageCache.forEach((image) => {
      const card = document.createElement("article");
      card.className = "image-card";
      const url = URL.createObjectURL(new Blob([image.bytes], { type: image.mimeType }));
      card.innerHTML = `<img alt="${escapeHtml(image.name)}"><div class="image-card__body"><strong>${escapeHtml(image.name)}</strong><small>${escapeHtml(image.mimeType.replace("image/", "").toUpperCase())}</small><div class="card-actions"><button class="mini mini--send send">Enviar</button><button class="mini mini--danger remove">Excluir</button></div></div>`;
      card.querySelector("img").src = url;
      card.querySelector(".send").onclick = () => {
        post({ type: "SEND_IMAGE", image: { name: image.name, mimeType: image.mimeType, bytes: image.bytes.slice(0) } });
        toast(`Enviando “${image.name}” na conversa aberta…`);
      };
      card.querySelector(".remove").onclick = async () => {
        if (!confirm(`Excluir a imagem “${image.name}”?`)) return;
        await deleteOne("images", image.id);
        URL.revokeObjectURL(url);
        await renderImages();
        await renderFunnels();
      };
      list.appendChild(card);
    });
  };

  const addStep = (step = {}) => {
    const item = document.createElement("div");
    item.className = "funnel-step";
    const initialType = step.type || "audio";
    item.innerHTML = `<label>Tipo<select class="step-type"><option value="audio">Áudio</option><option value="image">Imagem</option><option value="text">Texto</option></select></label><div class="funnel-step__content"></div><label>Espera (s)<input class="step-delay" type="number" min="0" max="3600" value="${Number(step.delaySeconds) || 5}" required></label><button type="button" class="remove-step" title="Remover">×</button>`;
    const typeSelect = item.querySelector(".step-type");
    typeSelect.value = initialType;
    const renderContent = () => {
      const content = item.querySelector(".funnel-step__content");
      if (typeSelect.value === "audio") {
        content.innerHTML = `<label>Áudio<select class="step-value" required>${audioOptions(step.contentId || step.audioId)}</select></label>`;
      } else if (typeSelect.value === "image") {
        content.innerHTML = `<label>Imagem<select class="step-value" required>${imageOptions(step.contentId)}</select></label>`;
      } else {
        content.innerHTML = `<label>Mensagem<textarea class="step-value" maxlength="4000" placeholder="Digite o texto desta etapa" required>${escapeHtml(step.text || "")}</textarea></label>`;
      }
    };
    typeSelect.addEventListener("change", () => { step = {}; renderContent(); });
    renderContent();
    item.querySelector(".remove-step").onclick = () => item.remove();
    $("#funnel-steps").appendChild(item);
  };

  const renderFunnels = async () => {
    const funnels = (await getAll("funnels")).sort((a, b) => b.createdAt - a.createdAt);
    $("#funnel-count").textContent = `${funnels.length} ${funnels.length === 1 ? "item" : "itens"}`;
    const list = $("#funnel-list");
    list.replaceChildren();
    if (!funnels.length) {
      list.innerHTML = '<div class="empty">Nenhum funil criado.<br>Monte uma sequência acima.</div>';
      return;
    }
    funnels.forEach((funnel) => {
      const card = document.createElement("article");
      card.className = "funnel-card";
      const summary = funnel.steps.map((step, i) => {
        const type = step.type || "audio";
        const media = type === "audio"
          ? audioCache.find((item) => item.id === (step.contentId || step.audioId))
          : imageCache.find((item) => item.id === step.contentId);
        const label = type === "text" ? `“${escapeHtml((step.text || "").slice(0, 34))}”` : escapeHtml(media?.name || "Mídia removida");
        const icon = type === "audio" ? "Áudio" : type === "image" ? "Imagem" : "Texto";
        return `${i + 1}. ${icon}: ${label} · ${step.delaySeconds}s`;
      }).join("<br>");
      card.innerHTML = `<div class="card-icon">⇢</div><div class="card-copy"><strong>${escapeHtml(funnel.name)}</strong><small>${funnel.steps.length} etapa(s)</small><div class="step-summary">${summary}</div></div><div class="card-actions"><button class="mini mini--send start">Iniciar</button><button class="mini mini--danger remove">Excluir</button></div>`;
      card.querySelector(".start").onclick = () => startFunnel(funnel);
      card.querySelector(".remove").onclick = async () => {
        if (!confirm(`Excluir o funil “${funnel.name}”?`)) return;
        await deleteOne("funnels", funnel.id);
        await renderFunnels();
      };
      list.appendChild(card);
    });
  };

  const startFunnel = async (funnel) => {
    const steps = [];
    for (const step of funnel.steps) {
      const type = step.type || "audio";
      if (type === "text") {
        steps.push({ type, text: step.text, delayMs: step.delaySeconds * 1000 });
        continue;
      }
      const store = type === "image" ? "images" : "audios";
      const media = await getOne(store, step.contentId || step.audioId);
      if (!media) return toast("Uma das mídias deste funil foi removida.", true);
      steps.push({ type, name: media.name, mimeType: media.mimeType, bytes: media.bytes.slice(0), delayMs: step.delaySeconds * 1000 });
    }
    const jobId = crypto.randomUUID();
    activeJobs.set(jobId, { id: jobId, funnelName: funnel.name, chatName: "Conversa aberta", step: 0, total: steps.length, remainingSeconds: 0 });
    renderActivity();
    post({ type: "START_FUNNEL", jobId, steps });
    toast(`Funil “${funnel.name}” iniciado na conversa aberta.`);
  };

  const renderActivity = () => {
    const list = $("#activity-list");
    const jobs = [...activeJobs.values()];
    $("#active-count").hidden = !jobs.length;
    $("#active-count").textContent = jobs.length;
    list.replaceChildren();
    if (!jobs.length) {
      list.innerHTML = '<div class="empty">Nenhum funil em andamento.</div>';
      return;
    }
    jobs.forEach((job) => {
      const card = document.createElement("article");
      card.className = "activity-card";
      const waitingLabel = job.indicator === "typing" ? "Digitando" : "Gravando áudio";
      const status = job.remainingSeconds > 0 ? `${waitingLabel}… ${job.remainingSeconds}s` : `Enviando etapa ${Math.max(1, job.step)}`;
      card.innerHTML = `<div class="card-icon">●</div><div class="card-copy"><strong>${escapeHtml(job.funnelName)}</strong><small>${escapeHtml(job.chatName)} · ${status}</small><progress max="${job.total}" value="${job.step}"></progress></div><button class="mini mini--danger cancel">Parar</button>`;
      card.querySelector(".cancel").onclick = () => post({ type: "CANCEL_FUNNEL", jobId: job.id });
      list.appendChild(card);
    });
  };

  window.addEventListener("message", (event) => {
    if (event.data?.source !== "voz-pronta-page") return;
    const data = event.data.payload;
    if (data.type === "SENT") toast(`${data.kind === "image" ? "Imagem" : "Áudio"} enviado(a) para ${data.chatName}.`);
    if (data.type === "ERROR") toast(data.message || "Falha ao enviar o áudio.", true);
    if (data.type === "FUNNEL_STARTED") {
      const job = activeJobs.get(data.jobId);
      if (job) { job.chatName = data.chatName; job.total = data.total; renderActivity(); }
    }
    if (data.type === "FUNNEL_PROGRESS") {
      const job = activeJobs.get(data.jobId);
      if (job) { Object.assign(job, data); renderActivity(); }
    }
    if (data.type === "FUNNEL_STEP_SENT") {
      const job = activeJobs.get(data.jobId);
      if (job) { job.step = data.step; job.remainingSeconds = 0; renderActivity(); }
    }
    if (data.type === "FUNNEL_DONE" || data.type === "FUNNEL_ERROR") {
      activeJobs.delete(data.jobId);
      renderActivity();
      toast(data.type === "FUNNEL_DONE" ? `Funil concluído em ${data.chatName}.` : `Funil interrompido: ${data.message}`, data.type === "FUNNEL_ERROR");
    }
  });

  document.querySelectorAll(".tab").forEach((button) => button.onclick = () => {
    document.querySelectorAll(".tab,.view").forEach((element) => element.classList.remove("is-active"));
    button.classList.add("is-active");
    $(`#view-${button.dataset.tab}`).classList.add("is-active");
  });
  $("#close").onclick = () => parent.postMessage({ source: "voz-pronta-panel", type: "CLOSE_PANEL" }, "*");
  $("#audio-file").onchange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { event.target.value = ""; return toast("O arquivo ultrapassa 32 MB.", true); }
    selectedFile = file;
    $("#chosen-file").textContent = file.name;
    $("#audio-name").value = file.name.replace(/\.[^.]+$/, "");
    $(".dropzone").hidden = true;
    $(".upload-fields").hidden = false;
  };
  $("#cancel-file").onclick = () => {
    selectedFile = null; $("#audio-file").value = ""; $(".dropzone").hidden = false; $(".upload-fields").hidden = true;
  };
  $("#audio-form").onsubmit = async (event) => {
    event.preventDefault();
    if (!selectedFile) return;
    const name = $("#audio-name").value.trim();
    $(".upload-fields").hidden = true; $("#convert-progress").hidden = false;
    try {
      const encoded = await encodeOggOpus(selectedFile);
      await putOne("audios", { id: crypto.randomUUID(), name, bytes: encoded.bytes, duration: encoded.duration, createdAt: Date.now() });
      selectedFile = null; $("#audio-file").value = ""; $(".dropzone").hidden = false;
      toast(`“${name}” foi convertido e salvo.`);
      await renderAudios(); await renderFunnels();
    } catch (error) { $(".upload-fields").hidden = false; toast(error.message || "Falha na conversão.", true); }
    finally { $("#convert-progress").hidden = true; }
  };
  $("#image-file").onchange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE) { event.target.value = ""; return toast("A imagem ultrapassa 16 MB.", true); }
    selectedImage = file;
    $("#chosen-image").textContent = file.name;
    $("#image-name").value = file.name.replace(/\.[^.]+$/, "");
    $("#image-preview").src = URL.createObjectURL(file);
    $("#view-images .dropzone").hidden = true;
    $(".image-fields").hidden = false;
  };
  $("#cancel-image").onclick = () => {
    selectedImage = null; $("#image-file").value = ""; $("#view-images .dropzone").hidden = false; $(".image-fields").hidden = true;
  };
  $("#image-form").onsubmit = async (event) => {
    event.preventDefault();
    if (!selectedImage) return;
    const name = $("#image-name").value.trim();
    await putOne("images", {
      id: crypto.randomUUID(), name, bytes: await selectedImage.arrayBuffer(),
      mimeType: selectedImage.type, createdAt: Date.now()
    });
    selectedImage = null; $("#image-file").value = ""; $("#view-images .dropzone").hidden = false; $(".image-fields").hidden = true;
    toast(`Imagem “${name}” salva.`);
    await renderImages(); await renderFunnels();
  };
  $("#add-step").onclick = () => {
    if (!audioCache.length) return toast("Salve pelo menos um áudio primeiro.", true);
    addStep();
  };
  $("#funnel-form").onsubmit = async (event) => {
    event.preventDefault();
    const nodes = [...document.querySelectorAll(".funnel-step")];
    if (!nodes.length) return toast("Adicione pelo menos uma etapa.", true);
    const steps = nodes.map((node) => {
      const type = node.querySelector(".step-type").value;
      const value = node.querySelector(".step-value").value;
      return {
        type,
        ...(type === "text" ? { text: value.trim() } : { contentId: value }),
        delaySeconds: Math.max(0, Math.min(3600, Number(node.querySelector(".step-delay").value) || 0))
      };
    });
    await putOne("funnels", { id: crypto.randomUUID(), name: $("#funnel-name").value.trim(), steps, createdAt: Date.now() });
    event.target.reset(); $("#funnel-steps").replaceChildren(); addStep();
    toast("Funil salvo."); await renderFunnels();
  };

  (async () => {
    db = await openDb();
    await renderAudios();
    await renderImages();
    addStep();
    await renderFunnels();
    renderActivity();
  })().catch((error) => toast(`Falha ao abrir a biblioteca: ${error.message}`, true));
})();
