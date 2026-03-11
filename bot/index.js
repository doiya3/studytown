const { Client, GatewayIntentBits, REST, Routes } = require('discord.js')
const { commands, handleCommand } = require('./commands')
require('dotenv').config()

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ]
})

// Bot 上線時
client.once('clientReady', async () => {
  console.log(`✅ ${client.user.tag} 上線了！`)

  // 註冊 Slash Commands
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)
  try {
    await rest.put(
    Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
    { body: commands }
    )
    console.log('✅ Slash Commands 註冊成功')
    } catch (error) {
    console.error('❌ 註冊失敗：', error)
  }
})

// 收到指令時
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return
  try {
    await handleCommand(interaction)
  } catch (error) {
    // 交互過期的錯誤可以安全忽略
    if (error.code === 10062 || error.code === 40060) {
      console.warn('⚠️ 交互已過期，已忽略')
      return
    }
    console.error('❌ Interaction error:', error)
  }
})

// 錯誤處理
client.on('error', (error) => {
  console.error('❌ Client error:', error)
})

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error)
})

client.login(process.env.DISCORD_TOKEN)