/* Логика фильтра каталога (ядро). Тот же код встроен в index.html.
   Категории - ИЛИ, удобства - И, между группами - И.
   Занятость: busy = [[сдвиг от сегодня в днях, ночей], ...]. Ночь с заезда до выезда (выезд не занимает ночь). */
(function (root) {
  var DAY = 86400000;
  function dayIndex(date, base) { return Math.round((date - base) / DAY); }
  function isFree(house, from, to, base) {
    if (!from || !to) return true;
    var a = dayIndex(from, base), b = dayIndex(to, base);
    for (var i = 0; i < house.busy.length; i++) {
      var s = house.busy[i][0], e = s + house.busy[i][1];
      if (s < b && a < e) return false;
    }
    return true;
  }
  function filterHouses(houses, f, base) {
    return houses.filter(function (h) {
      if (f.cats && f.cats.length && f.cats.indexOf(h.cat) === -1) return false;
      if (f.am && f.am.length) {
        for (var i = 0; i < f.am.length; i++) if (h.am.indexOf(f.am[i]) === -1) return false;
      }
      if (f.guests && h.guests < f.guests) return false;
      if (!isFree(h, f.from, f.to, base)) return false;
      return true;
    });
  }
  root.KD = { filterHouses: filterHouses, isFree: isFree, DAY: DAY };
})(typeof window !== "undefined" ? window : globalThis);
