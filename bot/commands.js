const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

// XP 計算
const XP_PER_25MIN = 50
const XP_PER_50MIN = 120

// 區域清單
const ZONES = ['圖書館', '咖啡廳', '夜讀室', '草地', '湖邊']

// 指令列表
const commands = [
  {
    name: 'ping',
    description: '測試 Bot 是否上線',
  },
  {
  name: 'checkin',
  description: '每日簽到，獲得 XP',
},
{
  name: 'avatar',
  description: '選擇你的 Avatar',
  options: [
    {
      name: 'style',
      description: '選擇角色',
      type: 3,
      required: true,
      choices: [
        { name: '🐱 貓咪', value: 'cat' },
        { name: '🐶 狗狗', value: 'dog' },
        { name: '🐻 熊熊', value: 'bear' },
        { name: '🐰 兔兔', value: 'rabbit' },
        { name: '🦊 狐狸', value: 'fox' },
        { name: '🐼 熊貓', value: 'panda' },
        { name: '🐸 青蛙', value: 'frog' },
        { name: '🐧 企鵝', value: 'penguin' },
      ]
    }
  ]
},
{
  name: 'study',
  description: '專注計時',
  options: [
    {
      name: 'start',
      description: '開始專注',
      type: 1, // SUB_COMMAND
      options: [
        {
          name: 'zone',
          description: '選擇區域',
          type: 3,
          required: true,
          choices: ZONES.map(z => ({ name: z, value: z }))
        }
      ]
    },
    {
      name: 'end',
      description: '結束專注',
      type: 1, // SUB_COMMAND
    }
  ]
},
  {
    name: 'move',
    description: '切換目前的學習區域',
    options: [
        {
        name: 'zone',
        description: '要移動到的區域',
        type: 3,
        required: true,
        choices: ZONES.map(z => ({ name: z, value: z }))
        }
    ]
  },
  {
    name: 'profile',
    description: '查看你的學習資料',
  },
  {
  name: 'rank',
  description: '查看學習排行榜',
  options: [
    {
      name: 'period',
      description: '選擇時間範圍',
      type: 3,
      required: true,
      choices: [
        { name: '本週', value: 'week' },
        { name: '本月', value: 'month' },
        { name: '總排行', value: 'total' },
      ]
    }
  ]
},
{
  name: 'fish',
  description: '在湖邊釣魚！',
},
{
  name: 'fishbook',
  description: '查看你的魚類收藏圖鑑',
}
]

// 確保玩家存在
async function ensureUser(discordId, username) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('discord_id', discordId)
    .maybeSingle()

  if (!data) {
    await supabase.from('users').insert({
      discord_id: discordId,
      username: username,
    })
  }
  return data
}

// 計算等級
function calcLevel(xp) {
  if (xp < 100) return 1
  if (xp < 250) return 2
  if (xp < 500) return 3
  if (xp < 900) return 4
  if (xp < 1400) return 5
  return Math.floor(xp / 300) + 1
}

// 指令處理
async function handleCommand(interaction) {
  try {
    const userId = interaction.user.id
    const username = interaction.user.username

    // /ping 不需要 defer（很快）
    if (interaction.commandName === 'ping') {
      await interaction.reply('🏫 Study Town Bot 上線中！')
      return
    }

    // 其他指令都先 defer（因為要查資料庫）
    try {
      await interaction.deferReply()
    } catch (deferError) {
      console.error('❌ Defer 失敗 (可能是交互過期):', deferError.message)
      // 交互已過期，無法繼續，直接返回
      return
    }
  if (interaction.commandName === 'avatar') {
  await ensureUser(userId, username)

  const style = interaction.options.getString('style')

  const avatarMap = {
    cat: '🐱', dog: '🐶', bear: '🐻',
    rabbit: '🐰', fox: '🦊', panda: '🐼',
    frog: '🐸', penguin: '🐧'
  }

  await supabase
    .from('users')
    .update({ avatar: style })
    .eq('discord_id', userId)

  await interaction.editReply(
    `${avatarMap[style]} **Avatar 已更新！**\n` +
    `你現在是 ${avatarMap[style]}，快去地圖上看看吧！`
  )
}
if (interaction.commandName === 'checkin') {
  await ensureUser(userId, username)

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('discord_id', userId)
    .maybeSingle()

  if (!user) {
    await interaction.editReply('❌ 無法獲取用戶數據，請重試。')
    return
  }

  const today = new Date().toISOString().split('T')[0]
  const lastCheckin = user.last_checkin

  // 今天已經簽到過
  if (lastCheckin === today) {
    await interaction.editReply('📅 今天已經簽到過了！明天再來～')
    return
  }

  // 計算連續簽到
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  let newStreak = lastCheckin === yesterdayStr
    ? (user.checkin_streak || 0) + 1
    : 1

  // 連續簽到獎勵
  let xpEarned = 20
  let bonusMsg = ''

  if (newStreak >= 30) {
    xpEarned = 60
    bonusMsg = '\n🏆 連續30天！超級獎勵！'
  } else if (newStreak >= 14) {
    xpEarned = 50
    bonusMsg = '\n🔥 連續14天！大獎勵！'
  } else if (newStreak >= 7) {
    xpEarned = 40
    bonusMsg = '\n⭐ 連續7天！週獎勵！'
  } else if (newStreak >= 3) {
    xpEarned = 30
    bonusMsg = '\n✨ 連續3天！小獎勵！'
  }

  const newXp = (user.xp || 0) + xpEarned
  const newLevel = calcLevel(newXp)
  const levelUp = newLevel > (user.level || 1)
    ? `\n🆙 **等級提升！Lv${newLevel}**`
    : ''

  await supabase.from('users').update({
    xp: newXp,
    level: newLevel,
    last_checkin: today,
    checkin_streak: newStreak,
  }).eq('discord_id', userId)

  await interaction.editReply(
    `📅 **簽到成功！**\n` +
    `🔥 連續簽到：**${newStreak} 天**\n` +
    `✨ 獲得 XP：**+${xpEarned}**\n` +
    `📊 總 XP：**${newXp}**` +
    bonusMsg + levelUp
  )
}
  // /study
  if (interaction.commandName === 'study') {
    const action = interaction.options.getSubcommand()
    const zone = interaction.options.getString('zone')
    console.log(`[/study ${action}] userId=${userId}, username=${username}`)

    await ensureUser(userId, username)

    if (action === 'start') {
      if (!zone) {
        await interaction.editReply('❌ 請選擇一個區域！')
        return
      }

      const { data: existing, error: existingError } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('discord_id', userId)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)

      if (existing && existing.length > 0) {
        await interaction.editReply('⏱ 你已經在專注中了！先用 `/study end` 結束。')
        return
      }

      const { error: insertError } = await supabase.from('study_sessions').insert({
        discord_id: userId,
        zone: zone,
        start_time: new Date().toISOString(),
      })

      console.log(`[/study start] 已建立 session: userId=${userId}, zone=${zone}, insertError=${insertError}`)

      const ZONE_SEATS = { '圖書館': 8, '咖啡廳': 6, '夜讀室': 4, '草地': null, '湖邊': null }
const maxSeats = ZONE_SEATS[zone]

if (maxSeats !== null) {
  const { data: occupied } = await supabase
    .from('users').select('seat_id')
    .eq('current_zone', zone).not('seat_id', 'is', null)

  if (occupied && occupied.length >= maxSeats) {
    await interaction.editReply(`❌ **${zone}** 座位已滿（${maxSeats}/${maxSeats}）`)
    return
  }

  const takenSeats = occupied.map(u => u.seat_id)
  let assignedSeat = 1
  while (takenSeats.includes(assignedSeat)) assignedSeat++

  await supabase.from('users').update({
    current_zone: zone, seat_id: assignedSeat, status: 'studying'
  }).eq('discord_id', userId)
} else {
  await supabase.from('users').update({
    current_zone: zone, seat_id: null, status: 'studying'
  }).eq('discord_id', userId)
}

      await interaction.editReply(`📚 開始專注！\n區域：**${zone}**\n加油！`)
      return
    }

    if (action === 'end') {
      console.log(`[/study end] userId=${userId}, 查詢進行中...`)
      
      const { data: sessions, error: sessionError } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('discord_id', userId)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)

      const session = sessions?.[0]
      console.log(`[/study end] 查詢結果:`, { session, error: sessionError })

      if (!session) {
        console.log(`[/study end] 未找到 session，userId=${userId}`)
        await interaction.editReply('❌ 你還沒開始專注喔！')
        return
      }

      console.log(`[/study end] 找到 session，開始計算 XP...`)
      const startTime = new Date(session.start_time + 'Z')
      const endTime = new Date()
      const durationMs = endTime.getTime() - startTime.getTime()
      const durationMin = Math.floor(durationMs / 1000 / 60)
      console.log(`[/study end] 時長: ${durationMin} 分鐘 (${Math.round(durationMs / 1000)} 秒)`)

      let xpEarned = 0
      if (durationMin >= 50) xpEarned = XP_PER_50MIN
      else if (durationMin >= 25) xpEarned = XP_PER_25MIN
      else if (durationMin >= 5) xpEarned = Math.floor(durationMin * 1.5)

      console.log(`[/study end] XP 計算: ${xpEarned}`)

      const { error: updateSessionError } = await supabase.from('study_sessions').update({
        end_time: endTime.toISOString(),
        duration_minutes: durationMin,
        xp_earned: xpEarned,
      }).eq('id', session.id)

      console.log(`[/study end] 更新 session: error=${updateSessionError}`)

      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('discord_id', userId)
        .maybeSingle()

      if (!user) {
        console.log(`[/study end] 無法獲取用戶，userId=${userId}`)
        await interaction.editReply('❌ 無法獲取用戶數據，請重試。')
        return
      }

      console.log(`[/study end] 獲取用戶成功，開始更新等級...`)
      const newXp = (user.xp || 0) + xpEarned
      const newLevel = calcLevel(newXp)
      const newTotalMin = (user.total_minutes || 0) + durationMin

      const { error: updateUserError } = await supabase.from('users').update({
        xp: newXp,
        level: newLevel,
        total_minutes: newTotalMin,
        current_zone: 'none',
        seat_id: null,
        status: 'offline',
      }).eq('discord_id', userId)

      console.log(`[/study end] 更新用戶: error=${updateUserError}`)

      const levelUp = newLevel > (user.level || 1) ? `\n🆙 **等級提升！Lv${newLevel}**` : ''

      const replyMessage = 
        `✅ 專注結束！\n` +
        `⏱ 時間：**${durationMin} 分鐘**\n` +
        `✨ 獲得 XP：**+${xpEarned}**\n` +
        `📊 總 XP：**${newXp}**${levelUp}`

      console.log(`[/study end] 準備發送回覆: ${replyMessage}`)

      try {
        await interaction.editReply(replyMessage)
        console.log(`[/study end] 回覆發送成功`)
      } catch (replyError) {
        console.error(`[/study end] 回覆發送失敗:`, replyError)
      }
      return
    }
  }
    if (interaction.commandName === 'move') {
    const zone = interaction.options.getString('zone')

    const { data: sessions, error: sessionError } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('discord_id', userId)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)

    const session = sessions?.[0]
    if (!session) {
        await interaction.editReply('❌ 你還沒開始專注！先用 `/study start` 開始。')
        return
    }

    if (session.zone === zone) {
        await interaction.editReply(`📍 你已經在 **${zone}** 了！`)
        return
    }

    // 更新 session 和 user 的區域
    await supabase
        .from('study_sessions')
        .update({ zone: zone })
        .eq('id', session.id)

    await supabase
        .from('users')
        .update({ current_zone: zone })
        .eq('discord_id', userId)

    await interaction.editReply(`🚶 移動成功！\n**${session.zone}** → **${zone}**`)
    }
  // /profile
  if (interaction.commandName === 'profile') {
    await ensureUser(userId, username)

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('discord_id', userId)
      .maybeSingle()

    if (!user) {
      await interaction.editReply('❌ 無法獲取用戶數據，請重試。')
      return
    }

    const hours = Math.floor((user.total_minutes || 0) / 60)
    const mins = (user.total_minutes || 0) % 60
    const zone = user.current_zone === 'none' ? '休息中' : user.current_zone

    await interaction.editReply(
      `📋 **${username} 的學習資料**\n` +
      `⭐ 等級：**Lv${user.level}**\n` +
      `✨ XP：**${user.xp}**\n` +
      `⏱ 總專注：**${hours}小時 ${mins}分鐘**\n` +
      `📍 目前位置：**${zone}**`
    )
    return
  }
  if (interaction.commandName === 'rank') {
  const period = interaction.options.getString('period')

  const periodLabels = {
    week: '本週',
    month: '本月',
    total: '總排行'
  }

  let rankList = ''

  if (period === 'total') {
    // 總排行：直接從 users 表拿
    const { data: users } = await supabase
      .from('users')
      .select('*')
      .order('xp', { ascending: false })
      .limit(10)

    if (!users || users.length === 0) {
      await interaction.editReply('📋 還沒有任何玩家資料！')
      return
    }

    const medals = ['🥇', '🥈', '🥉']
    rankList = users.map((user, index) => {
      const medal = medals[index] || `${index + 1}.`
      const hours = Math.floor((user.total_minutes || 0) / 60)
      const mins = (user.total_minutes || 0) % 60
      const zone = user.current_zone && user.current_zone !== 'none'
        ? ` | 📍${user.current_zone}`
        : ''
      return `${medal} **${user.username}** — Lv${user.level} | ✨${user.xp} XP | ⏱${hours}h${mins}m${zone}`
    }).join('\n')

  } else {
    // 週/月排行：從 study_sessions 計算
    const now = new Date()
    let startDate

    if (period === 'week') {
      const day = now.getDay() || 7
      startDate = new Date(now)
      startDate.setDate(now.getDate() - day + 1)
      startDate.setHours(0, 0, 0, 0)
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    }

    const { data: sessions } = await supabase
      .from('study_sessions')
      .select('discord_id, duration_minutes, xp_earned')
      .gte('start_time', startDate.toISOString())
      .not('end_time', 'is', null)

    if (!sessions || sessions.length === 0) {
      await interaction.editReply(`📋 ${periodLabels[period]}還沒有任何學習記錄！`)
      return
    }

    // 按玩家統計
    const statsMap = {}
    sessions.forEach(s => {
      if (!statsMap[s.discord_id]) {
        statsMap[s.discord_id] = { xp: 0, minutes: 0 }
      }
      statsMap[s.discord_id].xp += s.xp_earned || 0
      statsMap[s.discord_id].minutes += s.duration_minutes || 0
    })

    // 拿玩家名稱
    const discordIds = Object.keys(statsMap)
    const { data: users } = await supabase
      .from('users')
      .select('discord_id, username, level')
      .in('discord_id', discordIds)

    const userMap = {}
    users.forEach(u => { userMap[u.discord_id] = u })

    // 排序
    const sorted = Object.entries(statsMap)
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10)

    const medals = ['🥇', '🥈', '🥉']
    rankList = sorted.map(([discordId, stats], index) => {
      const medal = medals[index] || `${index + 1}.`
      const user = userMap[discordId]
      const username = user?.username || '未知玩家'
      const level = user?.level || 1
      const hours = Math.floor(stats.minutes / 60)
      const mins = stats.minutes % 60
      return `${medal} **${username}** — Lv${level} | ✨${stats.xp} XP | ⏱${hours}h${mins}m`
    }).join('\n')
  }

  await interaction.editReply(
    `🏆 **Study Town ${periodLabels[period]}排行榜**\n\n${rankList}`
  )
}
if (interaction.commandName === 'fish') {
  await ensureUser(userId, username)

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('discord_id', userId)
    .maybeSingle()

  if (!user) {
    await interaction.editReply('❌ 無法獲取用戶數據，請重試。')
    return
  }

  // 只能在湖邊釣魚
  if (user.current_zone !== '湖邊') {
    await interaction.editReply('🎣 你需要先去**湖邊**才能釣魚！\n用 `/study start zone:湖邊` 或 `/move zone:湖邊` 移動過去。')
    return
  }

  // 魚的種類和機率
  const fishTable = [
    { name: '小鯽魚',   emoji: '🐟', rarity: '普通', weight: 40, xp: 5  },
    { name: '鯉魚',     emoji: '🐠', rarity: '普通', weight: 30, xp: 8  },
    { name: '鱸魚',     emoji: '🐡', rarity: '稀有', weight: 15, xp: 15 },
    { name: '鰻魚',     emoji: '🦎', rarity: '稀有', weight: 8,  xp: 20 },
    { name: '金魚',     emoji: '🏅', rarity: '史詩', weight: 5,  xp: 35 },
    { name: '龍魚',     emoji: '🐲', rarity: '傳說', weight: 2,  xp: 80 },
  ]

  // 加權隨機抽魚
  const totalWeight = fishTable.reduce((sum, f) => sum + f.weight, 0)
  let rand = Math.random() * totalWeight
  let caught = fishTable[0]
  for (const fish of fishTable) {
    rand -= fish.weight
    if (rand <= 0) {
      caught = fish
      break
    }
  }

  // 有 10% 機率什麼都沒釣到
  if (Math.random() < 0.1) {
    await interaction.editReply('🎣 魚兒跑掉了⋯再試一次吧！')
    return
  }

  // 存入資料庫
  await supabase.from('fish_collection').insert({
    discord_id: userId,
    fish_type: caught.name,
  })

  // 給 XP
  const { data: currentUser } = await supabase
    .from('users')
    .select('xp, level')
    .eq('discord_id', userId)
    .maybeSingle()

  if (!currentUser) {
    await interaction.editReply('❌ 無法更新等級，請重試。')
    return
  }

  const newXp = (currentUser.xp || 0) + caught.xp
  const newLevel = calcLevel(newXp)
  const levelUp = newLevel > (currentUser.level || 1)
    ? `\n🆙 **等級提升！Lv${newLevel}**`
    : ''

  await supabase.from('users').update({
    xp: newXp,
    level: newLevel,
  }).eq('discord_id', userId)

  // 計算總收藏數
  const { count } = await supabase
    .from('fish_collection')
    .select('*', { count: 'exact' })
    .eq('discord_id', userId)

  const rarityStars = {
    '普通': '⚪',
    '稀有': '🔵',
    '史詩': '🟣',
    '傳說': '🟡',
  }

  await interaction.editReply(
    `🎣 **釣到了！**\n` +
    `${caught.emoji} **${caught.name}** ${rarityStars[caught.rarity]} ${caught.rarity}\n` +
    `✨ 獲得 XP：**+${caught.xp}**\n` +
    `📦 收藏數：**${count} 條**` +
    levelUp
  )
}
if (interaction.commandName === 'fishbook') {
  await ensureUser(userId, username)

  const { data: fishData } = await supabase
    .from('fish_collection')
    .select('fish_type')
    .eq('discord_id', userId)

  if (!fishData || fishData.length === 0) {
    await interaction.editReply('📖 你還沒有釣到任何魚！\n去**湖邊**用 `/fish` 開始收集吧！')
    return
  }

  // 統計每種魚的數量
  const fishCount = {}
  fishData.forEach(f => {
    fishCount[f.fish_type] = (fishCount[f.fish_type] || 0) + 1
  })

  const fishInfo = {
    '小鯽魚': { emoji: '🐟', rarity: '⚪ 普通' },
    '鯉魚':   { emoji: '🐠', rarity: '⚪ 普通' },
    '鱸魚':   { emoji: '🐡', rarity: '🔵 稀有' },
    '鰻魚':   { emoji: '🦎', rarity: '🔵 稀有' },
    '金魚':   { emoji: '🏅', rarity: '🟣 史詩' },
    '龍魚':   { emoji: '🐲', rarity: '🟡 傳說' },
  }

  const allFish = Object.keys(fishInfo)
  const totalCaught = fishData.length
  const uniqueCaught = Object.keys(fishCount).length

  const bookLines = allFish.map(name => {
    const info = fishInfo[name]
    const count = fishCount[name] || 0
    if (count > 0) {
      return `${info.emoji} **${name}** ${info.rarity} ×${count}`
    } else {
      return `❓ **???** ${info.rarity}`
    }
  }).join('\n')

  await interaction.editReply(
    `📖 **${username} 的魚類圖鑑**\n` +
    `收集進度：**${uniqueCaught} / ${allFish.length}** 種 | 總計：**${totalCaught}** 條\n\n` +
    bookLines
  )
}
  } catch (error) {
    console.error('❌ 指令處理錯誤:', error.message)
    
    // 只在交互還能回應的時候才嘗試
    try {
      if (interaction.deferred) {
        // 如果已經 defer，只能用 editReply
        await interaction.editReply('❌ 發生錯誤，請稍後重試。')
      } else if (!interaction.replied) {
        // 如果還沒有任何回應，用 reply
        await interaction.reply({ content: '❌ 發生錯誤，請稍後重試。', flags: 64 })
      }
    } catch (replyError) {
      // 交互已過期或無法回應，只記錄到console
      console.error('❌ 無法回應交互:', replyError.message)
    }
  }
}

module.exports = { commands, handleCommand }