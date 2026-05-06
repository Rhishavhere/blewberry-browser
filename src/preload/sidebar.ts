import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

interface ChatRequest {
  message: string;
  context: {
    url: string | null;
    content: string | null;
    text: string | null;
  };
  messageId: string;
}

interface ChatResponse {
  messageId: string;
  content: string;
  isComplete: boolean;
}

type AgentStepAction =
  | { action: "see" }
  | { action: "new_tab"; url?: string }
  | { action: "navigate"; url: string }
  | { action: "click_xy"; x: number; y: number }
  | { action: "type"; text: string }
  | { action: "scroll"; deltaY: number }
  | { action: "wait"; ms: number }
  | { action: "done"; summary: string };

type AgentEventPayload =
  | { type: "log"; message: string }
  | {
      type: "step";
      step: number;
      action: AgentStepAction;
    }
  | { type: "conclusion"; text: string }
  | { type: "error"; message: string }
  | { type: "finished"; reason: string };

// Sidebar specific APIs
const sidebarAPI = {
  // Chat functionality
  sendChatMessage: (request: Partial<ChatRequest>) =>
    electronAPI.ipcRenderer.invoke("sidebar-chat-message", request),

  clearChat: () => electronAPI.ipcRenderer.invoke("sidebar-clear-chat"),

  getMessages: () => electronAPI.ipcRenderer.invoke("sidebar-get-messages"),

  onChatResponse: (callback: (data: ChatResponse) => void) => {
    electronAPI.ipcRenderer.on("chat-response", (_, data) => callback(data));
  },

  onMessagesUpdated: (callback: (messages: any[]) => void) => {
    electronAPI.ipcRenderer.on("chat-messages-updated", (_, messages) =>
      callback(messages)
    );
  },

  removeChatResponseListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-response");
  },

  removeMessagesUpdatedListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("chat-messages-updated");
  },

  // Page content access
  getPageContent: () => electronAPI.ipcRenderer.invoke("get-page-content"),
  getPageText: () => electronAPI.ipcRenderer.invoke("get-page-text"),
  getCurrentUrl: () => electronAPI.ipcRenderer.invoke("get-current-url"),

  // Tab information
  getActiveTabInfo: () => electronAPI.ipcRenderer.invoke("get-active-tab-info"),

  // Agent (v1): screenshot probe
  captureAgentActiveTabScreenshot: () =>
    electronAPI.ipcRenderer.invoke("agent-capture-active-tab"),

  agentStart: (goal: string, maxSteps?: number) =>
    electronAPI.ipcRenderer.invoke("agent-start", { goal, maxSteps }),

  agentStop: () => electronAPI.ipcRenderer.invoke("agent-stop"),

  onAgentEvent: (callback: (data: AgentEventPayload) => void) => {
    electronAPI.ipcRenderer.on("agent-event", (_, data) => callback(data));
  },

  removeAgentEventListener: () => {
    electronAPI.ipcRenderer.removeAllListeners("agent-event");
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("sidebarAPI", sidebarAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.sidebarAPI = sidebarAPI;
}
