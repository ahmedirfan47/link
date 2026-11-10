import { releasesRepo } from "@/lib/env";

/** The installer is uploaded to GitHub Releases under a fixed name, so "latest" always resolves. */
export const INSTALLER_NAME = "Link-Setup.exe";

export function installerUrl(): string {
  return `https://github.com/${releasesRepo()}/releases/latest/download/${INSTALLER_NAME}`;
}

export function releasesPage(): string {
  return `https://github.com/${releasesRepo()}/releases`;
}

/** Custom URL scheme the desktop app registers on install. */
export const DESKTOP_SCHEME = "link-app";