globalThis.vozProntaOpusReady = new Promise((resolve, reject) => {
  globalThis.Module = {
    onRuntimeInitialized: resolve,
    onAbort: (reason) => reject(new Error(`Falha ao carregar o codificador: ${reason}`))
  };
});
