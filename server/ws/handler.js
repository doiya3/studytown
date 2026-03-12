const { WebSocketServer } = require('ws')

// Map: discord_id -> { ws, scene }
const clients = new Map()

function broadcast(scene, message, excludeId = null) {
  const payload = JSON.stringify(message)
  for (const [id, client] of clients.entries()) {
    if (id !== excludeId && client.scene === scene && client.ws.readyState === 1) {
      client.ws.send(payload)
    }
  }
}

function sendTo(discord_id, message) {
  const client = clients.get(discord_id)
  if (client && client.ws.readyState === 1) {
    client.ws.send(JSON.stringify(message))
  }
}

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws) => {
    let authId = null

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw)
      } catch {
        return
      }

      if (msg.type === 'auth') {
        authId = msg.discord_id
        const scene = msg.scene || null
        clients.set(authId, { ws, scene })
        console.log(`[WS] 玩家連線: ${authId} 場景: ${scene}`)
        return
      }

      if (!authId) return // 未驗證的訊息一律忽略

      if (msg.type === 'move') {
        const client = clients.get(authId)
        if (!client) return
        // 更新 clients 中儲存的 username（首次或更新時）
        if (msg.username) client.username = msg.username
        broadcast(client.scene, {
          type: 'player_move',
          discord_id: authId,
          username: client.username || authId,
          x: msg.x,
          y: msg.y
        }, authId)
        return
      }

      if (msg.type === 'broadcast') {
        const { to, action, text, fromName } = msg
        sendTo(to, {
          type: 'broadcast',
          from: authId,
          fromName: fromName || authId,
          action,
          text: text || null
        })
        return
      }
    })

    ws.on('close', () => {
      if (!authId) return
      const client = clients.get(authId)
      if (client) {
        broadcast(client.scene, { type: 'player_leave', discord_id: authId }, authId)
        clients.delete(authId)
        console.log(`[WS] 玩家離線: ${authId}`)
      }
    })

    ws.on('error', (err) => {
      console.error(`[WS] 錯誤 (${authId}):`, err.message)
    })
  })

  console.log('[WS] WebSocket 伺服器已附加到 HTTP server')
}

module.exports = { setupWebSocket }
