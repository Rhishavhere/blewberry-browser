import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

function isHomePage(): boolean {
  try {
    const h = window.location.href;
    if (h.startsWith("file:"))
      return /home[/\\]index\.html/i.test(h);
    const u = new URL(h);
    const p = u.pathname.replace(/\/+$/, "") || "/";
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      return p === "/home";
    }
    return false;
  } catch {
    return false;
  }
}

const homeAPI = {
  navigateFromSearch: (url: string) => {
    if (!isHomePage()) return Promise.resolve(false);
    return ipcRenderer.invoke("home-navigate", url) as Promise<boolean>;
  },
  openSidebarWithChat: (request: { message: string; messageId: string }) => {
    if (!isHomePage()) return Promise.resolve(false);
    return ipcRenderer.invoke(
      "home-open-sidebar-with-chat",
      request
    ) as Promise<boolean>;
  },
  toggleSidebar: () => ipcRenderer.invoke("toggle-sidebar"),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("homeAPI", homeAPI);
  } catch (error) {
    console.error(error);
  }
}
