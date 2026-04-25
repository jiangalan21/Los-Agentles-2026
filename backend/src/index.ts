import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import sessionRouter from './routes/session'
import preferencesRouter from './routes/preferences'

dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/session', sessionRouter)
app.use('/preferences', preferencesRouter)

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
