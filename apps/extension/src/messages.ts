/** Messages between the Meet content script and the side panel. */

export interface CaptionBlock {
  /** Speaker name as Meet shows it ("You" for yourself). */
  speaker: string;
  text: string;
}

export interface CaptionsMessage {
  type: "link-captions";
  /** False when Meet's captions are off or the caption area cannot be found. */
  captionsOn: boolean;
  inCall: boolean;
  /** The latest caption blocks, oldest first. */
  blocks: CaptionBlock[];
}

export interface PingMessage {
  type: "link-ping";
}

export type LinkMessage = CaptionsMessage | PingMessage;
