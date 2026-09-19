/**
 * End-to-end smoke test against a built site.
 *
 * Unit tests cover the arithmetic; this covers the thing the arithmetic is
 * wrapped in — that the page renders, that the verdict actually changes when
 * the inputs do, that both charts draw, and that nothing overflows on a phone.
 *
 * Usage: npm run build && npm run smoke
 * Override the target with SMOKE_URL, and the browser with CHROMIUM_PATH.
 */
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL ?? 'http://localhost:4173/';
const launchOptions = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {};

const failures = [];
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
};

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.verdict h2', { timeout: 15000 });

  console.log('\nA large balance on a modest salary');
  await page.fill('#plan2-balance', '50000');
  await page.fill('#salary', '38000');
  await page.fill('#lump-sum', '10000');
  await page.waitForTimeout(300);
  let code = await verdictCode(page);
  check('recommends keeping your money when the debt is written off', code === 'do-not-overpay', code);

  console.log('\nCareer assumptions');
  await page.fill('#real-growth', '2');
  await page.fill('#real-growth-years', '10');
  await page.waitForTimeout(300);
  check('accepts above-inflation pay growth and a horizon for it',
    (await page.locator('#real-growth').inputValue()) === '2' &&
    (await page.locator('#real-growth-years').inputValue()) === '10');

  console.log('\nThe discount rate');
  await page.locator('details.advanced summary').click();
  const discountNote = async () =>
    (await page.locator('.rates-note').last().textContent()) ?? '';
  check('defaults to a gilt yield and says which', /gilt yield/i.test(await discountNote()),
    await discountNote());

  console.log('\nA small balance on a high salary');
  await page.fill('#plan2-balance', '8000');
  await page.fill('#salary', '85000');
  await page.fill('#lump-sum', '8000');
  // Drive the alternative return down so the loan is clearly the worse deal.
  await page.fill('#discount-override', '1');
  await page.waitForTimeout(300);
  code = await verdictCode(page);
  check('recommends overpaying when the loan costs more than the alternative',
    code === 'overpay', code);

  console.log('\nWhen the money earns more elsewhere');
  await page.fill('#discount-override', '15');
  await page.waitForTimeout(300);
  code = await verdictCode(page);
  check('flips to keeping your money at a high alternative return',
    code === 'do-not-overpay', code);

  await page.fill('#discount-override', '0');
  await page.waitForTimeout(300);
  check('falls back to a gilt yield when the override is cleared',
    /gilt yield/i.test(await discountNote()), await discountNote());

  console.log('\nBoth loans at once');
  await page.check('#has-postgrad');
  await page.waitForTimeout(300);
  check('offers a target for overpayments', (await page.locator('#target').count()) === 1);
  check('breaks results down per loan', (await page.locator('table.compare').count()) >= 2);

  console.log('\nRendering');
  check('draws both charts', (await page.locator('.recharts-surface').count()) >= 2);
  const stats = await page.locator('.stat .value').allTextContents();
  check('fills every headline figure', stats.length === 4 && stats.every((s) => s.trim()), stats.join(' | '));

  console.log('\nNo loans selected');
  await page.uncheck('#has-plan2');
  await page.uncheck('#has-postgrad');
  await page.waitForTimeout(300);
  check('prompts for input instead of erroring', (await page.locator('.empty-state').count()) === 1);
  await page.check('#has-plan2');
  await page.waitForTimeout(300);

  console.log('\nOn a phone');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(400);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  check('does not scroll sideways', scrollWidth <= 391, `scrollWidth ${scrollWidth}`);

  check('logs no console errors', consoleErrors.length === 0, consoleErrors.join('; '));
} finally {
  await browser.close();
}

async function verdictCode(page) {
  const className = await page.getAttribute('.verdict', 'class');
  return (className ?? '').replace('verdict', '').trim();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
