"use client";

import { PocketIcon } from "@/components/icons";

const WIDTH = 380;
const HEIGHT = 580;

interface DocumentPip {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}

/**
 * Opens the pack's Pocket window. In Chrome and Edge it floats on top of every
 * other window (Document Picture-in-Picture), so it stays visible over a video
 * call. Other browsers get a small popup window instead.
 */
export function PocketButton({ packId }: { packId: string }) {
  async function open() {
    const url = `/pocket/${packId}`;
    const pip = (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;

    if (pip) {
      try {
        pip.window?.close();
        const win = await pip.requestWindow({ width: WIDTH, height: HEIGHT });
        win.document.title = "Link Pocket";
        const style = win.document.createElement("style");
        style.textContent = "html,body{margin:0;height:100%;overflow:hidden;background:#f2f2f1}iframe{border:0;width:100%;height:100%;display:block}";
        win.document.head.append(style);
        const frame = win.document.createElement("iframe");
        frame.src = url;
        frame.title = "Link Pocket";
        // Pocket listens to the microphone or a shared call tab when the user asks it to.
        frame.allow = "microphone; display-capture";
        win.document.body.append(frame);
        return;
      } catch {
        /* fall back to a popup window below */
      }
    }

    const left = Math.max(0, window.screenX + window.outerWidth - WIDTH - 24);
    const top = Math.max(0, window.screenY + 80);
    window.open(url, "link-pocket", `popup,width=${WIDTH},height=${HEIGHT},left=${left},top=${top}`);
  }

  return (
    <button type="button" className="btn-line" onClick={() => void open()} title="A small window that stays on top">
      <PocketIcon className="h-3.5 w-3.5" />
      Pocket
    </button>
  );
}
