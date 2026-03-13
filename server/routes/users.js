const express = require('express')
const router = express.Router()
const supabase = require('../supabase')

function calcLevel(xp) {
  if (xp < 100) return 1
  if (xp < 250) return 2
  if (xp < 500) return 3
  if (xp < 900) return 4
  if (xp < 1400) return 5
  return Math.floor(xp / 300) + 1
}

function clampText(input, maxLen) {
  if (typeof input !== 'string') return ''
  return input.trim().slice(0, maxLen)
}

function getTimeRangeStarts() {
  const now = new Date()

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  const startOfWeek = new Date(startOfToday)
  const day = startOfWeek.getDay()
  const diffToMonday = (day + 6) % 7
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday)

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  return {
    todayISO: startOfToday.toISOString(),
    weekISO: startOfWeek.toISOString(),
    monthISO: startOfMonth.toISOString()
  }
}

function sumDuration(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0
  return rows.reduce((acc, row) => acc + (row.duration_minutes || 0), 0)
}

// GET /api/users/:discord_id/profile - 取得完整個人資料（他人依隱私限制）
router.get('/:discord_id/profile', async (req, res) => {
  const { discord_id } = req.params
  const viewerId = req.query.viewer_id || discord_id

  const { data, error } = await supabase
    .from('users')
    .select('discord_id, username, display_name, avatar, discord_avatar, avatar_mode, status, current_zone, level, xp, total_minutes, bio, status_text, is_profile_public')
    .eq('discord_id', discord_id)
    .single()

  if (error || !data) return res.status(404).json({ error: 'User not found' })

  const isOwner = viewerId && viewerId === discord_id
  if (!data.is_profile_public && !isOwner) {
    const safeAvatarMode = ['discord', 'custom', 'anonymous'].includes(data.avatar_mode)
      ? data.avatar_mode
      : 'discord'
    const safeName = safeAvatarMode === 'anonymous'
      ? '同學'
      : safeAvatarMode === 'custom'
        ? ((data.display_name || '').trim() || '未命名')
        : (data.username || '未知玩家')
    return res.json({
      discord_id,
      is_profile_public: false,
      avatar_mode: safeAvatarMode,
      username: safeName,
      display_name: safeAvatarMode === 'custom' ? (data.display_name || '') : ''
    })
  }

  res.json(data)
})

// POST /api/users/:discord_id/profile - 更新個人資料
router.post('/:discord_id/profile', async (req, res) => {
  const { discord_id } = req.params
  const { bio, status_text, is_profile_public, avatar_mode, display_name } = req.body

  const updateData = {
    bio: clampText(bio, 100),
    status_text: clampText(status_text, 30),
    display_name: clampText(display_name, 20)
  }

  if (typeof is_profile_public === 'boolean') {
    updateData.is_profile_public = is_profile_public
  }
  if (avatar_mode === 'discord' || avatar_mode === 'custom' || avatar_mode === 'anonymous') {
    updateData.avatar_mode = avatar_mode
  }

  const { data, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('discord_id', discord_id)
    .select('discord_id, bio, status_text, is_profile_public, avatar_mode, display_name')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /api/users/:discord_id/stats - 取得學習統計
router.get('/:discord_id/stats', async (req, res) => {
  const { discord_id } = req.params
  const { todayISO, weekISO, monthISO } = getTimeRangeStarts()

  const [userResp, todayResp, weekResp, monthResp, totalResp] = await Promise.all([
    supabase.from('users').select('xp, total_minutes').eq('discord_id', discord_id).single(),
    supabase.from('study_sessions').select('duration_minutes').eq('discord_id', discord_id).gte('start_time', todayISO),
    supabase.from('study_sessions').select('duration_minutes').eq('discord_id', discord_id).gte('start_time', weekISO),
    supabase.from('study_sessions').select('duration_minutes').eq('discord_id', discord_id).gte('start_time', monthISO),
    supabase.from('study_sessions').select('duration_minutes').eq('discord_id', discord_id)
  ])

  if (userResp.error || !userResp.data) {
    return res.status(404).json({ error: 'User not found' })
  }
  if (todayResp.error || weekResp.error || monthResp.error || totalResp.error) {
    return res.status(500).json({ error: 'Failed to load study stats' })
  }

  const xp = userResp.data.xp || 0
  const level = calcLevel(xp)
  const totalMinutesFromUser = userResp.data.total_minutes || 0
  const totalMinutesFromSessions = sumDuration(totalResp.data)
  const total = Math.max(totalMinutesFromUser, totalMinutesFromSessions)

  res.json({
    today: sumDuration(todayResp.data),
    week: sumDuration(weekResp.data),
    month: sumDuration(monthResp.data),
    total,
    xp,
    level
  })
})

// GET /api/users/:discord_id - 取得玩家資料
router.get('/:discord_id', async (req, res) => {
  const { discord_id } = req.params
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('discord_id', discord_id)
    .single()

  if (error) return res.status(404).json({ error: error.message })
  res.json(data)
})

// POST /api/users/upsert - 新增或更新玩家（登入時呼叫）
router.post('/upsert', async (req, res) => {
  const { discord_id, username, avatar, discord_avatar, avatar_mode, display_name } = req.body
  if (!discord_id) return res.status(400).json({ error: 'discord_id is required' })

  const upsertData = { discord_id, username, avatar }
  if (discord_avatar !== undefined) upsertData.discord_avatar = discord_avatar
  if (avatar_mode) upsertData.avatar_mode = avatar_mode
  if (display_name !== undefined) upsertData.display_name = clampText(display_name, 20)

  const { data, error } = await supabase
    .from('users')
    .upsert(upsertData, { onConflict: 'discord_id' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/users/location - 更新玩家位置
router.post('/location', async (req, res) => {
  const { discord_id, map_x, map_y, map_scene } = req.body
  if (!discord_id) return res.status(400).json({ error: 'discord_id is required' })

  const { data, error } = await supabase
    .from('users')
    .update({ map_x, map_y, map_scene })
    .eq('discord_id', discord_id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/users/status - 更新玩家狀態
router.post('/status', async (req, res) => {
  const { discord_id, status, current_zone, seat_id, avatar_mode } = req.body
  if (!discord_id) return res.status(400).json({ error: 'discord_id is required' })

  const updateData = { status, current_zone, seat_id }
  if (avatar_mode !== undefined) updateData.avatar_mode = avatar_mode

  const { data, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('discord_id', discord_id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/users/clear-location - 離開場景時清除位置
router.post('/clear-location', async (req, res) => {
  const { discord_id } = req.body
  if (!discord_id) return res.status(400).json({ error: 'discord_id is required' })

  const { data, error } = await supabase
    .from('users')
    .update({ map_x: null, map_y: null, map_scene: null, status: 'idle', current_zone: null, seat_id: null })
    .eq('discord_id', discord_id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /api/users/scene/all - 取得所有場景的玩家數量統計
router.get('/scene/all', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('discord_id, username, display_name, current_zone, status, level, xp, avatar, discord_avatar, avatar_mode')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// GET /api/users/scene/:scene_name - 取得某場景內所有玩家
router.get('/scene/:scene_name', async (req, res) => {
  const { scene_name } = req.params
  const { data, error } = await supabase
    .from('users')
    .select('discord_id, username, display_name, avatar_mode, discord_avatar, map_x, map_y, seat_id, status, current_zone, xp, level')
    .eq('map_scene', scene_name)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
