import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('../.tmp/kottedzhi-check');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
const page = await context.newPage();
const errors = [];
const failed = [];
const notFound = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
page.on('requestfailed', r => {
  // При смене размеров страница перезагружается и Chromium отменяет ещё не завершённые тайлы OSM.
  const navigationAbort = r.url().includes('tile.openstreetmap.org') && r.failure()?.errorText === 'net::ERR_ABORTED';
  if (!navigationAbort) failed.push(`${r.url()} :: ${r.failure()?.errorText}`);
});
page.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });
const checks = [];
function check(name, condition, details = '') {
  checks.push({ name, ok: Boolean(condition), details });
  if (!condition) console.error('FAIL', name, details);
}
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 10);
const after = new Date(); after.setDate(after.getDate() + 12);
const val = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

await page.goto('http://127.0.0.1:7100/', { waitUntil: 'networkidle', timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.house-card').first().waitFor();
check('Загружены 16 домов', await page.locator('.house-card').count() === 16);
check('Все локальные скрипты запущены', await page.evaluate(() => Boolean(window.KD && window.L && window.lucide)));
check('На карте 16 меток', await page.locator('.house-marker').count() === 16);
for (const card of await page.locator('.house-card').all()) {
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
}
await page.waitForFunction(() => [...document.querySelectorAll('.house-card img')].every(img => img.complete && img.naturalWidth > 0));
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: path.join(out, 'desktop.jpg'), fullPage: true, type: 'jpeg', quality: 80 });

for (const [amenity, expected, title] of [
  ['pool', 3, 'Тёплый бассейн'],
  ['chan', 8, 'Банный чан'],
  ['banya', 10, 'Баня или сауна'],
  ['grill', 16, 'Мангальная зона'],
  ['hall', 8, 'Банкетный зал']
]) {
  await page.locator(`input[name="am"][value="${amenity}"]`).check();
  check(`${title}: верное число домов`, await page.locator('.house-card').count() === expected, await page.locator('#results-count').textContent());
  await page.locator('#reset-filters').click();
}

await page.locator('input[name="am"][value="pool"]').check();
await page.locator('input[name="am"][value="chan"]').check();
check('Бассейн + чан: один дом', await page.locator('.house-card').count() === 1, await page.locator('#results-count').textContent());
await page.locator('#reset-filters').click();
await page.locator('#filter-from').fill('2026-11-17');
await page.locator('#filter-to').fill('2026-11-21');
await page.locator('input[name="am"][value="pool"]').check();
await page.locator('#filter-form button[type="submit"]').click();
check('Занятые даты: объяснён пустой результат', await page.locator('#empty-title').textContent() === 'На эти даты свободных домов нет');
check('Занятые даты: доступен показ без дат', await page.locator('#empty-without-dates').isVisible());
await page.locator('#empty-without-dates').click();
check('Показ без дат возвращает три дома с бассейном', await page.locator('.house-card').count() === 3);
check('Показ без дат очищает только даты', await page.locator('#filter-from').inputValue() === '' && await page.locator('#filter-to').inputValue() === '' && await page.locator('input[name="am"][value="pool"]').isChecked());
await page.locator('#reset-filters').click();
await page.locator('input[name="cat"][value="s"]').check();
await page.locator('input[name="cat"][value="xl"]').check();
check('Две категории: восемь домов', await page.locator('.house-card').count() === 8);
await page.locator('input[name="cat"][value="xl"]').locator('..').click();
await page.locator('input[name="am"][value="pool"]').check();
check('Пустое состояние отображается', await page.locator('#empty-state').isVisible());
await page.locator('#empty-reset').click();
await page.locator('#sort-houses').selectOption('price-asc');
check('Сортировка по цене работает', /5\s*900/.test(await page.locator('.house-price').first().textContent()));
await page.locator('#sort-houses').selectOption('default');

await page.locator('#quick-from').fill(val(tomorrow));
await page.locator('#quick-to').fill(val(after));
await page.locator('#quick-guests').fill('6');
await page.locator('#quick-search button[type="submit"]').click();
await page.waitForTimeout(500);
check('Быстрый подбор применил даты', await page.locator('#filter-from').inputValue() === val(tomorrow) && await page.locator('#filter-to').inputValue() === val(after));
check('Быстрый подбор показал результаты', await page.locator('.house-card').count() > 0);

await page.locator('.house-open').first().click();
check('Карточка дома открылась', await page.locator('#house-dialog').isVisible());
const selectedHouse = await page.locator('#dialog-title').textContent();
const before = await page.locator('#dialog-image').getAttribute('src');
await page.locator('#gallery-next').click();
check('Галерея переключает фото', before !== await page.locator('#dialog-image').getAttribute('src'));
await page.locator('#request-form button[type="submit"]').click();
check('Форма показывает ошибки', await page.locator('#request-error').isVisible());
await page.locator('#request-name').fill('Андрей');
await page.locator('#request-phone').fill('+7 900 123-45-67');
await page.locator('#request-guests').fill('2');
await page.locator('#request-form button[type="submit"]').click();
check('Заявка сохранена и обращение сформировано', await page.locator('#request-result').isVisible());
check('В обращении есть данные гостя', (await page.locator('#request-text').inputValue()).includes('Андрей'));
const savedLeads = await page.evaluate(() => JSON.parse(localStorage.getItem('kottedzhi-demo-leads-v1') || '[]'));
check('Заявка записана в локальное хранилище', savedLeads.length === 1 && savedLeads[0].houseName === selectedHouse && savedLeads[0].phone === '+7 900 123-45-67' && savedLeads[0].guests === 2 && savedLeads[0].nights === 2, JSON.stringify(savedLeads));
check('Удобства и даты записаны полностью', savedLeads.length === 1 && savedLeads[0].from === val(tomorrow) && savedLeads[0].to === val(after) && Array.isArray(savedLeads[0].amenities) && Array.isArray(savedLeads[0].selectedFilters));
check('Счётчик заявок обновился', await page.locator('[data-leads-count]').first().textContent() === '1');
await page.screenshot({ path: path.join(out, 'dialog.jpg'), type: 'jpeg', quality: 82 });
await page.locator('#copy-request').click();
check('Текст действительно попадает в буфер обмена', (await page.evaluate(() => navigator.clipboard.readText())).includes('Андрей'));
check('Уведомление видно поверх карточки', await page.locator('#toast').isVisible() && await page.locator('#toast').evaluate(el => el.matches(':popover-open')));

await page.locator('#request-result [data-open-leads]').click();
check('Журнал открывается из сохранённой заявки', await page.locator('#leads-dialog').isVisible() && !(await page.locator('#house-dialog').isVisible()));
const leadRow = await page.locator('#leads-body tr').first().textContent();
check('В журнале видны все основные данные', ['Андрей', '+7 900 123-45-67', selectedHouse, '2'].every(text => leadRow.includes(text)), leadRow);
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, 'leads-desktop.jpg'), type: 'jpeg', quality: 85 });
const downloadPromise = page.waitForEvent('download');
await page.locator('#export-leads').click();
const download = await downloadPromise;
const csv = fs.readFileSync(await download.path(), 'utf8');
check('Скачивается CSV для Excel', download.suggestedFilename().endsWith('.csv') && csv.startsWith('\uFEFF"Номер"'), download.suggestedFilename());
check('CSV содержит русские заголовки и данные заявки', ['Дом', 'Заезд', 'Выезд', 'Ночей', 'Гостей', 'Телефон', 'Удобства дома', 'Выбранные фильтры', selectedHouse, 'Андрей'].every(text => csv.includes(text)));
check('CSV защищает телефон от формул Excel', csv.includes('"\'+7 900 123-45-67"'));
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: path.join(out, 'leads-mobile.jpg'), type: 'jpeg', quality: 85 });
check('Журнал не создаёт горизонтальную прокрутку страницы', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
await page.setViewportSize({ width: 1440, height: 1000 });
await page.keyboard.press('Escape');
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.house-card').first().waitFor();
check('Заявка сохраняется после перезагрузки', await page.locator('[data-leads-count]').first().textContent() === '1');
await page.locator('.desktop-nav [data-open-leads]').click();
check('После перезагрузки запись видна в журнале', await page.locator('#leads-body tr').count() === 1);
page.once('dialog', d => d.accept());
await page.locator('#clear-leads').click();
check('Очистка журнала работает', await page.locator('#leads-empty').isVisible() && await page.locator('[data-leads-count]').first().textContent() === '0');
await page.keyboard.press('Escape');

for (const href of ['#catalog', '#how', '#map-section']) {
  await page.locator(`.desktop-nav a[href="${href}"]`).click();
  await page.waitForTimeout(250);
  check(`Навигация ${href} работает`, await page.evaluate(id => location.hash === id, href));
}
await page.locator('.faq-list details').first().locator('summary').click();
check('FAQ раскрывается', await page.locator('.faq-list details').first().getAttribute('open') !== null);

const widths = {};
for (const width of [360, 375, 390, 430, 768, 1024, 1440]) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('http://127.0.0.1:7100/', { waitUntil: 'networkidle' });
  await page.locator('.house-card').first().waitFor();
  widths[width] = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  check(`Нет горизонтальной прокрутки на ${width}px`, widths[width].scroll <= widths[width].client, JSON.stringify(widths[width]));
}
await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://127.0.0.1:7100/', { waitUntil: 'networkidle' });
await page.locator('#menu-toggle').click();
check('Мобильное меню открывается', await page.locator('#mobile-menu').isVisible());
await page.locator('#mobile-menu a[href="#catalog"]').click();
check('Ссылка мобильного меню закрывает меню', !(await page.locator('#mobile-menu').isVisible()));
await page.locator('#filter-toggle').click();
check('Мобильные фильтры открываются', await page.locator('#filters').isVisible());
await page.locator('#filter-toggle').click();
for (const card of await page.locator('.house-card').all()) {
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
}
await page.waitForFunction(() => [...document.querySelectorAll('.house-card img')].every(img => img.complete && img.naturalWidth > 0));
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: path.join(out, 'mobile.jpg'), fullPage: true, type: 'jpeg', quality: 78 });
await page.screenshot({ path: path.join(out, 'mobile-hero.jpg'), type: 'jpeg', quality: 85 });
await page.locator('.house-open').first().click();
await page.waitForTimeout(350);
await page.screenshot({ path: path.join(out, 'mobile-dialog.jpg'), type: 'jpeg', quality: 82 });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(r => ({ name: r.name, bytes: r.transferSize })));
const localBytes = resources.filter(r => r.name.startsWith('http://127.0.0.1')).reduce((sum, r) => sum + r.bytes, 0);
check('Нет ошибок консоли', errors.length === 0, errors.join('\n'));
check('Нет HTTP 404', notFound.length === 0, notFound.join('\n'));
check('Нет неудачных запросов', failed.length === 0, failed.join('\n'));
const report = { checks, errors, failed, notFound, requests: resources.length, localBytes };
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: checks.filter(c => c.ok).length, failed: checks.filter(c => !c.ok).length, errors, requestFailures: failed, notFound, requests: resources.length, localBytes }, null, 2));
await browser.close();
process.exit(checks.some(c => !c.ok) ? 1 : 0);
