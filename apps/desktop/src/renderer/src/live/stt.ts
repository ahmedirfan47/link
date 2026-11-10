import type { SttToken } from "../../../shared/types";

/**
 * Streaming transcription over AssemblyAI's v3 WebSocket.
 * Each speaker (you / them) gets its own connection, so who-said-what is known.
 */

export interface TurnUpdate {
  text: string;
  final: boolean;
}

interface TurnMessage {
  type: "Turn";
  turn_order: number;
  end_of_turn: boolean;
  turn_is_formatted?: boolean;
  transcript: string;
  words?: { text: string }[];
}

interface ServerMessage {
  type: string;
  error?: string;
}

export interface SttStreamOptions {
  token: SttToken;
  keyterms: string[];
  onTurn: (update: TurnUpdate) => void;
  /** Connection dropped unexpectedly. */
  onDrop: (reason: string) => void;
}

export class SttStream {
  private socket: WebSocket | null = null;
  private closing = false;
  private lastFinalTurn = -1;
  /** universal-streaming models send a second, formatted final; wait for it. */
  private readonly waitForFormatted: boolean;

  constructor(private readonly options: SttStreamOptions) {
    this.waitForFormatted = options.token.speechModel.startsWith("universal-streaming");
  }

  connect(): Promise<void> {
    const { token, keyterms } = this.options;
    const params = new URLSearchParams({
      token: token.token,
      sample_rate: String(token.sampleRate),
      encoding: "pcm_s16le",
      speech_model: token.speechModel,
    });
    if (this.waitForFormatted) params.set("format_turns", "true");
    const terms = [...new Set(keyterms.map((k) => k.trim()).filter((k) => k.length > 1 && k.length <= 50))].slice(0, 100);
    if (terms.length > 0) params.set("keyterms_prompt", JSON.stringify(terms));

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${token.url}?${params.toString()}`);
      socket.binaryType = "arraybuffer";
      this.socket = socket;
      let opened = false;

      socket.onopen = () => {
        opened = true;
        resolve();
      };
      socket.onmessage = (event: MessageEvent<string>) => this.handle(event.data);
      socket.onerror = () => {
        if (!opened) reject(new Error("Could not connect to live transcription."));
      };
      socket.onclose = (event) => {
        this.socket = null;
        if (!opened) {
          reject(new Error(event.reason || "Live transcription refused the connection."));
          return;
        }
        if (!this.closing) this.options.onDrop(event.reason || `Connection closed (${event.code}).`);
      };
    });
  }

  private handle(raw: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    if (message.type === "Error" && message.error) {
      this.options.onDrop(message.error);
      return;
    }
    if (message.type !== "Turn") return;

    const turn = message as unknown as TurnMessage;
    if (turn.turn_order <= this.lastFinalTurn) return;

    const isFinal = turn.end_of_turn && (!this.waitForFormatted || turn.turn_is_formatted === true);
    if (isFinal) {
      this.lastFinalTurn = turn.turn_order;
      const text = turn.transcript.trim();
      if (text) this.options.onTurn({ text, final: true });
      return;
    }
    // Partial: include words that are not final yet, so matching starts sooner.
    const text = (turn.words?.length ? turn.words.map((w) => w.text).join(" ") : turn.transcript).trim();
    if (text) this.options.onTurn({ text, final: false });
  }

  send(pcm: ArrayBuffer): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(pcm);
  }

  close(): void {
    this.closing = true;
    const socket = this.socket;
    if (!socket) return;
    try {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "Terminate" }));
    } catch {
      // ignore
    }
    setTimeout(() => socket.close(1000), 800);
  }
}