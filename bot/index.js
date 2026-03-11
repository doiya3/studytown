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
client.once('ready', async () => {
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
  await handleCommand(interaction)
})

client.login(process.env.DISCORD_TOKEN)