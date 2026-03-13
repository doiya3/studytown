const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const API_URL = IS_LOCAL ? 'http://localhost:3000' : 'https://verification-difference-doctor-tournament.trycloudflare.com';
const WS_URL = IS_LOCAL ? 'ws://localhost:3000' : 'wss://verification-difference-doctor-tournament.trycloudflare.com';

const TILE = 48;
const COLS = 16;
const ROWS = 12;

const COLORS = {
  floor: 0x3d6050,
  floor2: 0x33503e,
  shelf: 0x4a3728,
  shelfBook: 0x8b5e3c,
  desk: 0x5c4a3a,
  chair: 0x7c6a5a,
  window: 0x6ca0dc,
  carpet: 0x3d5a4a,
  door: 0x8b7355,
  playerSelf: 0x30c878,
  playerOther: 0x7c8cf8,
  playerAnon: 0x4a5568,
};

const SEATS = [
  { id: 1, x: 4, y: 5 },
  { id: 2, x: 6, y: 5 },
  { id: 3, x: 8, y: 5 },
  { id: 4, x: 10, y: 5 },
  { id: 5, x: 4, y: 8 },
  { id: 6, x: 6, y: 8 },
  { id: 7, x: 8, y: 8 },
  { id: 8, x: 10, y: 8 },
];

function buildBlockedTiles() {
  const blocked = new Set();
  const blockRect = (x, y, w, h) => {
    for (let i = x; i < x + w; i++) {
      for (let j = y; j < y + h; j++) {
        blocked.add(`${i},${j}`);
      }
    }
  };

  blockRect(1, 1, 14, 2);
  blockRect(1, 1, 1, 9);
  blockRect(14, 1, 1, 9);
  blockRect(0, 0, COLS, 1);
  blockRect(0, 0, 1, ROWS);
  blockRect(COLS - 1, 0, 1, ROWS);

  for (let x = 0; x < COLS; x++) {
    if (x < 7 || x > 8) blocked.add(`${x},${ROWS - 1}`);
  }

  for (const seat of SEATS) {
    blocked.add(`${seat.x},${seat.y - 1}`);
  }

  return blocked;
}

const BLOCKED = buildBlockedTiles();

function isBlocked(gx, gy) {
  return BLOCKED.has(`${gx},${gy}`) || gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS;
}

async function postJSON(path, body) {
  try {
    await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Intentionally swallow network errors during scene transition/reconnect.
  }
}

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

let ws = null;
let isExiting = false;

class LibraryScene extends Phaser.Scene {
  constructor(runtime) {
    super('LibraryScene');
    this.runtime = runtime;
    this.player = null;
    this.playerLabel = null;
    this.playerGx = 8;
    this.playerGy = 10;
    this.otherPlayers = {};
    this.otherTargets = {};
    this.otherGrids = {};
    this.playerLabels = {};
    this.moveTarget = null;
    this.moveTimer = 0;
    this.moveDelay = 140;
    this.syncTimer = 0;
    this.nearSeat = null;
    this.nearDoor = false;
    this.seated = false;
    this.currentSeat = null;
  }

  create() {
    this.graphics = this.add.graphics();
    this.drawMap();

    this.player = this.add.graphics();
    this.drawPlayer(this.player, COLORS.playerSelf);
    this.playerLabel = this.add.text(0, 0, this.runtime.displayName, {
      fontSize: '10px',
      fontFamily: 'Noto Sans TC',
      color: '#e6edf3',
      stroke: '#0d1117',
      strokeThickness: 3,
    }).setOrigin(0.5, 1);

    this.updatePlayerPos();

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
    });

    this.input.on('pointerdown', (pointer) => {
      if (this.seated) return;
      const gx = Math.floor(pointer.x / TILE);
      const gy = Math.floor(pointer.y / TILE);
      if (!isBlocked(gx, gy)) this.moveTarget = { x: gx, y: gy };
    });

    this.loadOtherPlayers();
    this.updateServerState('browsing', null);
    this.pushLocation();
    this.connectWebSocket();
    this.startOverlayRefresh();
  }

  startOverlayRefresh() {
    this.refreshOverlay();
    this.overlayTimer = window.setInterval(() => this.refreshOverlay(), 5000);
  }

  async refreshOverlay() {
    const zoneCountEl = document.getElementById('zone-count');
    if (!zoneCountEl) return;
    try {
      const res = await fetch(`${API_URL}/api/users/scene/圖書館`);
      const users = await res.json();
      const count = Array.isArray(users) ? users.length : 1;
      zoneCountEl.textContent = `· ${count} 人`;
    } catch {
      zoneCountEl.textContent = '· -- 人';
    }
  }

  drawMap() {
    const g = this.graphics;

    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        g.fillStyle((x + y) % 2 === 0 ? COLORS.floor : COLORS.floor2, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    g.fillStyle(COLORS.carpet, 1);
    for (let x = 3; x < 13; x++) {
      for (let y = 3; y < 10; y++) {
        g.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
      }
    }

    for (let x = 1; x < 15; x++) {
      g.fillStyle(COLORS.shelf, 1);
      g.fillRect(x * TILE, TILE, TILE, TILE * 2);
      for (let b = 0; b < 3; b++) {
        g.fillStyle(0x6b4226 + b * 0x111111, 1);
        g.fillRect(x * TILE + b * 14 + 2, TILE + 4, 10, TILE * 2 - 8);
      }
    }

    for (let y = 1; y < 10; y++) {
      g.fillStyle(COLORS.shelf, 1);
      g.fillRect(TILE, y * TILE, TILE, TILE);
      g.fillRect(14 * TILE, y * TILE, TILE, TILE);
      g.fillStyle(COLORS.shelfBook, 1);
      g.fillRect(TILE + 4, y * TILE + 4, 8, TILE - 8);
      g.fillRect(14 * TILE + 4, y * TILE + 4, 8, TILE - 8);
    }

    for (const seat of SEATS) {
      g.fillStyle(COLORS.desk, 1);
      g.fillRect(seat.x * TILE + 2, (seat.y - 1) * TILE + 2, TILE - 4, TILE - 4);
      g.fillStyle(COLORS.chair, 1);
      g.fillRect(seat.x * TILE + 6, seat.y * TILE + 6, TILE - 12, TILE - 12);
    }

    g.fillStyle(COLORS.window, 1);
    g.fillRect(6 * TILE + 4, 4, TILE * 2 - 8, 8);
    g.fillRect(10 * TILE + 4, 4, TILE * 2 - 8, 8);

    g.fillStyle(COLORS.door, 1);
    g.fillRect(7 * TILE + 4, 11 * TILE, TILE * 2 - 8, TILE);

    g.lineStyle(1, 0xffffff, 0.03);
    for (let x = 0; x <= COLS; x++) g.lineBetween(x * TILE, 0, x * TILE, TILE * ROWS);
    for (let y = 0; y <= ROWS; y++) g.lineBetween(0, y * TILE, TILE * COLS, y * TILE);
  }

  drawPlayer(g, color) {
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(TILE / 2, TILE - 6, TILE - 10, 8);
    g.fillStyle(color, 0.9);
    g.fillCircle(TILE / 2, TILE / 2 - 2, 14);
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(TILE / 2 - 4, TILE / 2 - 6, 5);
  }

  updatePlayerPos() {
    const px = this.playerGx * TILE;
    const py = this.playerGy * TILE;
    this.player.setPosition(px, py);
    this.playerLabel.setPosition(px + TILE / 2, py - 2);
  }

  update(_time, delta) {
    Object.entries(this.otherTargets).forEach(([id, target]) => {
      const sprite = this.otherPlayers[id];
      if (!sprite) return;
      sprite.x += (target.x - sprite.x) * 0.3;
      sprite.y += (target.y - sprite.y) * 0.3;
      const label = this.playerLabels[id];
      if (label) {
        label.x += (target.x + TILE / 2 - label.x) * 0.3;
        label.y += (target.y - 2 - label.y) * 0.3;
      }
    });

    if (!this.seated) this.handleMovement(delta);

    if (Phaser.Input.Keyboard.JustDown(this.wasd.interact)) this.tryInteract();
    this.checkNearbyInteractable();

    this.syncTimer += delta;
    if (this.syncTimer > 5000) {
      this.syncTimer = 0;
      this.pushLocation();
      this.sendMove();
    }
  }

  handleMovement(delta) {
    this.moveTimer += delta;
    if (this.moveTimer < this.moveDelay) return;

    let nx = this.playerGx;
    let ny = this.playerGy;
    let moved = false;

    if (this.cursors.left.isDown || this.wasd.left.isDown) { nx--; moved = true; }
    else if (this.cursors.right.isDown || this.wasd.right.isDown) { nx++; moved = true; }
    else if (this.cursors.up.isDown || this.wasd.up.isDown) { ny--; moved = true; }
    else if (this.cursors.down.isDown || this.wasd.down.isDown) { ny++; moved = true; }

    if (!moved && this.moveTarget) {
      const dx = this.moveTarget.x - this.playerGx;
      const dy = this.moveTarget.y - this.playerGy;
      if (Math.abs(dx) || Math.abs(dy)) {
        if (Math.abs(dx) >= Math.abs(dy)) nx += Math.sign(dx);
        else ny += Math.sign(dy);
        moved = true;
      }
      if (nx === this.moveTarget.x && ny === this.moveTarget.y) this.moveTarget = null;
    }

    if (!moved) return;

    const blockedByPlayer = Object.values(this.otherGrids).some(g => g.x === nx && g.y === ny);
    if (!isBlocked(nx, ny) && !blockedByPlayer) {
      this.playerGx = nx;
      this.playerGy = ny;
      this.updatePlayerPos();
      this.sendMove();
      this.pushLocation();
    }

    this.moveTimer = 0;
  }

  checkNearbyInteractable() {
    const hint = document.getElementById('interaction-hint');
    if (!hint) return;

    this.nearDoor = this.playerGy >= 10 && this.playerGx >= 7 && this.playerGx <= 9;
    if (this.nearDoor) {
      hint.textContent = '按 E 返回小鎮';
      hint.style.display = 'block';
      this.nearSeat = null;
      return;
    }

    this.nearSeat = null;
    for (const seat of SEATS) {
      if (Math.abs(this.playerGx - seat.x) <= 1 && Math.abs(this.playerGy - seat.y) <= 1) {
        this.nearSeat = seat;
        break;
      }
    }

    if (this.nearSeat && !this.seated) {
      hint.textContent = `按 E 坐下來讀書（座位 #${this.nearSeat.id}）`;
      hint.style.display = 'block';
      return;
    }

    hint.style.display = 'none';
  }

  async tryInteract() {
    if (this.nearDoor) {
      await postJSON('/api/users/clear-location', { discord_id: this.runtime.id });
      window.location.href = 'index.html';
      return;
    }

    if (!this.nearSeat) return;

    if (!this.seated) {
      this.seated = true;
      this.currentSeat = this.nearSeat;
      this.playerGx = this.nearSeat.x;
      this.playerGy = this.nearSeat.y;
      this.updatePlayerPos();
      await this.updateServerState('studying', this.currentSeat.id);
      await postJSON('/api/study/start', { discord_id: this.runtime.id, zone: '圖書館', seat_id: this.currentSeat.id });
    } else {
      this.seated = false;
      this.currentSeat = null;
      await this.updateServerState('browsing', null);
      await postJSON('/api/study/end', { discord_id: this.runtime.id, zone: '圖書館' });
    }

    this.sendMove();
  }

  async updateServerState(status, seatId) {
    await postJSON('/api/users/status', {
      discord_id: this.runtime.id,
      status,
      current_zone: '圖書館',
      seat_id: seatId,
      avatar_mode: this.runtime.avatarMode,
    });
  }

  async pushLocation() {
    await postJSON('/api/users/location', {
      discord_id: this.runtime.id,
      map_x: this.playerGx,
      map_y: this.playerGy,
      map_scene: '圖書館',
    });
  }

  sendMove() {
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'move',
      x: this.playerGx,
      y: this.playerGy,
      username: this.runtime.displayName,
      avatar_url: this.runtime.avatarMode === 'discord' ? this.runtime.avatarUrl : null,
    }));
  }

  connectWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', discord_id: this.runtime.id, scene: '圖書館' }));
      this.sendMove();
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'player_move') this.onPlayerMove(msg);
      if (msg.type === 'player_leave') this.onPlayerLeave(msg.discord_id);
    };

    ws.onclose = () => {
      if (isExiting) return;
      window.setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  async loadOtherPlayers() {
    try {
      const res = await fetch(`${API_URL}/api/users/scene/圖書館`);
      const users = await res.json();
      if (!Array.isArray(users)) return;
      users.forEach((user) => {
        if (user.discord_id === this.runtime.id) return;
        this.onPlayerMove({
          discord_id: user.discord_id,
          username: user.avatar_mode === 'anonymous' ? '同學' : (user.username || '未知玩家'),
          x: Number.isInteger(user.map_x) ? user.map_x : 8,
          y: Number.isInteger(user.map_y) ? user.map_y : 10,
          avatar_url: user.avatar_mode === 'anonymous' ? null : null,
        });
      });
      this.refreshOverlay();
    } catch {
      // ignore
    }
  }

  onPlayerMove({ discord_id, username, x, y }) {
    if (!discord_id || discord_id === this.runtime.id) return;

    const gx = Number.isInteger(x) ? x : 8;
    const gy = Number.isInteger(y) ? y : 10;

    if (!this.otherPlayers[discord_id]) {
      const g = this.add.graphics();
      this.drawPlayer(g, COLORS.playerOther);
      g.setPosition(gx * TILE, gy * TILE);
      this.otherPlayers[discord_id] = g;

      this.playerLabels[discord_id] = this.add.text(gx * TILE + TILE / 2, gy * TILE - 2, username || '玩家', {
        fontSize: '10px',
        fontFamily: 'Noto Sans TC',
        color: '#ffffff',
        stroke: '#0d1117',
        strokeThickness: 3,
      }).setOrigin(0.5, 1);
    }

    this.otherTargets[discord_id] = { x: gx * TILE, y: gy * TILE };
    this.otherGrids[discord_id] = { x: gx, y: gy };
    this.playerLabels[discord_id]?.setText(username || '玩家');
  }

  onPlayerLeave(discord_id) {
    if (!this.otherPlayers[discord_id]) return;
    this.otherPlayers[discord_id].destroy();
    this.playerLabels[discord_id]?.destroy();
    delete this.otherPlayers[discord_id];
    delete this.otherTargets[discord_id];
    delete this.otherGrids[discord_id];
    delete this.playerLabels[discord_id];
    this.refreshOverlay();
  }
}

function bindOverlayEvents(runtime) {
  const profileName = document.querySelector('.p-name');
  const profileLevel = document.querySelector('.p-level');
  const avatar = document.querySelector('.p-avatar');
  const logoutBtn = document.querySelector('.p-logout');

  if (profileName) profileName.textContent = runtime.displayName;
  if (profileLevel) profileLevel.textContent = 'Lv.-- · -- XP';
  if (avatar) {
    if (runtime.avatarMode === 'discord' && runtime.avatarUrl) {
      avatar.style.backgroundImage = `url(${runtime.avatarUrl})`;
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
    } else {
      avatar.textContent = '？';
      avatar.style.display = 'flex';
      avatar.style.alignItems = 'center';
      avatar.style.justifyContent = 'center';
      avatar.style.color = '#8b949e';
      avatar.style.fontFamily = 'DotGothic16, monospace';
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('study_user');
      localStorage.removeItem('study_avatar_mode');
      window.location.href = 'index.html';
    });
  }
}

export function bootLibraryApp() {
  const runtime = getSession();
  bindOverlayEvents(runtime);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#0d1117',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new LibraryScene(runtime)],
    pixelArt: true,
    antialias: false,
  });

  window.doInteract = () => {
    const scene = game.scene.getScene('LibraryScene');
    if (scene?.tryInteract) scene.tryInteract();
  };

  window.addEventListener('beforeunload', () => {
    isExiting = true;
    if (ws?.readyState === WebSocket.OPEN) ws.close();
    navigator.sendBeacon(
      `${API_URL}/api/users/clear-location`,
      new Blob([JSON.stringify({ discord_id: runtime.id })], { type: 'application/json' }),
    );
  });

  return game;
}
