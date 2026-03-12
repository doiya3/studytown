const DISCORD_CLIENT_ID = '1481185806663159808'

// 自動偵測環境：只有在 GitHub Pages 才用 GitHub URL，其他（localhost/127.0.0.1/LAN IP）一律用本機
const REDIRECT_URI = window.location.hostname === 'doiya3.github.io'
  ? 'https://doiya3.github.io/studytown/web/index.html'
  : `${window.location.origin}/web/index.html`

// 取得 Discord 應用程式 ID
// Developer Portal → 你的應用程式 → 左側 General Information → Application ID

export function loginWithDiscord() {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: 'identify',
  })
  window.location.href = `https://discord.com/oauth2/authorize?${params}`
}

export function getTokenFromURL() {
  const hash = window.location.hash.substring(1)
  const params = new URLSearchParams(hash)
  return params.get('access_token')
}

export async function fetchDiscordUser(token) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token}` }
  })
  return await res.json()
}

export function saveSession(user, token) {
  const avatarURL = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/0.png`
  localStorage.setItem('study_token', token)
  localStorage.setItem('study_user', JSON.stringify({ ...user, avatar_url: avatarURL }))
}

export function loadSession() {
  const token = localStorage.getItem('study_token')
  const user = localStorage.getItem('study_user')
  if (token && user) return { token, user: JSON.parse(user) }
  return null
}

export function clearSession() {
  localStorage.removeItem('study_token')
  localStorage.removeItem('study_user')
}
