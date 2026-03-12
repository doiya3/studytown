const express = require('express')
const router = express.Router()
const supabase = require('../supabase')

/*
  Required Supabase table (run once in SQL editor):

  CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    member1_id TEXT NOT NULL,
    member2_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
  );
*/

// GET /api/teams/:discord_id — 取得目前組隊狀態和隊友資料
router.get('/:discord_id', async (req, res) => {
  const { discord_id } = req.params
  try {
    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .or(`member1_id.eq.${discord_id},member2_id.eq.${discord_id}`)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!team) return res.json({ team: null, teammate: null })

    const teammateId = team.member1_id === discord_id ? team.member2_id : team.member1_id
    const { data: teammate } = await supabase
      .from('users')
      .select('discord_id, username, current_zone, status, discord_avatar, avatar_mode')
      .eq('discord_id', teammateId)
      .maybeSingle()

    res.json({ team, teammate: teammate || null })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/teams/invite — 發送組隊邀請
router.post('/invite', async (req, res) => {
  const { from_id, to_id } = req.body
  if (!from_id || !to_id) return res.status(400).json({ error: 'missing fields' })
  try {
    // 清除舊的 pending 邀請
    await supabase.from('teams').delete()
      .eq('member1_id', from_id).eq('status', 'pending')

    const { data, error } = await supabase.from('teams')
      .insert({ member1_id: from_id, member2_id: to_id, status: 'pending' })
      .select().single()

    if (error) return res.status(500).json({ error: error.message })
    res.json({ success: true, team: data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/teams/accept — 接受邀請
router.post('/accept', async (req, res) => {
  const { from_id, to_id } = req.body
  if (!from_id || !to_id) return res.status(400).json({ error: 'missing fields' })
  try {
    // 解散接受者舊的 active 組隊
    await supabase.from('teams').update({ status: 'disbanded' })
      .or(`member1_id.eq.${to_id},member2_id.eq.${to_id}`)
      .eq('status', 'active')

    const { data, error } = await supabase.from('teams')
      .update({ status: 'active' })
      .eq('member1_id', from_id)
      .eq('member2_id', to_id)
      .eq('status', 'pending')
      .select().single()

    if (error || !data) return res.status(404).json({ error: 'invite not found' })
    res.json({ success: true, team: data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/teams/disband — 解散組隊
router.post('/disband', async (req, res) => {
  const { discord_id } = req.body
  if (!discord_id) return res.status(400).json({ error: 'missing discord_id' })
  try {
    await supabase.from('teams').update({ status: 'disbanded' })
      .or(`member1_id.eq.${discord_id},member2_id.eq.${discord_id}`)
      .in('status', ['active', 'pending'])

    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
