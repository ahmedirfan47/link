/**
 * Audio capture: turns a MediaStream into 16 kHz, 16-bit mono PCM chunks
 * (100 ms each), which is what the transcription service expects.
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
    this.sumSquares = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        const s = Math.max(-1, Math.min(1, channel[i]));
        this.sumSquares += s * s;
        this.buffer[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.length === this.buffer.length) {
          const level = Math.sqrt(this.sumSquares / this.length);
          this.port.postMessage({ pcm: this.buffer.buffer, level }, [this.buffer.buffer]);
          this.buffer = new Int16Array(${CHUNK_SAMPLES});
          this.length = 0;
          this.sumSquares = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-writer", PcmWriter);
`;

export interface AudioPipe {
  stop(): void;
}

/** Streams PCM chunks from `stream` to `onChunk`. `level` is 0..1 loudness for the meter. */
export async function startPcmPipe(
  stream: MediaStream,
  onChunk: (pcm: ArrayBuffer, level: number) => void,
): Promise<AudioPipe> {
  // The browser resamples the input to 16 kHz for us.
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  const workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
  try {
    await context.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }

  const source = context.createMediaStreamSource(stream);
  const writer = new AudioWorkletNode(context, "pcm-writer");
  writer.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
    onChunk(event.data.pcm, event.data.level);
  };
  // The graph must reach the speakers to keep running, so route it through silence.
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(writer).connect(mute).connect(context.destination);

  return {
    stop() {
      writer.port.onmessage = null;
      source.disconnect();
      writer.disconnect();
      mute.disconnect();
      void context.close();
    },
  };
}

/** Your microphone, with echo cancellation and noise suppression. */
export async function getMicrophone(deviceId: string | null): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

/**
 * Everything the computer plays (Zoom, Meet, Teams, WhatsApp, Phone Link calls).
 * The main process answers this request with loopback audio; video is discarded.
 */
export async function getSystemAudio(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }
  if (stream.getAudioTracks().length === 0) {
    throw new Error("Could not capture the computer's sound.");
  }
  return stream;
}

export async function listMicrophones(): Promise<{ id: string; label: string }[]> {
  // Labels only appear after microphone permission has been granted once.
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput")
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}