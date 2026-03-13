const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const API_URL = IS_LOCAL ? 'http://localhost:3000' : 'https://verification-difference-doctor-tournament.trycloudflare.com';
const WS_URL = IS_LOCAL ? 'ws://localhost:3000' : 'wss://verification-difference-doctor-tournament.trycloudflare.com';

function getSession() {
  const raw = localStorage.getItem('study_user');
  const user = raw ? JSON.parse(raw) : null;
  if (!user?.id) {
    window.location.href = 'index.html';
    throw new Error('Missing study_user session');
  }

  const avatarMode = localStorage.getItem('study_avatar_mode') || 'discord';
  return {
    id: user.id,
    username: user.username || 'unknown',
    avatarUrl: user.avatar_url || null,
    avatarMode,
    displayName: avatarMode === 'anonymous' ? '同學' : (user.username || 'unknown'),
  };
}

export function createSpaRuntime() {
  const session = getSession();
  let ws = null;
  let reconnectTimer = null;
  let destroyed = false;
  let currentSceneName = '小鎮';
  const listeners = new Set();

  function notify(message) {
    listeners.forEach((fn) => {
      try { fn(message); } catch {}
    });
  }

  function send(message) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function sendAuth() {
    send({ type: 'auth', discord_id: session.id, scene: currentSceneName });
  }

  function connectWs() {
    if (destroyed) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      sendAuth();
    };

    ws.onmessage = (event) => {
      try {
        notify(JSON.parse(event.data));
      } catch {}
    };

    ws.onclose = () => {
      if (destroyed) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connectWs, 2500);
    };

    ws.onerror = () => {
      // onclose handles reconnects
    };
  }

  function setSceneName(sceneName) {
    currentSceneName = sceneName;
    sendAuth();
  }

  function leaveScene(sceneName) {
    send({ type: 'scene_leave', scene: sceneName || currentSceneName });
  }

  async function postJSON(path, body) {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await res.json().catch(() => ({}));
    } catch {
      return {};
    }
  }

  function addMessageListener(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function destroy() {
    destroyed = true;
    clearTimeout(reconnectTimer);
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    ws = null;
    listeners.clear();
  }

  connectWs();

  return {
    API_URL,
    WS_URL,
    session,
    send,
    setSceneName,
    leaveScene,
    addMessageListener,
    postJSON,
    connectWs,
    destroy,
  };
}
