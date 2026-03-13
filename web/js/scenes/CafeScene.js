const TILE = 48;
const COLS = 16;
const ROWS = 12;

const COLORS = {
  floor: 0x523a25,
  floor2: 0x4a3220,
  wall: 0x2a1a0a,
  counter: 0x6b4a2a,
  counterTop: 0x8b6a3a,
  sofa: 0x8b3a2a,
  sofaLight: 0xaa5a3a,
  table: 0x5c3a1e,
  chair: 0x7c5a3a,
  window: 0x6ca0dc,
  door: 0x8b7355,
  plant: 0x2d5a2d,
  playerSelf: 0xf5a623,
  playerOther: 0x7c8cf8,
};

const SEATS = [
  { id: 1, x: 3, y: 5 },
  { id: 2, x: 3, y: 7 },
  { id: 3, x: 5, y: 5 },
  { id: 4, x: 5, y: 7 },
  { id: 5, x: 9, y: 5 },
  { id: 6, x: 11, y: 5 },
  { id: 7, x: 9, y: 8 },
  { id: 8, x: 11, y: 8 },
];

const COUNTER_INTERACT_Y = 3;

function buildBlockedTiles() {
  const blocked = new Set();
  const blockRect = (x, y, w, h) => {
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) blocked.add(`${i},${j}`);
  };

  blockRect(0, 0, COLS, 1);
  blockRect(0, 0, 1, ROWS);
  blockRect(COLS - 1, 0, 1, ROWS);
  blockRect(1, 1, 14, 2);
  for (let x = 0; x < COLS; x++) if (x < 7 || x > 8) blocked.add(`${x},${ROWS - 1}`);
  for (const seat of SEATS) if (seat.id <= 4) blocked.add(`${seat.x + 1},${seat.y}`);
  return blocked;
}

const BLOCKED = buildBlockedTiles();
function isBlocked(gx, gy) {
  return BLOCKED.has(`${gx},${gy}`) || gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS;
}

export class CafeScene extends Phaser.Scene {
  constructor() {
    super('CafeScene');
    this.runtime = null;
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
    this.nearCounter = false;
    this.seated = false;
    this.currentSeat = null;
    this.unsubscribeWs = null;
    this.overlayTimer = null;
  }

  init(data) {
    this.runtime = data.runtime;
  }

  create() {
    this.graphics = this.add.graphics();
    this.drawMap();

    this.player = this.add.graphics();
    this.drawPlayer(this.player, COLORS.playerSelf);
    this.playerLabel = this.add.text(0, 0, this.runtime.session.displayName, {
      fontSize: '10px', fontFamily: 'Noto Sans TC', color: '#f5a623', stroke: '#1a1208', strokeThickness: 3,
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

    this.runtime.setSceneName('咖啡廳');
    this.runtime.connectWs();
    this.unsubscribeWs = this.runtime.addMessageListener((msg) => this.onWsMessage(msg));

    this.loadOtherPlayers();
    this.updateServerState('browsing', null);
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
      const res = await fetch(`${this.runtime.API_URL}/api/users/scene/咖啡廳`);
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
        g.fillStyle((x + y) % 2 === 0 ? COLORS.floor : COLORS.floor2, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    g.fillStyle(COLORS.wall, 1);
    g.fillRect(0, 0, TILE * COLS, TILE);
    g.fillRect(0, 0, TILE, TILE * ROWS);
    g.fillRect((COLS - 1) * TILE, 0, TILE, TILE * ROWS);

    for (let x = 1; x < 15; x++) {
      g.fillStyle(COLORS.counter, 1);
      g.fillRect(x * TILE, TILE, TILE, TILE * 1.5);
      g.fillStyle(COLORS.counterTop, 1);
      g.fillRect(x * TILE + 2, TILE + 2, TILE - 4, 10);
    }

    g.fillStyle(COLORS.window, 1);
    g.fillRect(5 * TILE + 4, 4, TILE * 2 - 8, 8);
    g.fillRect(10 * TILE + 4, 4, TILE * 2 - 8, 8);

    const sofaSeats = SEATS.filter((s) => s.id <= 4);
    for (const seat of sofaSeats) {
      g.fillStyle(COLORS.sofa, 1);
      g.fillRect(seat.x * TILE + 2, seat.y * TILE + 2, TILE - 4, TILE - 4);
      g.fillStyle(COLORS.sofaLight, 1);
      g.fillRect(seat.x * TILE + 6, seat.y * TILE + 6, TILE - 12, TILE - 20);
      g.fillStyle(COLORS.table, 1);
      g.fillRect((seat.x + 1) * TILE + 6, seat.y * TILE + 6, TILE - 12, TILE - 12);
    }

    const tableSeats = SEATS.filter((s) => s.id > 4);
    for (const seat of tableSeats) {
      g.fillStyle(COLORS.table, 1);
      g.fillRect(seat.x * TILE + 2, (seat.y - 1) * TILE + 2, TILE - 4, TILE - 4);
      g.fillStyle(COLORS.chair, 1);
      g.fillRect(seat.x * TILE + 6, seat.y * TILE + 6, TILE - 12, TILE - 12);
    }

    g.fillStyle(COLORS.plant, 1);
    g.fillCircle(2 * TILE - 8, 4 * TILE, 16);
    g.fillCircle(14 * TILE + 8, 4 * TILE, 16);

    g.fillStyle(COLORS.door, 1);
    g.fillRect(7 * TILE + 4, 11 * TILE, TILE * 2 - 8, TILE);
  }

  drawPlayer(g, color) {
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(TILE / 2, TILE - 6, TILE - 10, 8);
    g.fillStyle(color, 0.9);
    g.fillCircle(TILE / 2, TILE / 2 - 2, 14);
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

    if (moved) {
      const blockedByPlayer = Object.values(this.otherGrids).some((g) => g.x === nx && g.y === ny);
      if (!isBlocked(nx, ny) && !blockedByPlayer) {
        this.playerGx = nx;
        this.playerGy = ny;
        this.updatePlayerPos();
        this.sendMove();
        this.pushLocation();
      }
    }

    this.moveTimer = 0;
  }

  checkNearbyInteractable() {
    const hint = document.getElementById('interaction-hint');
    if (!hint) return;

    this.nearDoor = this.playerGy >= 10 && this.playerGx >= 7 && this.playerGx <= 9;
    if (this.nearDoor) {
      hint.textContent = '按 E 返回地圖';
      hint.style.display = 'block';
      this.nearCounter = false;
      this.nearSeat = null;
      return;
    }

    this.nearCounter = this.playerGy === COUNTER_INTERACT_Y && this.playerGx >= 2 && this.playerGx <= 13;
    if (this.nearCounter) {
      hint.textContent = '按 E 點一杯飲料';
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
      hint.textContent = `按 E 坐下休息（座位 #${this.nearSeat.id}）`;
      hint.style.display = 'block';
      return;
    }

    hint.style.display = 'none';
  }

  async tryInteract() {
    if (this.nearDoor) {
      await window.switchSpaScene?.('map');
      return;
    }

    const hint = document.getElementById('interaction-hint');
    if (this.nearCounter) {
      if (hint) {
        hint.textContent = '飲料面板下一步接回';
        hint.style.display = 'block';
      }
      return;
    }

    if (!this.nearSeat) return;

    if (!this.seated) {
      this.seated = true;
      this.currentSeat = this.nearSeat;
      this.playerGx = this.nearSeat.x;
      this.playerGy = this.nearSeat.y;
      this.updatePlayerPos();
      await this.updateServerState('browsing', this.currentSeat.id);
    } else {
      this.seated = false;
      this.currentSeat = null;
      await this.updateServerState('browsing', null);
    }

    this.sendMove();
  }

  async updateServerState(status, seatId) {
    await this.runtime.postJSON('/api/users/status', {
      discord_id: this.runtime.session.id,
      status,
      current_zone: '咖啡廳',
      seat_id: seatId,
      avatar_mode: this.runtime.session.avatarMode,
    });
  }

  async pushLocation() {
    await this.runtime.postJSON('/api/users/location', {
      discord_id: this.runtime.session.id,
      map_x: this.playerGx,
      map_y: this.playerGy,
      map_scene: '咖啡廳',
    });
  }

  sendMove() {
    this.runtime.send({
      type: 'move',
      scene: '咖啡廳',
      x: this.playerGx,
      y: this.playerGy,
      username: this.runtime.session.displayName,
      avatar_url: this.runtime.session.avatarMode === 'discord' ? this.runtime.session.avatarUrl : null,
    });
  }

  onWsMessage(msg) {
    if (msg.type === 'player_move') {
      if (msg.scene && msg.scene !== '咖啡廳') return;
      this.onPlayerMove(msg);
    }
    if (msg.type === 'player_leave') this.onPlayerLeave(msg.discord_id);
  }

  async loadOtherPlayers() {
    try {
      const res = await fetch(`${this.runtime.API_URL}/api/users/scene/咖啡廳`);
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
      this.drawPlayer(g, COLORS.playerOther);
      g.setPosition(gx * TILE, gy * TILE);
      this.otherPlayers[discord_id] = g;

      this.playerLabels[discord_id] = this.add.text(gx * TILE + TILE / 2, gy * TILE - 2, username || '玩家', {
        fontSize: '10px', fontFamily: 'Noto Sans TC', color: '#ffffff', stroke: '#1a1208', strokeThickness: 3,
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
