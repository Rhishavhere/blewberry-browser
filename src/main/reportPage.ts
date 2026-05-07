import { is } from "@electron-toolkit/utils";
import { join } from "path";
import { pathToFileURL } from "url";

export function getReportViewerPageUrl(reportId: string): string {
  const q = `id=${encodeURIComponent(reportId)}`;
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    const base = process.env["ELECTRON_RENDERER_URL"];
    const normalized = base.endsWith("/") ? base : `${base}/`;
    return new URL(`report/?${q}`, normalized).href;
  }
  const filePath = join(__dirname, "../renderer/report/index.html");
  return `${pathToFileURL(filePath).href}?${q}`;
}

export function isReportPageUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("file:")) {
    return /report[/\\]index\.html/i.test(url);
  }
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/$/, "") || "/";
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      return p === "/report" || p.endsWith("/report");
    }
    return false;
  } catch {
    return false;
  }
}
