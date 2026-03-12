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
        if (msg.username) client.username = msg.username
        client.avatar_url = msg.avatar_url ?? null  // 允許 null 清除（匿名模式）
        broadcast(client.scene, {
          type: 'player_move',
          discord_id: authId,
          username: client.username || authId,
          avatar_url: client.avatar_url || null,
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

      if (msg.type === 'team_invite') {
        sendTo(msg.to_id, { type: 'team_invite', from_id: authId, from_name: msg.from_name || authId })
        return
      }

      if (msg.type === 'team_accepted') {
        sendTo(msg.to_id, { type: 'team_accepted', by_id: authId, by_name: msg.by_name || authId })
        return
      }

      if (msg.type === 'team_disbanded') {
        sendTo(msg.to_id, { type: 'team_disbanded' })
        return
      }

      if (msg.type === 'team_message') {
        sendTo(msg.to_id, { type: 'team_message', from_id: authId, from_name: msg.from_name || authId, text: msg.text || '' })
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
