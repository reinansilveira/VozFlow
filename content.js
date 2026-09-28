(() => {
  "use strict";
  if (window.__vozProntaUiInstalled) return;
  window.__vozProntaUiInstalled = true;

  const CHANNEL = "voz-pronta-extension";
  const extensionOrigin = new URL(chrome.runtime.getURL("/")).origin;
  const root = document.createElement("div");
  root.id = "vp-shell";
  root.className = "vp-shell--closed";
  root.innerHTML = `
    <button class="vp-shell__fab" aria-label="Abrir Voz Pronta" title="Voz Pronta">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14.5a4.5 4.5 0 0 0 4.5-4.5V5a4.5 4.5 0 1 0-9 0v5a4.5 4.5 0 0 0 4.5 4.5Zm7-4.5a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.08A7 7 0 0 0 19 10Z"/></svg>
    </button>
    <iframe class="vp-shell__panel" title="Voz Pronta" allow="autoplay"></iframe>`;
  document.documentElement.appendChild(root);

  const iframe = root.querySelector("iframe");
  iframe.src = chrome.runtime.getURL("panel.html");

  const toggle = (force) => {
    const open = force ?? root.classList.contains("vp-shell--closed");
    root.classList.toggle("vp-shell--closed", !open);
  };

  root.querySelector("button").addEventListener("click", () => toggle(true));

  window.addEventListener("message", (event) => {
    if (event.source === iframe.contentWindow && event.origin === extensionOrigin) {
      if (event.data?.source !== "voz-pronta-panel") return;
      if (event.data.type === "CLOSE_PANEL") {
        toggle(false);
        return;
      }
      window.postMessage({ channel: CHANNEL, ...event.data.payload }, "*");
      return;
    }

    if (event.source === window && event.data?.channel === CHANNEL) {
      iframe.contentWindow?.postMessage({ source: "voz-pronta-page", payload: event.data }, extensionOrigin);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "VOZ_PRONTA_TOGGLE") toggle();
  });
})();
