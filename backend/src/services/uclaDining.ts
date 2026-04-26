import * as cheerio from 'cheerio'

const UCLA_MENU_URL = 'https://dining.ucla.edu/Menus'
const CACHE_TTL_MS = 5 * 60 * 1_000

export type DishItem = {
  name: string
  recipeId: string | null
  allergens: string[]
}

export type MealWindow = {
  dishes: DishItem[]
}

export type UCLAMenuSnapshot = {
  date: string
  diningHall: string
  breakfast: MealWindow
  lunch: MealWindow
  dinner: MealWindow
}

type CacheEntry = {
  snapshot: UCLAMenuSnapshot
  fetchedAt: number
}

let _cache: CacheEntry | null = null

export async function fetchUCLAMenu(): Promise<UCLAMenuSnapshot | null> {
  const now = Date.now()
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.snapshot
  }

  try {
    const response = await fetch(UCLA_MENU_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LosAgentles/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new Error(`UCLA menu fetch failed: ${response.status}`)
    }
    const html = await response.text()
    const snapshot = parseMenuHtml(html)
    _cache = { snapshot, fetchedAt: now }
    return snapshot
  } catch (err) {
    console.error('[uclaDining] fetch error:', err)
    return null
  }
}

function parseMenuHtml(html: string): UCLAMenuSnapshot {
  const $ = cheerio.load(html)

  // Extract the displayed date from the page heading
  const dateText =
    $('h1, h2, h3')
      .filter((_, el) => /menu for/i.test($(el).text()))
      .first()
      .text()
      .replace(/.*menu for/i, '')
      .trim() || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  // Identify the first dining hall section (usually De Neve or Bruin Plate)
  const diningHall =
    $('h3')
      .filter((_, el) => /de neve|bruin plate|feast|epicuria/i.test($(el).text()))
      .first()
      .text()
      .trim() || 'De Neve Dining'

  const breakfast = extractMealWindow($, 'breakfast')
  const lunch = extractMealWindow($, 'lunch')
  const dinner = extractMealWindow($, 'dinner')

  return { date: dateText, diningHall, breakfast, lunch, dinner }
}

function extractMealWindow($: cheerio.CheerioAPI, period: 'breakfast' | 'lunch' | 'dinner'): MealWindow {
  const dishes: DishItem[] = []

  // Find the heading that matches the meal period
  const heading = $('h2, h3, h4')
    .filter((_, el) => new RegExp(period, 'i').test($(el).text()))
    .first()

  if (!heading.length) {
    return { dishes }
  }

  // Walk siblings until the next period heading or end
  let node = heading.next()
  while (node.length) {
    const tag = node[0].type === 'tag' ? (node[0] as cheerio.Element & { name: string }).name : ''
    // Stop at the next major heading (another meal period)
    if (/^h[2-4]$/.test(tag) && /breakfast|lunch|dinner/i.test(node.text())) {
      break
    }

    // Collect all anchor links pointing to /menu-item/
    node.find('a[href*="/menu-item/"]').each((_, el) => {
      const name = $(el).text().trim()
      if (!name) return

      const href = $(el).attr('href') ?? ''
      const recipeMatch = href.match(/recipe=(\d+)/)
      const recipeId = recipeMatch ? recipeMatch[1] : null

      // Parse allergen SVG alt texts or title attributes adjacent to the link
      const allergens: string[] = []
      $(el)
        .nextAll('img, svg')
        .slice(0, 6)
        .each((_, img) => {
          const alt = $(img).attr('alt') ?? $(img).attr('title') ?? ''
          if (alt) allergens.push(alt.trim())
        })

      dishes.push({ name, recipeId, allergens })
    })

    node = node.next()
  }

  return { dishes }
}
