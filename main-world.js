(() => {
  "use strict";
  if (window.__vozProntaProInstalled) return;
  window.__vozProntaProInstalled = true;

  const CHANNEL = "voz-pronta-extension";
  const jobs = new Map();
  const notify = (type, detail = {}) => window.postMessage({ channel: CHANNEL, type, ...detail }, "*");
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const waitForWpp = () => new Promise((resolve, reject) => {
    if (!window.WPP?.loader) return reject(new Error("Módulo do WhatsApp não carregado."));
    if (window.WPP.isReady) return resolve();
    try {
      if (!window.WPP.isInjected) window.WPP.loader.injectLoader();
      const timeout = window.setTimeout(() => reject(new Error("O WhatsApp ainda está carregando.")), 30000);
      window.WPP.loader.onReady(() => {
        window.clearTimeout(timeout);
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });

  const getActiveChat = () => {
    const chat = window.WPP.chat.getActiveChat();
    const id = chat?.id?.toString?.() || chat?.id?._serialized;
    if (!id) throw new Error("Abra uma conversa antes de continuar.");
    return { id, name: chat?.formattedTitle || chat?.name || chat?.contact?.formattedName || "Conversa" };
  };

  const sendVoice = async (chatId, audio) => {
    const file = new File([audio.bytes], `${audio.name || "audio"}.ogg`, { type: "audio/ogg; codecs=opus" });
    return window.WPP.chat.sendFileMessage(chatId, file, {
      type: "audio",
      isPtt: true,
      waveform: true,
      filename: file.name,
      mimetype: "audio/ogg; codecs=opus"
    });
  };

  const sendImage = async (chatId, image) => {
    const mimeType = image.mimeType || "image/jpeg";
    const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const file = new File([image.bytes], `${image.name || "imagem"}.${extension}`, { type: mimeType });
    return window.WPP.chat.sendFileMessage(chatId, file, {
      type: "image",
      filename: file.name,
      mimetype: mimeType
    });
  };

  const sendStep = (chatId, step) => {
    if (step.type === "text") return window.WPP.chat.sendTextMessage(chatId, step.text);
    if (step.type === "image") return sendImage(chatId, step);
    return sendVoice(chatId, step);
  };

  const errorText = (error) => {
    try { return typeof error === "string" ? error : error?.message || error?.name || JSON.stringify(error); }
    catch { return "Erro desconhecido"; }
  };

  const runFunnel = async (jobId, chat, steps) => {
    const job = { cancelled: false, chatId: chat.id };
    jobs.set(jobId, job);
    try {
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        const delayMs = Math.max(0, Math.min(Number(step.delayMs) || 0, 3600000));
        if (job.cancelled) throw new Error("Funil cancelado.");

        if (delayMs > 0) {
          if (step.type === "audio" || !step.type) {
            await window.WPP.chat.markIsRecording(chat.id, delayMs);
          } else {
            await window.WPP.chat.markIsComposing(chat.id, delayMs);
          }
          const endAt = Date.now() + delayMs;
          while (Date.now() < endAt) {
            if (job.cancelled) throw new Error("Funil cancelado.");
            notify("FUNNEL_PROGRESS", {
              jobId, chatName: chat.name, step: index + 1, total: steps.length,
              remainingSeconds: Math.max(0, Math.ceil((endAt - Date.now()) / 1000)),
              indicator: step.type === "audio" || !step.type ? "recording" : "typing"
            });
            await sleep(Math.min(1000, Math.max(0, endAt - Date.now())));
          }
        }

        if (job.cancelled) throw new Error("Funil cancelado.");
        await window.WPP.chat.markIsPaused(chat.id).catch(() => {});
        await sendStep(chat.id, step);
        notify("FUNNEL_STEP_SENT", { jobId, chatName: chat.name, step: index + 1, total: steps.length });
      }
      notify("FUNNEL_DONE", { jobId, chatName: chat.name });
    } catch (error) {
      await window.WPP.chat.markIsPaused(chat.id).catch(() => {});
      notify("FUNNEL_ERROR", { jobId, chatName: chat.name, message: errorText(error) });
    } finally {
      jobs.delete(jobId);
    }
  };

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.channel !== CHANNEL) return;
    const data = event.data;

    if (data.type === "CANCEL_FUNNEL") {
      const job = jobs.get(data.jobId);
      if (job) job.cancelled = true;
      return;
    }

    if (data.type !== "SEND_AUDIO" && data.type !== "SEND_IMAGE" && data.type !== "START_FUNNEL") return;
    try {
      await waitForWpp();
      const chat = getActiveChat();

      if (data.type === "SEND_AUDIO") {
        notify("SENDING", { name: data.audio?.name || "Áudio" });
        await sendVoice(chat.id, data.audio);
        notify("SENT", { chatName: chat.name });
        return;
      }

      if (data.type === "SEND_IMAGE") {
        notify("SENDING", { name: data.image?.name || "Imagem" });
        await sendImage(chat.id, data.image);
        notify("SENT", { chatName: chat.name, kind: "image" });
        return;
      }

      if (!Array.isArray(data.steps) || !data.steps.length) throw new Error("O funil não possui etapas.");
      notify("FUNNEL_STARTED", { jobId: data.jobId, chatName: chat.name, total: data.steps.length });
      void runFunnel(data.jobId, chat, data.steps);
    } catch (error) {
      notify(data.type === "START_FUNNEL" ? "FUNNEL_ERROR" : "ERROR", {
        jobId: data.jobId,
        message: errorText(error)
      });
    }
  });
})();
