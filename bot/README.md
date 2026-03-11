# StudyTown Discord Bot

一個用於 Discord 的 StudyTown 機械人

## 安裝

1. 安裝依賴項：
```bash
npm install
```

2. 複製 `.env.example` 並建立 `.env` 文件：
```bash
cp .env.example .env
```

3. 在 `.env` 中填入您的 Discord Bot Token

## 資料夾結構

- `commands/` - 機械人指令
- `events/` - 事件處理器
- `utils/` - 工具函數
- `main.js` - 主程式

## 運行

開發模式（需要 nodemon）：
```bash
npm run dev
```

正式運行：
```bash
npm start
```

## 事件模板

在 `events/` 資料夾中建立新事件檔案，例如：

```javascript
module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`Ready! Logged in as ${client.user.tag}`);
  },
};
```
