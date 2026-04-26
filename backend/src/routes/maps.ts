import { Router } from 'express'

const router = Router()

router.get('/preview-image', async (req, res) => {
  const rawLocation = typeof req.query.location === 'string' ? req.query.location.trim() : ''

  if (!rawLocation) {
    return res.status(400).json({ error: 'location query parameter is required' })
  }

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN
  if (!accessToken) {
    return res.status(503).json({ error: 'MAPBOX_ACCESS_TOKEN is not configured' })
  }

  try {
    const geocodeUrl =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(rawLocation)}.json` +
      `?limit=1&access_token=${encodeURIComponent(accessToken)}`
    const geocodeResponse = await fetch(geocodeUrl)
    if (!geocodeResponse.ok) {
      const detail = await geocodeResponse.text()
      return res.status(502).json({
        error: 'Mapbox geocoding request failed',
        detail: detail.slice(0, 300),
      })
    }

    const geocodePayload = (await geocodeResponse.json()) as {
      features?: Array<{ center?: [number, number] }>
    }
    const center = geocodePayload.features?.[0]?.center
    if (!center || center.length !== 2) {
      return res.status(404).json({ error: 'No map location found for provided query' })
    }
    const [longitude, latitude] = center

    const markerOverlay = `pin-s+e74c3c(${longitude},${latitude})`
    const staticMapUrl =
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${markerOverlay}/${longitude},${latitude},12/680x680` +
      `?access_token=${encodeURIComponent(accessToken)}`

    const response = await fetch(staticMapUrl)
    if (!response.ok) {
      const detail = await response.text()
      return res.status(502).json({
        error: 'Mapbox Static Images request failed',
        detail: detail.slice(0, 300),
      })
    }

    const contentType = response.headers.get('content-type') ?? 'image/png'
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=1800')
    return res.status(200).send(buffer)
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch static map image',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
