export function getDisplayName(user) {
  if (user.avatar_mode === 'anonymous') return '同學'
  if (user.avatar_mode === 'custom') return user.display_name?.trim() || '未命名'
  return user.username || '未知玩家'
}

export function getAvatarSrc(user) {
  if (user.avatar_mode !== 'discord') return null
  if (user.discord_avatar) {
    return `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.discord_avatar}.png?size=64`
  }
  return user.avatar_url || null
}
