const express = require('express')
const router = express.Router()
const supabase = require('../supabase')

function calcXP(durationMinutes) {
  if (durationMinutes < 5) return 0
  if (durationMinutes < 25) return Math.floor(durationMinutes * 1.5)
  if (durationMinutes < 50) return 50
  return 120
}

// POST /api/study/start - 開始學習 session
router.post('/start', async (req, res) => {
  const { discord_id, zone, seat_id } = req.body
  if (!discord_id) return res.status(400).json({ error: 'discord_id is required' })

  const { data, error } = await supabase
    .from('study_sessions')
    .insert({ discord_id, zone: zone || null, seat_id: seat_id || null, start_time: new Date().toISOString() })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/study/end - 結束 session，計算 XP
router.post('/end', async (req, res) => {
  const { discord_id, session_id } = req.body
  if (!discord_id || !session_id) return res.status(400).json({ error: 'discord_id and session_id are required' })

  // 取得 session
  const { data: session, error: sessionError } = await supabase
    .from('study_sessions')
    .select('*')
    .eq('id', session_id)
    .eq('discord_id', discord_id)
    .is('end_time', null)
    .single()

  if (sessionError || !session) return res.status(404).json({ error: 'Active session not found' })

  const endedAt = new Date()
  // Supabase 回傳的時間字串可能不帶時區，強制加 Z 確保當作 UTC 解析
  const startTimeStr = session.start_time.endsWith('Z') ? session.start_time : session.start_time + 'Z'
  const startedAt = new Date(startTimeStr)
  const durationMinutes = Math.floor((endedAt - startedAt) / 60000)
  const xpEarned = calcXP(durationMinutes)

  // 更新 session
  const { data: updatedSession, error: updateError } = await supabase
    .from('study_sessions')
    .update({ end_time: endedAt.toISOString(), duration_minutes: durationMinutes, xp_earned: xpEarned })
    .eq('id', session_id)
    .select()
    .single()

  if (updateError) return res.status(500).json({ error: updateError.message })

  // 更新 users 表的 xp 和 total_minutes
  const { data: user } = await supabase
    .from('users')
    .select('xp, total_minutes')
    .eq('discord_id', discord_id)
    .single()

  if (user) {
    await supabase
      .from('users')
      .update({
        xp: (user.xp || 0) + xpEarned,
        total_minutes: (user.total_minutes || 0) + durationMinutes
      })
      .eq('discord_id', discord_id)
  }

  res.json({ session: updatedSession, xp_earned: xpEarned, duration_minutes: durationMinutes })
})

// GET /api/study/active/:discord_id - 取得進行中的 session
router.get('/active/:discord_id', async (req, res) => {
  const { discord_id } = req.params
  const { data, error } = await supabase
    .from('study_sessions')
    .select('*')
    .eq('discord_id', discord_id)
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(1)
    .single()

  if (error) return res.status(404).json({ error: 'No active session found' })
  res.json(data)
})

module.exports = router
