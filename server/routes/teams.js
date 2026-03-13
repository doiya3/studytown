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

const TEAM_USER_FIELDS = 'discord_id, username, current_zone, status, discord_avatar, avatar_mode'

async function getTeamEdgesByStatus(status) {
  const { data, error } = await supabase
    .from('teams')
    .select('id, member1_id, member2_id, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

function getConnectedMemberIds(edges, seedId) {
  const adjacency = new Map()
  for (const edge of edges) {
    if (!adjacency.has(edge.member1_id)) adjacency.set(edge.member1_id, new Set())
    if (!adjacency.has(edge.member2_id)) adjacency.set(edge.member2_id, new Set())
    adjacency.get(edge.member1_id).add(edge.member2_id)
    adjacency.get(edge.member2_id).add(edge.member1_id)
  }

  if (!adjacency.has(seedId)) return []

  const visited = new Set([seedId])
  const queue = [seedId]

  while (queue.length > 0) {
    const current = queue.shift()
    for (const next of adjacency.get(current) || []) {
      if (visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }

  visited.delete(seedId)
  return Array.from(visited)
}

async function getTeamSnapshot(discordId) {
  const activeEdges = await getTeamEdgesByStatus('active')
  const teammateIds = getConnectedMemberIds(activeEdges, discordId)

  if (teammateIds.length === 0) {
    return { team: null, teammates: [], teammate: null, member_ids: [discordId] }
  }

  const { data: users, error } = await supabase
    .from('users')
    .select(TEAM_USER_FIELDS)
    .in('discord_id', teammateIds)

  if (error) throw error

  const teammateMap = new Map((users || []).map(user => [user.discord_id, user]))
  const teammates = teammateIds.map(id => teammateMap.get(id)).filter(Boolean)

  return {
    team: {
      member_ids: [discordId, ...teammateIds],
      size: teammateIds.length + 1,
    },
    teammates,
    teammate: teammates[0] || null,
    member_ids: [discordId, ...teammateIds],
  }
}

// GET /api/teams/:discord_id — 取得目前組隊狀態和隊友資料
router.get('/:discord_id', async (req, res) => {
  const { discord_id } = req.params
  try {
    const snapshot = await getTeamSnapshot(discord_id)
    res.json(snapshot)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/teams/invite — 發送組隊邀請
router.post('/invite', async (req, res) => {
  const { from_id, to_id } = req.body
  if (!from_id || !to_id) return res.status(400).json({ error: 'missing fields' })
  if (from_id === to_id) return res.status(400).json({ error: 'cannot invite self' })
  try {
    await supabase
      .from('teams')
      .delete()
      .neq('status', 'active')
      .or(`and(member1_id.eq.${from_id},member2_id.eq.${to_id}),and(member1_id.eq.${to_id},member2_id.eq.${from_id})`)

    const activeEdges = await getTeamEdgesByStatus('active')
    const fromTeamMemberIds = new Set([from_id, ...getConnectedMemberIds(activeEdges, from_id)])
    if (fromTeamMemberIds.has(to_id)) {
      return res.status(400).json({ error: 'already in same team' })
    }

    const pendingEdges = await getTeamEdgesByStatus('pending')
    const hasConflictingPending = pendingEdges.some(edge => {
      const samePair = (edge.member1_id === from_id && edge.member2_id === to_id)
        || (edge.member1_id === to_id && edge.member2_id === from_id)
      return samePair
    })

    if (hasConflictingPending) {
      return res.status(400).json({ error: 'pending invite already exists' })
    }

    const { data, error } = await supabase.from('teams')
      .insert({ member1_id: from_id, member2_id: to_id, status: 'pending' })
      .select().single()

    if (error) return res.status(500).json({ error: error.message })
    res.json({ success: true, team: data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/teams/reject — 拒絕邀請
router.post('/reject', async (req, res) => {
  const { from_id, to_id, team_id } = req.body
  if (!team_id && (!from_id || !to_id)) {
    return res.status(400).json({ error: 'missing fields' })
  }

  try {
    let query = supabase.from('teams').update({ status: 'rejected' })
    if (team_id) {
      query = query.eq('id', team_id)
    } else {
      query = query
        .eq('status', 'pending')
        .or(`and(member1_id.eq.${from_id},member2_id.eq.${to_id}),and(member1_id.eq.${to_id},member2_id.eq.${from_id})`)
    }

    const { error } = await query
    if (error) return res.status(500).json({ error: error.message })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/teams/accept — 接受邀請
router.post('/accept', async (req, res) => {
  const { from_id, to_id } = req.body
  if (!from_id || !to_id) return res.status(400).json({ error: 'missing fields' })
  try {
    const { data: pendingInvite, error: pendingError } = await supabase.from('teams')
      .select('id, member1_id, member2_id, status, created_at')
      .eq('member1_id', from_id)
      .eq('member2_id', to_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pendingError) return res.status(500).json({ error: pendingError.message })
    if (!pendingInvite) {
      // Debug: Check if invite exists in reverse order or different status
      const { data: reverseInvite } = await supabase.from('teams')
        .select('id, member1_id, member2_id, status')
        .eq('member1_id', to_id)
        .eq('member2_id', from_id)
        .limit(1)
        .maybeSingle()
      
      const debugMsg = reverseInvite 
        ? `found reverse: ${to_id} invited ${from_id} (status: ${reverseInvite.status})`
        : `no invite found for ${from_id}→${to_id}`
      
      return res.status(404).json({ error: 'invite not found', debug: debugMsg })
    }

    const { data, error } = await supabase.from('teams')
      .update({ status: 'active' })
      .eq('id', pendingInvite.id)
      .select().single()

    if (error || !data) return res.status(500).json({ error: 'failed to activate invite', details: error?.message })

    await supabase.from('teams').delete()
      .neq('id', data.id)
      .eq('status', 'pending')
      .or(`member1_id.eq.${from_id},member2_id.eq.${from_id},member1_id.eq.${to_id},member2_id.eq.${to_id}`)

    const snapshot = await getTeamSnapshot(from_id)
    res.json({ success: true, team: data, member_ids: snapshot.member_ids })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/teams/disband — 解散組隊
router.post('/disband', async (req, res) => {
  const { discord_id } = req.body
  if (!discord_id) return res.status(400).json({ error: 'missing discord_id' })
  try {
    const snapshot = await getTeamSnapshot(discord_id)

    await supabase.from('teams').update({ status: 'disbanded' })
      .or(`member1_id.eq.${discord_id},member2_id.eq.${discord_id}`)
      .in('status', ['active', 'pending'])

    res.json({ success: true, affected_ids: snapshot.member_ids.filter(id => id !== discord_id) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
