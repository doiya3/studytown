const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const express = require('express')
const http = require('http')
const cors = require('cors')

const usersRouter = require('./routes/users')
const studyRouter = require('./routes/study')
const teamsRouter = require('./routes/teams')
const { setupWebSocket } = require('./ws/handler')

const app = express()

app.use(cors({
  origin: (origin, callback) => {
    // 允許 GitHub Pages、本機 localhost、127.0.0.1、區網 IP
    if (!origin || origin === 'https://doiya3.github.io' ||
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))
app.use(express.json())

app.use('/api/users', usersRouter)
app.use('/api/study', studyRouter)
app.use('/api/teams', teamsRouter)

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Study Town server is running' })
})

const server = http.createServer(app)

setupWebSocket(server)

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`[Server] 伺服器啟動於 port ${PORT}`)
})
