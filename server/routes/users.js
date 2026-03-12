const express = require('express')
const router = express.Router()
const supabase = require('../supabase')

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
  const { discord_id, username, avatar, discord_avatar, avatar_mode } = req.body
  if (!discord_id) return res.status(400).json({ error: 'discord_id is required' })

  const upsertData = { discord_id, username, avatar }
  // discord_avatar / avatar_mode columns not yet in DB — add after ALTER TABLE

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
  // avatar_mode column not yet in DB — add after ALTER TABLE

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
    .select('discord_id, username, current_zone, status, level, xp, avatar')
    .not('current_zone', 'is', null)
    .neq('current_zone', 'none')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// GET /api/users/scene/:scene_name - 取得某場景內所有玩家
router.get('/scene/:scene_name', async (req, res) => {
  const { scene_name } = req.params
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('map_scene', scene_name)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
