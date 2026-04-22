const express = require('express')
const http = require('http')
const path = require('path')
const { Server } = require('socket.io')
const { registerHandlers } = require('./socketHandlers')

const app = express()
const httpServer = http.createServer(app)

const io = new Server(httpServer, {
  cors: { origin: '*' }
})

// Serve built client in production
const clientDist = path.join(__dirname, '../../client/dist')
app.use(express.static(clientDist))
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'))
})

registerHandlers(io)

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
