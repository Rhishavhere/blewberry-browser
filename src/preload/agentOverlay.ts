import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const agentOverlayAPI = {
  stopAgent: () => electronAPI.ipcRenderer.invoke("agent-stop"),
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("agentOverlayAPI", agentOverlayAPI);
  } catch (e) {
    console.error(e);
  }
} else {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).agentOverlayAPI = agentOverlayAPI;
}
