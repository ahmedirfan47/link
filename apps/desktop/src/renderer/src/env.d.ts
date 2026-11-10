/// <reference types="vite/client" />
import type { LinkBridge } from "../../shared/types";

declare global {
  interface Window {
    link: LinkBridge;
  }
}

export {};