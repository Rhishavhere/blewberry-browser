import { is } from "@electron-toolkit/utils";
import { join } from "path";
import { pathToFileURL } from "url";

/** Dev/prod URL for the in-tab home shell (search + AI hub). */
export function getHomePageUrl(): string {
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    const base = process.env["ELECTRON_RENDERER_URL"];
    return new URL("home/", base.endsWith("/") ? base : `${base}/`).href;
  }
  const filePath = join(__dirname, "../renderer/home/index.html");
  return pathToFileURL(filePath).href;
}

/** Same checks on main side for IPC that should only run from the home document. */
export function isHomePageUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("file:")) {
    return /home[/\\]index\.html/i.test(url);
  }
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/$/, "") || "/";
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      return p === "/home";
    }
    return false;
  } catch {
    return false;
  }
}
