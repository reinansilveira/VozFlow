type EncoderPage = { page: Uint8Array };

type OggOpusEncoder = {
  generateIdPage: () => EncoderPage;
  generateCommentPage: () => EncoderPage;
  encode: (channels: Float32Array[]) => EncoderPage[];
  encodeFinalFrame: () => EncoderPage[];
};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    vozProntaOpusReady?: Promise<void>;
    VozProntaOpus?: { OggOpusEncoder: new (options: Record<string, number | boolean>, module: unknown) => OggOpusEncoder; Module: unknown };
  }
}

export type EncodedAudio = { bytes: ArrayBuffer; duration: number };

const waitForEncoder = async (): Promise<void> => {
  if (!window.vozProntaOpusReady) throw new Error('O conversor de áudio não foi carregado. Recarregue a extensão.');
  await Promise.race([
    window.vozProntaOpusReady,
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('O conversor demorou para iniciar. Recarregue a extensão.')), 15_000)),
  ]);
};

const readDuration = async (file: File): Promise<number> => {
  const url = URL.createObjectURL(file);
  const audio = new Audio();
  try {
    return await new Promise<number>((resolve) => {
      const timeout = window.setTimeout(() => resolve(0), 5_000);
      audio.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      };
      audio.onerror = () => {
        window.clearTimeout(timeout);
        resolve(0);
      };
      audio.src = url;
    });
  } finally {
    audio.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
};

export const encodeOggOpus = async (file: File): Promise<EncodedAudio> => {
  const sourceBytes = await file.arrayBuffer();
  if (new TextDecoder().decode(sourceBytes.slice(0, 4)) === 'OggS') {
    return { bytes: sourceBytes, duration: await readDuration(file) };
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();

  try {
    const decoded = await context.decodeAudioData(sourceBytes.slice(0));
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const samples = decoded.getChannelData(channel);
      for (let index = 0; index < mono.length; index += 1) mono[index] += samples[index] / decoded.numberOfChannels;
    }

    await waitForEncoder();
    const Encoder = window.VozProntaOpus?.OggOpusEncoder;
    if (!Encoder || !window.VozProntaOpus?.Module) throw new Error('O conversor de áudio não foi carregado.');

    const encoder = new Encoder({
      originalSampleRate: decoded.sampleRate,
      encoderSampleRate: 48_000,
      numberOfChannels: 1,
      encoderApplication: 2_048,
      encoderFrameSize: 20,
      encoderBitRate: 24_000,
      encoderComplexity: 6,
      maxFramesPerPage: 40,
      resampleQuality: 3,
      streamPages: false,
    }, window.VozProntaOpus.Module);
    const pages = [encoder.generateIdPage(), encoder.generateCommentPage()];
    for (let offset = 0; offset < mono.length; offset += 4_096) pages.push(...encoder.encode([mono.subarray(offset, offset + 4_096)]));
    pages.push(...encoder.encodeFinalFrame());

    const validPages = pages.filter(Boolean).map((item) => item.page);
    const length = validPages.reduce((total, page) => total + page.length, 0);
    const output = new Uint8Array(length);
    let outputOffset = 0;
    validPages.forEach((page) => { output.set(page, outputOffset); outputOffset += page.length; });
    if (output.length < 64 || new TextDecoder().decode(output.slice(0, 4)) !== 'OggS') throw new Error('Não foi possível converter o áudio.');
    return { bytes: output.buffer, duration: decoded.duration };
  } finally {
    await context.close();
  }
};
