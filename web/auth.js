const DISCORD_CLIENT_ID = '1481185806663159808'
const REDIRECT_URI = 'https://doiya3.github.io/studytown/web/index.html'

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
  localStorage.setItem('study_token', token)
  localStorage.setItem('study_user', JSON.stringify(user))
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
