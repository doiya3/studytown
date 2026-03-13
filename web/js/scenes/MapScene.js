const TILE = 48;
const COLS = 16;
const ROWS = 12;

const ENTRANCES = [
  { id: 'library', label: '圖書館', x: 4, y: 4, w: 3, h: 2, color: 0x30c878 },
  { id: 'cafe', label: '咖啡廳', x: 9, y: 4, w: 3, h: 2, color: 0xf5a623 },
  { id: 'night', label: '夜讀室', x: 2, y: 8, w: 3, h: 2, color: 0x7b84ff, locked: true },
  { id: 'grass', label: '草地', x: 6, y: 8, w: 3, h: 2, color: 0x6fcf7a, locked: true },
  { id: 'lake', label: '湖邊', x: 10, y: 8, w: 3, h: 2, color: 0x59a6ff, locked: true },
];

export class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene');
    this.runtime = null;
    this.graphics = null;
    this.player = null;
    this.playerLabel = null;
    this.playerGx = 8;
    this.playerGy = 10;
    this.moveTarget = null;
    this.moveTimer = 0;
    this.moveDelay = 140;
    this.syncTimer = 0;
    this.nearEntrance = null;
    this.otherPlayers = {};
    this.otherTargets = {};
    this.otherGrids = {};
    this.playerLabels = {};
    this.unsubscribeWs = null;
    this.overlayTimer = null;
  }

  init(data) {
    this.runtime = data.runtime;
  }

  create() {
<<<<<<< HEAD
    // 清空所有他人玩家殘影
    Object.values(this.otherPlayers).forEach(g => g.destroy && g.destroy());
    Object.values(this.playerLabels).forEach(l => l.destroy && l.destroy());
    this.otherPlayers = {};
    this.otherTargets = {};
    this.otherGrids = {};
    this.playerLabels = {};
=======
      // 清空所有他人玩家殘影
      Object.values(this.otherPlayers).forEach(g => g.destroy && g.destroy());
      Object.values(this.playerLabels).forEach(l => l.destroy && l.destroy());
      this.otherPlayers = {};
      this.otherTargets = {};
      this.otherGrids = {};
      this.playerLabels = {};
>>>>>>> 97bf9dd04a17cfeb1a83c5bc8fe4e2ee0db3788e
    this.graphics = this.add.graphics();
    this.drawMap();

    // 判斷是否從門口出生
    let startX = this.playerGx;
    let startY = this.playerGy;
    if (arguments[0] && arguments[0].spawnPoint === 'door') {
      startX = 8;
      startY = 10;
    }
    this.playerGx = startX;
    this.playerGy = startY;

    this.player = this.add.graphics();
    this.drawPlayer(this.player, 0x30c878);
    if (!this.runtime || !this.runtime.session) {
      console.error('找不到 session，請重新登入');
      window.location.href = 'index.html';
      return;
    }
    this.playerLabel = this.add.text(0, 0, this.runtime.session.displayName, {
      fontSize: '10px', fontFamily: 'Noto Sans TC', color: '#e6edf3', stroke: '#0d1117', strokeThickness: 3,
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
      const gx = Math.floor(pointer.x / TILE);
      const gy = Math.floor(pointer.y / TILE);
      if (this.isBlocked(gx, gy)) return;
      this.moveTarget = { x: gx, y: gy };
    });

    this.runtime.setSceneName('小鎮');
    this.runtime.connectWs();
    this.unsubscribeWs = this.runtime.addMessageListener((msg) => this.onWsMessage(msg));

    this.loadOtherPlayers();
    this.updateServerState();
    this.pushLocation();
    this.startOverlayRefresh();

    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());
  }

  cleanup() {
    if (this.unsubscribeWs) this.unsubscribeWs();
    this.unsubscribeWs = null;
    if (this.overlayTimer) clearInterval(this.overlayTimer);
    this.overlayTimer = null;
  }

  startOverlayRefresh() {
    this.refreshOverlay();
    this.overlayTimer = setInterval(() => this.refreshOverlay(), 5000);
  }

  async refreshOverlay() {
    const zoneCountEl = document.getElementById('zone-count');
    if (!zoneCountEl) return;
    try {
      const res = await fetch(`${this.runtime.API_URL}/api/users/scene/小鎮`);
      const users = await res.json();
      zoneCountEl.textContent = `· ${Array.isArray(users) ? users.length : 1} 人`;
    } catch {
      zoneCountEl.textContent = '· -- 人';
    }
  }

  drawMap() {
    const g = this.graphics;

    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        g.fillStyle((x + y) % 2 === 0 ? 0x2f3142 : 0x272a3a, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    g.fillStyle(0x1b1f2f, 1);
    g.fillRect(0, 0, TILE * COLS, TILE);
    g.fillRect(0, 0, TILE, TILE * ROWS);
    g.fillRect((COLS - 1) * TILE, 0, TILE, TILE * ROWS);
    g.fillRect(0, (ROWS - 1) * TILE, TILE * COLS, TILE);

    for (const e of ENTRANCES) {
      const alpha = e.locked ? 0.2 : 0.26;
      g.fillStyle(e.color, alpha);
      g.fillRoundedRect(e.x * TILE + 4, e.y * TILE + 4, e.w * TILE - 8, e.h * TILE - 8, 10);
      g.lineStyle(2, e.color, e.locked ? 0.35 : 0.85);
      g.strokeRoundedRect(e.x * TILE + 4, e.y * TILE + 4, e.w * TILE - 8, e.h * TILE - 8, 10);

      const label = `${e.locked ? '🔒 ' : ''}${e.label}`;
      this.add.text(e.x * TILE + (e.w * TILE) / 2, e.y * TILE + (e.h * TILE) / 2, label, {
        fontFamily: 'DotGothic16', fontSize: '13px', color: e.locked ? '#8892a4' : '#e6edf3',
      }).setOrigin(0.5);
    }
  }

  drawPlayer(g, color) {
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(TILE / 2, TILE - 6, TILE - 10, 8);
    g.fillStyle(color, 0.9);
    g.fillCircle(TILE / 2, TILE / 2 - 2, 14);
  }

  isBlocked(gx, gy) {
    return gx <= 0 || gy <= 0 || gx >= COLS - 1 || gy >= ROWS - 1;
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

    this.handleMovement(delta);
    if (Phaser.Input.Keyboard.JustDown(this.wasd.interact)) this.tryInteract();
    this.checkNearbyEntrance();

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

    if (moved) {
      const blockedByPlayer = Object.values(this.otherGrids).some((g) => g.x === nx && g.y === ny);
      if (!this.isBlocked(nx, ny) && !blockedByPlayer) {
        this.playerGx = nx;
        this.playerGy = ny;
        this.updatePlayerPos();
        this.sendMove();
        this.pushLocation();
      }
    }

    this.moveTimer = 0;
  }

  checkNearbyEntrance() {
    const hint = document.getElementById('interaction-hint');
    if (!hint) return;

    this.nearEntrance = null;
    for (const e of ENTRANCES) {
      const nearX = this.playerGx >= e.x - 1 && this.playerGx <= e.x + e.w;
      const nearY = this.playerGy >= e.y - 1 && this.playerGy <= e.y + e.h;
      if (nearX && nearY) {
        this.nearEntrance = e;
        break;
      }
    }

    if (!this.nearEntrance) {
      hint.style.display = 'none';
      return;
    }

    if (this.nearEntrance.locked) {
      hint.textContent = `${this.nearEntrance.label} 開發中`;
      hint.style.display = 'block';
      return;
    }

    hint.textContent = `按 E 進入${this.nearEntrance.label}`;
    hint.style.display = 'block';
  }

  async tryInteract() {
    if (!this.nearEntrance) return;
    if (this.nearEntrance.locked) {
      const hint = document.getElementById('interaction-hint');
      if (hint) hint.textContent = `${this.nearEntrance.label} 尚未開放`;
      return;
    }
    if (this.nearEntrance.id === 'library' || this.nearEntrance.id === 'cafe') {
      await window.switchSpaScene?.(this.nearEntrance.id);
    }
  }

  async updateServerState() {
    await this.runtime.postJSON('/api/users/status', {
      discord_id: this.runtime.session.id,
      status: 'browsing',
      current_zone: '小鎮',
      seat_id: null,
      avatar_mode: this.runtime.session.avatarMode,
    });
  }

  async pushLocation() {
    await this.runtime.postJSON('/api/users/location', {
      discord_id: this.runtime.session.id,
      map_x: this.playerGx,
      map_y: this.playerGy,
      map_scene: '小鎮',
    });
  }

  sendMove() {
    this.runtime.send({
      type: 'move',
      scene: '小鎮',
      x: this.playerGx,
      y: this.playerGy,
      username: this.runtime.session.displayName,
      avatar_url: this.runtime.session.avatarMode === 'discord' ? this.runtime.session.avatarUrl : null,
    });
  }

  onWsMessage(msg) {
    if (msg.type === 'player_move') {
      if (msg.scene && msg.scene !== '小鎮') return;
      this.onPlayerMove(msg);
    }
    if (msg.type === 'player_leave') this.onPlayerLeave(msg.discord_id);
  }

  async loadOtherPlayers() {
    try {
      const res = await fetch(`${this.runtime.API_URL}/api/users/scene/小鎮`);
      const users = await res.json();
      if (!Array.isArray(users)) return;
      users.forEach((user) => {
        if (user.discord_id === this.runtime.session.id) return;
        this.onPlayerMove({
          discord_id: user.discord_id,
          username: user.avatar_mode === 'anonymous' ? '同學' : (user.username || '未知玩家'),
          x: Number.isInteger(user.map_x) ? user.map_x : 8,
          y: Number.isInteger(user.map_y) ? user.map_y : 10,
        });
      });
    } catch {}
  }

  onPlayerMove({ discord_id, username, x, y }) {
    if (!discord_id || discord_id === this.runtime.session.id) return;

    const gx = Number.isInteger(x) ? x : 8;
    const gy = Number.isInteger(y) ? y : 10;

    if (!this.otherPlayers[discord_id]) {
      const g = this.add.graphics();
      this.drawPlayer(g, 0x7c8cf8);
      g.setPosition(gx * TILE, gy * TILE);
      this.otherPlayers[discord_id] = g;

      this.playerLabels[discord_id] = this.add.text(gx * TILE + TILE / 2, gy * TILE - 2, username || '玩家', {
        fontSize: '10px', fontFamily: 'Noto Sans TC', color: '#ffffff', stroke: '#0d1117', strokeThickness: 3,
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
  }
}
