/**
 * Browser audio for the Pocket window: turns a call tab's sound into 16 kHz,
 * 16-bit mono PCM and streams it to AssemblyAI for live transcription.
 * Same approach as the desktop app's live engine.
 */

export const SAMPLE_RATE = 16_000;
const CHUNK_SAMPLES = 1_600; // 100 ms at 16 kHz

// Runs on the audio thread. Kept as a string so no extra build step is needed.
const WORKLET_SOURCE = `
class PcmWriter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(${CHUNK_SAMPLES});
    this.length = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        const s = Math.max(-1, Math.min(1, channel[i]));
        this.buffer[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.length === this.buffer.length) {
          this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
          this.buffer = new Int16Array(${CHUNK_SAMPLES});
          this.length = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-writer", PcmWriter);
`;

export interface SttToken {
  token: string;
  speechModel: string;
  url: string;
  sampleRate: number;
}

/**
 * Asks the user to pick the browser tab of their call and share its audio.
 * Chrome requires video in the request; the video track is dropped at once.
 */
export async function captureCallTab(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    // Chrome-only hints: offer tabs first, keep the tab's sound playing for the user.
    preferCurrentTab: false,
    selfBrowserSurface: "exclude",
    systemAudio: "include",
  } as DisplayMediaStreamOptions);
  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }
  if (stream.getAudioTracks().length === 0) {
    throw new Error("No sound was shared. Pick the call's tab and turn on “Share tab audio”.");
  }
  return stream;
}

export interface LiveTranscriber {
  stop(): void;
}

/**
 * Streams `stream` to AssemblyAI. `onText` gets the running text of the current
 * turn (partial) and each finished turn (final). `onEnd` fires if the stream
 * or the connection stops on its own.
 */
export async function startTranscriber(
  stream: MediaStream,
  token: SttToken,
  keyterms: string[],
  onText: (text: string, final: boolean) => void,
  onEnd: (reason: string) => void,
): Promise<LiveTranscriber> {
  const params = new URLSearchParams({
    token: token.token,
    sample_rate: String(token.sampleRate),
    encoding: "pcm_s16le",
    speech_model: token.speechModel,
  });
  const waitForFormatted = token.speechModel.startsWith("universal-streaming");
  if (waitForFormatted) params.set("format_turns", "true");
  const terms = [...new Set(keyterms.map((k) => k.trim()).filter((k) => k.length > 1 && k.length <= 50))].slice(0, 100);
  if (terms.length > 0) params.set("keyterms_prompt", JSON.stringify(terms));

  const socket = new WebSocket(`${token.url}?${params.toString()}`);
  socket.binaryType = "arraybuffer";
  let closing = false;
  let lastFinal = -1;

  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error("Could not connect to live transcription."));
  });

  socket.onmessage = (event: MessageEvent<string>) => {
    let msg: { type?: string; error?: string; turn_order?: number; end_of_turn?: boolean; turn_is_formatted?: boolean; transcript?: string };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === "Error" && msg.error) {
      onEnd(msg.error);
      return;
    }
    if (msg.type !== "Turn" || typeof msg.turn_order !== "number") return;
    if (msg.turn_order <= lastFinal) return;
    const isFinal = Boolean(msg.end_of_turn) && (!waitForFormatted || msg.turn_is_formatted === true);
    const text = (msg.transcript ?? "").trim();
    if (isFinal) lastFinal = msg.turn_order;
    if (text) onText(text, isFinal);
  };
  socket.onclose = (event) => {
    if (!closing) onEnd(event.reason || "Live transcription stopped.");
  };

  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  const workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
  try {
    await context.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }
  const source = context.createMediaStreamSource(stream);
  const writer = new AudioWorkletNode(context, "pcm-writer");
  writer.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(event.data);
  };
  // The graph must reach the output to keep running, so route it through silence.
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(writer).connect(mute).connect(context.destination);

  // The user pressed Chrome's "Stop sharing".
  const track = stream.getAudioTracks()[0];
  const onTrackEnded = () => onEnd("Sharing stopped.");
  track?.addEventListener("ended", onTrackEnded);

  return {
    stop() {
      closing = true;
      track?.removeEventListener("ended", onTrackEnded);
      writer.port.onmessage = null;
      source.disconnect();
      writer.disconnect();
      mute.disconnect();
      void context.close();
      stream.getTracks().forEach((t) => t.stop());
      try {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "Terminate" }));
      } catch {
        /* ignore */
      }
      setTimeout(() => socket.close(1000), 800);
    },
  };
}
