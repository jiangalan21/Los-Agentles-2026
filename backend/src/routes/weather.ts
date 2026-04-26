import { Router } from 'express'
import { requireAnonUser } from '../middleware/anonAuth'

const router = Router()

type GeocodeResult = {
  lat: number
  lon: number
}

router.get('/hourly', requireAnonUser, async (req, res) => {
  const rawLocation = typeof req.query.location === 'string' ? req.query.location.trim() : ''
  const apiKey = process.env.OPEN_WEATHER_API

  if (!rawLocation) {
    return res.status(400).json({ error: 'location query parameter is required' })
  }

  if (!apiKey) {
    return res.json(buildFallbackHourlyForecast(rawLocation))
  }

  try {
    const geocode = await resolveLocation(rawLocation, apiKey)
    if (!geocode) {
      return res.status(404).json({ error: 'Location not found' })
    }

    const forecastUrl =
      `https://api.openweathermap.org/data/2.5/forecast?lat=${geocode.lat}&lon=${geocode.lon}` +
      `&units=imperial&appid=${encodeURIComponent(apiKey)}`

    const forecastResponse = await fetch(forecastUrl)
    if (!forecastResponse.ok) {
      const detail = await forecastResponse.text()
      return res.status(502).json({
        error: 'OpenWeather forecast request failed',
        detail: detail.slice(0, 300),
      })
    }

    const forecastPayload = (await forecastResponse.json()) as {
      list?: Array<{
        dt: number
        dt_txt?: string
        main?: { temp?: number; feels_like?: number; humidity?: number }
        weather?: Array<{ main?: string; description?: string; icon?: string }>
        wind?: { speed?: number }
        pop?: number
      }>
      city?: { name?: string; timezone?: number }
    }

    const entries = (forecastPayload.list ?? []).slice(0, 12).map((item) => ({
      timestamp: item.dt * 1000,
      timeLabel: formatTimeLabel(item.dt, forecastPayload.city?.timezone ?? 0),
      tempF: Math.round(item.main?.temp ?? 0),
      feelsLikeF: Math.round(item.main?.feels_like ?? 0),
      humidity: Math.round(item.main?.humidity ?? 0),
      windMph: Math.round(item.wind?.speed ?? 0),
      precipitationChance: Math.round((item.pop ?? 0) * 100),
      condition: item.weather?.[0]?.main ?? 'Unknown',
      description: item.weather?.[0]?.description ?? 'No details',
      iconCode: item.weather?.[0]?.icon ?? null,
    }))

    return res.json({
      location: rawLocation,
      resolvedLocation: forecastPayload.city?.name ?? rawLocation,
      entries,
    })
  } catch (error) {
    return res.json(buildFallbackHourlyForecast(rawLocation))
  }
})

async function resolveLocation(query: string, apiKey: string): Promise<GeocodeResult | null> {
  const geocodeUrl =
    `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1` +
    `&appid=${encodeURIComponent(apiKey)}`
  const geocodeResponse = await fetch(geocodeUrl)
  if (!geocodeResponse.ok) {
    return null
  }
  const geocodePayload = (await geocodeResponse.json()) as Array<{ lat?: number; lon?: number }>
  const firstResult = geocodePayload[0]
  if (firstResult?.lat == null || firstResult?.lon == null) {
    return null
  }
  return { lat: firstResult.lat, lon: firstResult.lon }
}

function formatTimeLabel(unixSeconds: number, timezoneOffsetSeconds: number): string {
  const utcMillis = unixSeconds * 1000
  const localMillis = utcMillis + timezoneOffsetSeconds * 1000
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    hour: 'numeric',
    hour12: true,
  }).format(new Date(localMillis))
}

function buildFallbackHourlyForecast(location: string): {
  location: string
  resolvedLocation: string
  entries: Array<{
    timestamp: number
    timeLabel: string
    tempF: number
    feelsLikeF: number
    humidity: number
    windMph: number
    precipitationChance: number
    condition: string
    description: string
    iconCode: null
  }>
} {
  const now = Date.now()
  const entries = Array.from({ length: 12 }, (_, index) => {
    const timestamp = now + index * 3 * 60 * 60 * 1000
    return {
      timestamp,
      timeLabel: new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        hour: 'numeric',
        hour12: true,
      }).format(new Date(timestamp)),
      tempF: 68 + (index % 4),
      feelsLikeF: 68 + (index % 4),
      humidity: 50,
      windMph: 6,
      precipitationChance: 15,
      condition: 'Partly Cloudy',
      description: 'Using fallback forecast data',
      iconCode: null,
    }
  })

  return {
    location,
    resolvedLocation: location,
    entries,
  }
}

export default router
