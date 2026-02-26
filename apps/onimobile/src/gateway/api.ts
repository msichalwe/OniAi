/**
 * Gateway API — HTTP client for communicating with the OniOS server.
 * The mobile app connects to the same server as the desktop Electron app.
 */

import useGatewayStore from '../stores/gatewayStore';

function getBaseUrl(): string {
  return useGatewayStore.getState().gatewayUrl;
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = getBaseUrl();
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

// ─── Status & Config ─────────────────────────────────

export async function getStatus() {
  return request('/api/oni/status');
}

export async function getConfig() {
  return request('/api/oni/config');
}

export async function saveConfig(config: Record<string, any>) {
  return request('/api/oni/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function testConnection(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/oni/status`, {
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Skills ──────────────────────────────────────────

export async function getSkills() {
  return request('/api/oni/skills');
}

export async function installSkills() {
  return request('/api/oni/install-skills', { method: 'POST' });
}

// ─── Chat ────────────────────────────────────────────

export async function sendChatMessage(
  message: string,
  sessionId?: string,
): Promise<{ text: string; model?: string; sections?: any[] }> {
  return request('/api/oni/chat', {
    method: 'POST',
    body: JSON.stringify({ message, sessionId }),
  });
}

// ─── Actions ─────────────────────────────────────────

export async function executeAction(
  action: string,
  body: Record<string, any>,
) {
  return request(`/api/oni/actions/${action}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ─── Terminal ────────────────────────────────────────

export async function runTerminalCommand(command: string) {
  return executeAction('terminal', { action: 'run', command });
}

// ─── Files ───────────────────────────────────────────

export async function listFiles(dirPath?: string) {
  return request(`/api/files/list${dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''}`);
}

export async function readFile(filePath: string) {
  return request(`/api/files/read?path=${encodeURIComponent(filePath)}`);
}
