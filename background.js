chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith("https://web.whatsapp.com/")) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "VOZ_PRONTA_TOGGLE" });
  } catch {
    // Permite usar a extensão logo após instalá-la, sem recarregar o WhatsApp.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["vendor/wppconnect-wa.js", "main-world.js"],
      world: "MAIN",
      injectImmediately: true
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "VOZ_PRONTA_TOGGLE" });
  }
});
