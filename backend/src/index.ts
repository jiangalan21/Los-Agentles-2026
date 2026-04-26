import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import sessionRouter from './routes/session'
import preferencesRouter from './routes/preferences'
import feedbackRouter from './routes/feedback'
import profileRouter from './routes/profile'
import requestRouter from './routes/request'
import internalRouter from './routes/internal'
import mapsRouter from './routes/maps'
import weatherRouter from './routes/weather'

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
app.use('/feedback', feedbackRouter)
app.use('/profile', profileRouter)
app.use('/request', requestRouter)
app.use('/internal', internalRouter)
app.use('/maps', mapsRouter)
app.use('/weather', weatherRouter)

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
