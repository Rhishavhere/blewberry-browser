declare global {
  interface Window {
    agentOverlayAPI?: {
      stopAgent: () => Promise<unknown>;
    };
  }
}
export {};
