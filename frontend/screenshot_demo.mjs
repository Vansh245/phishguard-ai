import puppeteer from 'puppeteer'
import path from 'path'
import { fileURLToPath } from 'url'

const OUT = 'C:/Users/Vansh/.gemini/antigravity/brain/3622e0da-c4ac-4560-9afa-f49847381191'
const BASE = 'http://localhost:5173'

async function shot(page, name, waitMs = 1200) {
  await new Promise(r => setTimeout(r, waitMs))
  const file = `${OUT}/live_${name}.png`
  await page.screenshot({ path: file, fullPage: false })
  console.log(`✅ Saved: live_${name}.png`)
}

;(async () => {
  console.log('Launching headless browser...')
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  })

  const page = await browser.newPage()

  // ── 1. Dashboard ──────────────────────────────────────────────
  console.log('\n📸 Step 1: Dashboard')
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
  await shot(page, '01_dashboard')

  // ── 2. URL Scanner (empty) ────────────────────────────────────
  console.log('\n📸 Step 2: URL Scanner')
  await page.goto(`${BASE}/scanner`, { waitUntil: 'networkidle0' })
  await shot(page, '02_scanner')

  // ── 3. Scan a phishing URL (click Typosquat chip) ─────────────
  console.log('\n📸 Step 3: Clicking Typosquat example...')
  // Find and click the first quick chip (🎣 Typosquat)
  const chips = await page.$$('.quick-url-chip.phishing')
  if (chips.length > 0) {
    await chips[0].click()
    console.log('  Clicked Typosquat chip, waiting for scan...')
    await new Promise(r => setTimeout(r, 1200))
    await shot(page, '03_scanning', 400)
    // Wait for result
    await new Promise(r => setTimeout(r, 2500))
    await shot(page, '04_scanner_result')
  } else {
    // Fallback: type URL manually
    await page.focus('#url-input')
    await page.type('#url-input', 'http://paypa1-secure-login.tk/account/verify')
    await page.click('#scan-btn')
    await new Promise(r => setTimeout(r, 3500))
    await shot(page, '04_scanner_result')
  }

  // ── 4. Campaign Graph (run clustering) ────────────────────────
  console.log('\n📸 Step 4: Campaign Graph')
  await page.goto(`${BASE}/campaigns`, { waitUntil: 'networkidle0' })
  await shot(page, '05_campaign_empty')

  // Click Run Clustering button
  const clusterBtns = await page.$$('.btn.btn-primary')
  for (const btn of clusterBtns) {
    const txt = await btn.evaluate(el => el.textContent)
    if (txt.includes('Clustering') || txt.includes('Run')) {
      await btn.click()
      break
    }
  }
  console.log('  Waiting for clustering...')
  await new Promise(r => setTimeout(r, 3000))
  await shot(page, '06_campaign_graph')

  // ── 5. Brand Shield ───────────────────────────────────────────
  console.log('\n📸 Step 5: Brand Shield')
  await page.goto(`${BASE}/fingerprint`, { waitUntil: 'networkidle0' })
  await shot(page, '07_brand_shield')

  // ── 6. Tech Stack ─────────────────────────────────────────────
  console.log('\n📸 Step 6: Tech Stack')
  await page.goto(`${BASE}/tech`, { waitUntil: 'networkidle0' })
  await shot(page, '08_tech_stack')
  // Scroll down to see more
  await page.evaluate(() => window.scrollBy(0, 600))
  await shot(page, '09_tech_stack_cards', 600)

  await browser.close()
  console.log('\n🎉 All screenshots captured!')
})()
