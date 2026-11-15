import { findCaptionRegion, inMeeting, readBlocks } from "./captions";
import type { CaptionsMessage, LinkMessage } from "./messages";

/**
 * Runs on meet.google.com. Watches Meet's own captions (shown only to you,
 * after you turn them on) and passes the latest lines to Link's side panel.
 * Nothing is stored and no audio is touched.
 */

let last = "";
let timer: number | undefined;

function snapshot(): CaptionsMessage {
  const region = findCaptionRegion();
  return {
    type: "link-captions",
    captionsOn: Boolean(region),
    inCall: inMeeting(),
    blocks: region ? readBlocks(region) : [],
  };
}

function send(force = false) {
  const message = snapshot();
  const key = JSON.stringify([message.captionsOn, message.inCall, message.blocks]);
  if (!force && key === last) return;
  last = key;
  // The side panel may be closed; that is fine.
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

function schedule() {
  if (timer !== undefined) return;
  timer = window.setTimeout(() => {
    timer = undefined;
    send();
  }, 200);
}

new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, characterData: true });
// Status updates even when nothing changes (captions turned on or off).
window.setInterval(() => send(), 3000);

chrome.runtime.onMessage.addListener((message: LinkMessage, _sender, reply) => {
  if (message.type === "link-ping") reply(snapshot());
  return false;
});
