import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';

const browser = await puppeteer.launch({
  headless: false,
  userDataDir: '/tmp/puppeteer-fiverr-profile',
  args: ['--window-size=1280,900'],
  defaultViewport: { width: 1280, height: 900 },
  slowMo: 30,
});

const page = (await browser.pages())[0];

// Navigate to Fiverr
console.log('[1] Navigating to Fiverr...');
await page.goto('https://www.fiverr.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

// Check if logged in
const isLoggedIn = await page.evaluate(() => {
  return !!document.querySelector('[href*="seller_dashboard"]') ||
         !!document.querySelector('.user-profile-image') ||
         document.cookie.includes('access_token');
}).catch(() => false);

if (!isLoggedIn) {
  console.log('[!] Not logged in. Please log in manually...');
  await page.goto('https://www.fiverr.com/login', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const url = page.url();
    if (!url.includes('login')) break;
  }
}

// Go to briefs/buyer requests
console.log('[2] Opening Buyer Requests...');
await page.goto('https://www.fiverr.com/users/takuya024/seller_dashboard/briefs', {
  waitUntil: 'networkidle2',
  timeout: 30000,
});
await new Promise(r => setTimeout(r, 3000));

// Try matching briefs page
console.log('[3] Extracting briefs...');
const briefs = await page.evaluate(() => {
  const results = [];
  // Try multiple selectors for brief cards
  const cards = document.querySelectorAll(
    '[class*="brief"], [class*="request"], [class*="Brief"], [data-testid*="brief"]'
  );
  for (const card of cards) {
    const title = card.querySelector('h3, h4, [class*="title"]')?.textContent?.trim() || '';
    const desc = card.querySelector('p, [class*="desc"]')?.textContent?.trim() || '';
    const budget = card.querySelector('[class*="budget"], [class*="price"]')?.textContent?.trim() || '';
    const link = card.querySelector('a')?.href || '';
    if (title || desc) {
      results.push({ title, desc: desc.slice(0, 200), budget, link });
    }
  }

  // Fallback: get all text content for debugging
  if (results.length === 0) {
    const main = document.querySelector('main, [role="main"], #main');
    return { raw: (main || document.body).innerText.slice(0, 3000), cards: 0 };
  }
  return { briefs: results, cards: results.length };
}).catch(e => ({ error: e.message }));

console.log('\n=== Results ===');
if (briefs.briefs) {
  console.log(`Found ${briefs.cards} briefs:`);
  for (const b of briefs.briefs) {
    console.log(`\n  Title: ${b.title}`);
    console.log(`  Budget: ${b.budget}`);
    console.log(`  Desc: ${b.desc}`);
    if (b.link) console.log(`  Link: ${b.link}`);
  }
} else if (briefs.raw) {
  console.log(`No structured briefs found. Page content:`);
  console.log(briefs.raw.slice(0, 2000));
} else {
  console.log('Error:', briefs.error || 'Unknown');
}

// Screenshot for review
await page.screenshot({ path: '/tmp/fiverr-briefs.png', fullPage: true });
console.log('\nScreenshot saved: /tmp/fiverr-briefs.png');

// Keep browser open for manual inspection
console.log('\nPress Ctrl+C to close browser.');
await new Promise(() => {}); // Keep alive
