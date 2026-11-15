// Проверка логики фильтра: node prototype/test-filter.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
await import(path.join(dir, "filter-core.js").replace(/\\/g, "/").replace(/^([A-Z]):/, "file:///$1:"));
const { filterHouses, DAY } = globalThis.KD;
const houses = JSON.parse(fs.readFileSync(path.join(dir, "../data/houses.json"), "utf8"));
const base = new Date(2026, 10, 14);
const d = (n) => new Date(base.getTime() + n * DAY);
const ids = (f) => filterHouses(houses, f, base).map((h) => h.id).join(",");

const cases = [
  ["без фильтров - все 16", {}, "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16"],
  ["бассейн - ровно 3 дома", { am: ["pool"] }, "6,9,13"],
  ["бассейн + чан (И)", { am: ["pool", "chan"] }, "9"],
  ["бассейн + банкет (И)", { am: ["pool", "hall"] }, "9,13"],
  ["чан + баня (И)", { am: ["chan", "banya"] }, "2,5,9,11,16"],
  ["до 6 (одна категория)", { cats: ["s"] }, "1,2,3,4"],
  ["до 6 ИЛИ до 50", { cats: ["s", "xl"] }, "1,2,3,4,13,14,15,16"],
  ["до 6 + бассейн - пусто", { cats: ["s"], am: ["pool"] }, ""],
  ["(до 30 ИЛИ до 50) + банкет + баня", { cats: ["l", "xl"], am: ["hall", "banya"] }, "9,10,13,16"],
  ["все 5 удобств", { am: ["pool", "chan", "banya", "grill", "hall"] }, "9"],
  ["гостей 20+", { guests: 20 }, "9,10,11,12,13,14,15,16"],
  // даты: дом 1 занят ночи 1-2 (дни 1..2), выезд в день 1 - свободен
  ["даты 0→1: дом 2 занят (ночи 0-2), 1,3,4 свободны", { from: d(0), to: d(1), cats: ["s"] }, "1,3,4"],
  ["даты 1→3: дом 1 занят", { from: d(1), to: d(3), cats: ["s"] }, "4"],
  ["даты 3→5: заезд в день выезда прошлых гостей", { from: d(3), to: d(5), cats: ["s"] }, "1,2"],
  ["даты 6→7 + до 6: 1 занят, 2,3,4 ?", { from: d(6), to: d(7), cats: ["s"] }, "2,3"],
];
let fail = 0;
for (const [name, f, want] of cases) {
  const got = ids(f);
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? "OK   " : "FAIL ") + name + (ok ? "" : `  ждали [${want}] получили [${got}]`));
}
console.log(fail ? `Ошибок: ${fail}` : "Все проверки пройдены");
process.exit(fail ? 1 : 0);
