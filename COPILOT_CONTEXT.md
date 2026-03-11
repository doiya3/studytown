# Study Town — 專案說明（給 Copilot 的上下文）

## 專案概述
Study Town 是一個**校園學習 Discord MMO**，結合 Discord Bot 和網頁遊戲。
玩家可以在 Discord 使用指令學習計時，也可以進入網頁地圖場景，用像素風格的角色走動、找座位、開始番茄鐘專注。

---

## 技術架構

| 層級 | 技術 |
|------|------|
| Discord Bot | Node.js + discord.js |
| 資料庫 | Supabase (PostgreSQL + Realtime) |
| 網頁前端 | HTML / CSS / Vanilla JS + Phaser.js 3 |
| 部署 | GitHub Pages (`https://doiya3.github.io/studytown/`) |
| 登入 | Discord OAuth2 (Implicit Flow) |

---

## 資料夾結構

```
studytown/
├── bot/
│   ├── index.js        # Bot 主程式，註冊指令、監聽事件
│   ├── commands.js     # 所有指令邏輯
│   └── .env            # DISCORD_TOKEN, SUPABASE_URL, SUPABASE_KEY, GUILD_ID
└── web/
    ├── index.html      # 主頁（小鎮地圖，顯示各區域玩家）
    ├── auth.js         # Discord OAuth 登入邏輯
    ├── library.html    # 圖書館 Phaser.js 場景
    └── cafe.html       # 咖啡廳 Phaser.js 場景
```

---

## Supabase 資料表

### `users`
| 欄位 | 類型 | 說明 |
|------|------|------|
| discord_id | TEXT | Discord 用戶 ID（唯一） |
| username | TEXT | 使用者名稱 |
| xp | INTEGER | 總 XP |
| level | INTEGER | 等級 |
| total_minutes | INTEGER | 總專注分鐘數 |
| current_zone | TEXT | 目前區域（圖書館/咖啡廳/夜讀室/草地/湖邊/none） |
| avatar | TEXT | 頭像（cat/dog/bear/rabbit/fox/panda/frog/penguin） |
| seat_id | INTEGER | 目前佔用的座位 ID |
| status | TEXT | offline / browsing / studying |
| map_x | INTEGER | 在場景內的格子 X 座標 |
| map_y | INTEGER | 在場景內的格子 Y 座標 |
| map_scene | TEXT | 目前在哪個場景（圖書館/咖啡廳/none） |
| last_checkin | DATE | 最後簽到日期 |
| checkin_streak | INTEGER | 連續簽到天數 |

### `study_sessions`
| 欄位 | 類型 | 說明 |
|------|------|------|
| discord_id | TEXT | 玩家 ID |
| zone | TEXT | 學習區域 |
| start_time | TIMESTAMP | 開始時間 |
| end_time | TIMESTAMP | 結束時間（null = 進行中） |
| duration_minutes | INTEGER | 時長（分鐘） |
| xp_earned | INTEGER | 獲得的 XP |
| seat_id | INTEGER | 座位 ID |

### `fish_collection`
| 欄位 | 類型 | 說明 |
|------|------|------|
| discord_id | TEXT | 玩家 ID |
| fish_type | TEXT | 魚的種類 |
| caught_at | TIMESTAMP | 釣到時間 |

---

## Discord Bot 指令

| 指令 | 說明 |
|------|------|
| `/study start zone:[區域]` | 開始專注，自動分配座位 |
| `/study end` | 結束專注，結算 XP |
| `/move zone:[區域]` | 切換區域 |
| `/profile` | 查看個人資料 |
| `/rank period:[週/月/總]` | 排行榜 |
| `/checkin` | 每日簽到（連續簽到有獎勵） |
| `/avatar style:[動物]` | 選擇頭像 |
| `/fish` | 在湖邊釣魚 |
| `/fishbook` | 查看魚類圖鑑 |

---

## 網頁場景（Phaser.js）

### 共通邏輯
- **俯視角**，WASD + 點擊移動
- **格子系統**：`TILE = 48px`，地圖 `16 × 12` 格
- **多人即時同步**：Supabase Realtime 訂閱 `users` 表
- **插值移動**：其他玩家的位置用 lerp（0.2）平滑移動
- **座位系統**：靠近座位按 E 坐下，坐下後開啟番茄鐘面板
- **門口互動**：走到門口按 E 返回主頁（`index.html`）
- **登入驗證**：從 `localStorage` 讀取 `study_user`，沒有則跳回主頁

### 登入流程（auth.js）
```javascript
// Discord OAuth Implicit Flow
// 登入後 token 在 URL hash，解析後存到 localStorage
localStorage.setItem('study_user', JSON.stringify(discordUser))
localStorage.setItem('study_token', token)
```

### 各場景特色
| 場景 | 特色互動 | 色調 |
|------|---------|------|
| 圖書館 | 坐下讀書 + 番茄鐘 | 深綠色 |
| 咖啡廳 | 走到吧台按 E 點飲料（裝飾性）+ 番茄鐘 | 暖棕色 |

---

## XP 計算規則

| 時長 | XP |
|------|-----|
| < 5 分鐘 | 0 |
| 5~24 分鐘 | 分鐘數 × 1.5 |
| 25~49 分鐘 | 50 XP |
| 50 分鐘以上 | 120 XP（上限） |
| 每日簽到 | 20 XP（連續有加成） |

---

## 目前開發中的功能

- [ ] 更多場景（夜讀室、草地、湖邊）
- [ ] 座位佔用同步（其他玩家坐下後地圖上顯示佔用）
- [ ] 釣魚場景整合到湖邊網頁
- [ ] 主頁導航完善

---

## 注意事項

1. **時區**：Supabase 存 UTC，JavaScript 解析時需加 `'Z'`：`new Date(timestamp + 'Z')`
2. **Supabase Realtime**：需在 Supabase Dashboard → Database → Replication 開啟 `users` 表
3. **座位限制**：圖書館 8 個、咖啡廳 6 個、夜讀室 4 個、草地/湖邊無限制
4. **Bot 使用 guild commands**（非 global），在 Discord 伺服器內立即生效
