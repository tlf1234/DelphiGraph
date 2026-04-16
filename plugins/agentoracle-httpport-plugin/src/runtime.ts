import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setHttpPortRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getHttpPortRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("HTTP Port runtime not initialized");
  }
  return runtime;
}

// ── Gateway-ready gate ─────────────────────────────────────────────────────
// startAccount (gateway-only) calls notifyGatewayReady().
// index.ts defers daemon / reporter via onGatewayReady().
// Fallback: if startAccount doesn't fire within READY_TIMEOUT_MS, start anyway.
const READY_TIMEOUT_MS = 15_000;
type StartCallback = () => void;
let _onReady: StartCallback | null = null;
let _readyTimer: ReturnType<typeof setTimeout> | null = null;

export function onGatewayReady(cb: StartCallback) {
  _onReady = cb;
  // Fallback: start after timeout if channel never calls notifyGatewayReady
  if (_readyTimer) clearTimeout(_readyTimer);
  _readyTimer = setTimeout(() => {
    if (_onReady) {
      _onReady();
      _onReady = null;
    }
  }, READY_TIMEOUT_MS);
}

export function notifyGatewayReady() {
  if (_readyTimer) { clearTimeout(_readyTimer); _readyTimer = null; }
  if (_onReady) {
    _onReady();
    _onReady = null;
  }
}
