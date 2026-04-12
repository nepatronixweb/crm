/** Fired in this tab after app settings are saved (e.g. Front Desk statuses). */
export const APP_SETTINGS_CHANGED_EVENT = "etg:app-settings-changed";

const APP_SETTINGS_BROADCAST_NAME = "etg-app-settings";

export function notifyAppSettingsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_SETTINGS_CHANGED_EVENT));
  try {
    const bc = new BroadcastChannel(APP_SETTINGS_BROADCAST_NAME);
    bc.postMessage({ type: "refresh" });
    bc.close();
  } catch {
    /* ignore (private mode / unsupported) */
  }
}

/** Same-tab CustomEvent + cross-tab BroadcastChannel. */
export function subscribeAppSettingsChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onWin = () => handler();
  window.addEventListener(APP_SETTINGS_CHANGED_EVENT, onWin);
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(APP_SETTINGS_BROADCAST_NAME);
    bc.onmessage = () => handler();
  } catch {
    /* ignore */
  }
  return () => {
    window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, onWin);
    bc?.close();
  };
}
