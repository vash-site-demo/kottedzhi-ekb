/* Интерактивность демонстрационного каталога: фильтры, галерея, форма и карта. */
(function () {
  "use strict";

  const DAY = 86400000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const amenities = {
    pool: { label: "Тёплый бассейн", short: "Бассейн", icon: "waves" },
    chan: { label: "Банный чан", short: "Чан", icon: "bath" },
    banya: { label: "Баня или сауна", short: "Баня", icon: "flame" },
    grill: { label: "Мангальная зона", short: "Мангал", icon: "cooking-pot" },
    hall: { label: "Банкетный зал", short: "Банкетный зал", icon: "wine" }
  };

  const STORAGE_KEY = "kottedzhi-demo-leads-v1";
  const state = { houses: [], filtered: [], currentHouse: null, imageIndex: 0, lastFocus: null, leads: [], leadsLastFocus: null };
  const grid = $("#house-grid");
  const filterForm = $("#filter-form");
  const dialog = $("#house-dialog");
  const leadsDialog = $("#leads-dialog");

  function loadLeads() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      state.leads = Array.isArray(saved) ? saved : [];
    } catch (error) {
      state.leads = [];
    }
  }

  function saveLeads() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.leads));
      return true;
    } catch (error) {
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function updateLeadCounters() {
    $$('[data-leads-count]').forEach((element) => { element.textContent = state.leads.length; });
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
  }

  function dateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(value) {
    if (!value) return "даты не выбраны";
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
  }

  function pluralHouses(number) {
    const mod10 = number % 10;
    const mod100 = number % 100;
    if (mod10 === 1 && mod100 !== 11) return "дом";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дома";
    return "домов";
  }

  function setDateLimits() {
    const min = dateValue(today);
    const tomorrow = dateValue(new Date(today.getTime() + DAY));
    ["#quick-from", "#filter-from", "#request-from"].forEach((id) => { $(id).min = min; });
    ["#quick-to", "#filter-to", "#request-to"].forEach((id) => { $(id).min = tomorrow; });
  }

  function linkDatePair(fromSelector, toSelector) {
    const from = $(fromSelector);
    const to = $(toSelector);
    from.addEventListener("change", () => {
      if (!from.value) return;
      const next = new Date(`${from.value}T12:00:00`);
      next.setDate(next.getDate() + 1);
      to.min = dateValue(next);
      if (to.value && to.value <= from.value) to.value = "";
    });
  }

  function readFilters() {
    const data = new FormData(filterForm);
    const from = data.get("from") || "";
    const to = data.get("to") || "";
    return {
      cats: data.getAll("cat"),
      am: data.getAll("am"),
      guests: Number(data.get("guests")) || 0,
      from: from ? new Date(`${from}T12:00:00`) : null,
      to: to ? new Date(`${to}T12:00:00`) : null
    };
  }

  function validateDates(from, to, errorElement) {
    let message = "";
    if ((from && !to) || (!from && to)) message = "Укажите обе даты: заезд и выезд.";
    else if (from && from < today) message = "Дата заезда не может быть в прошлом.";
    else if (from && to && to <= from) message = "Выезд должен быть позже заезда — минимум одна ночь.";
    errorElement.textContent = message;
    errorElement.hidden = !message;
    return !message;
  }

  function applyFilters() {
    const filters = readFilters();
    if (!validateDates(filters.from, filters.to, $("#filter-error"))) return;
    state.filtered = window.KD.filterHouses(state.houses, filters, today);
    renderHouses();
  }

  function cardTemplate(house, index) {
    const amenityTags = house.am.map((key) => `<span>${amenities[key].short}</span>`).join("");
    return `<article class="house-card" style="animation-delay:${Math.min(index * 25, 150)}ms">
      <div class="house-photo">
        <img src="assets/h${house.id}-1.webp" alt="${house.name} — демонстрационное изображение" width="900" height="506" loading="${index < 4 ? "eager" : "lazy"}" decoding="async">
        <span class="photo-badge">Демо-фото</span>
      </div>
      <div class="house-content">
        <div class="house-meta"><span><i data-lucide="users"></i> До ${house.guests} гостей</span><span><i data-lucide="route"></i> ${house.km} км</span></div>
        <h3>${house.name}</h3>
        <div class="amenity-list">${amenityTags}</div>
        <div class="house-bottom">
          <div class="house-price">${formatPrice(house.price)}<small>за сутки · пример для демо</small></div>
          <button class="house-open" type="button" data-open-house="${house.id}" aria-label="Подробнее: ${house.name}">Подробнее <i data-lucide="arrow-up-right"></i></button>
        </div>
      </div>
    </article>`;
  }

  function renderHouses() {
    const sort = $("#sort-houses").value;
    const houses = [...state.filtered];
    if (sort === "price-asc") houses.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") houses.sort((a, b) => b.price - a.price);
    if (sort === "guests-desc") houses.sort((a, b) => b.guests - a.guests);
    grid.innerHTML = houses.map(cardTemplate).join("");
    grid.hidden = houses.length === 0;
    $("#empty-state").hidden = houses.length !== 0;
    $("#results-count").textContent = houses.length ? `Найдено ${houses.length} ${pluralHouses(houses.length)}` : "Ничего не найдено";

    // Если даты скрыли все варианты, отдельно объясняем причину и предлагаем следующий шаг.
    const filters = readFilters();
    let withoutDates = [];
    if (!houses.length && filters.from && filters.to) {
      withoutDates = window.KD.filterHouses(state.houses, { ...filters, from: null, to: null }, today);
    }
    $("#empty-without-dates").hidden = withoutDates.length === 0;
    if (withoutDates.length) {
      $("#empty-title").textContent = "На эти даты свободных домов нет";
      $("#empty-text").textContent = `С ${formatDate(dateValue(filters.from))} по ${formatDate(dateValue(filters.to))} подходящие дома заняты. Без учёта дат найдено ${withoutDates.length} ${pluralHouses(withoutDates.length)}.`;
    } else {
      $("#empty-title").textContent = "Под такие условия ничего не найдено";
      $("#empty-text").textContent = "Попробуйте убрать часть удобств или изменить даты.";
    }
    grid.setAttribute("aria-busy", "false");
    refreshIcons();
  }

  function resetFilters() {
    filterForm.reset();
    $("#filter-error").hidden = true;
    $("#filter-to").min = dateValue(new Date(today.getTime() + DAY));
    applyFilters();
  }

  function openHouse(id, trigger) {
    const house = state.houses.find((item) => item.id === Number(id));
    if (!house) return;
    state.currentHouse = house;
    state.imageIndex = 0;
    state.lastFocus = trigger || document.activeElement;
    $("#dialog-title").textContent = house.name;
    $("#dialog-meta").textContent = `До ${house.guests} гостей · ${house.km} км от центра · ${house.dir}`;
    $("#dialog-price").innerHTML = `${formatPrice(house.price)} <small>за сутки · демонстрационная цена</small>`;
    $("#dialog-amenities").innerHTML = house.am.map((key) => `<span><i data-lucide="${amenities[key].icon}"></i>${amenities[key].label}</span>`).join("");
    $("#request-form").hidden = false;
    $("#request-result").hidden = true;
    $("#request-error").hidden = true;
    $("#request-guests").max = house.guests;
    const filters = readFilters();
    $("#request-from").value = filters.from ? dateValue(filters.from) : "";
    $("#request-to").value = filters.to ? dateValue(filters.to) : "";
    $("#request-guests").value = filters.guests || Math.min(2, house.guests);
    updateGallery();
    dialog.showModal();
    document.body.style.overflow = "hidden";
    refreshIcons();
    $("#dialog-close").focus();
  }

  function updateGallery() {
    const house = state.currentHouse;
    if (!house) return;
    $("#dialog-image").src = `assets/h${house.id}-${state.imageIndex + 1}.webp`;
    $("#dialog-image").alt = `${house.name} — демонстрационное изображение ${state.imageIndex + 1}`;
    $("#gallery-count").textContent = `${state.imageIndex + 1} / 3`;
  }

  function changeGallery(direction) {
    state.imageIndex = (state.imageIndex + direction + 3) % 3;
    updateGallery();
  }

  function closeDialog() {
    dialog.close();
  }

  function submitRequest(event) {
    event.preventDefault();
    const house = state.currentHouse;
    if (!house) return;
    const name = $("#request-name").value.trim();
    const phone = $("#request-phone").value.trim();
    const from = $("#request-from").value;
    const to = $("#request-to").value;
    const guests = Number($("#request-guests").value);
    let error = "";
    if (name.length < 2) error = "Укажите имя — минимум два символа.";
    else if (phone.replace(/\D/g, "").length < 10) error = "Укажите телефон с кодом города или оператора.";
    else if (!from || !to) error = "Выберите даты заезда и выезда.";
    else if (new Date(`${from}T12:00:00`) < today) error = "Дата заезда не может быть в прошлом.";
    else if (to <= from) error = "Выезд должен быть позже заезда.";
    else if (!guests || guests < 1) error = "Укажите количество гостей.";
    else if (guests > house.guests) error = `В этом доме можно разместить не больше ${house.guests} гостей.`;
    $("#request-error").textContent = error;
    $("#request-error").hidden = !error;
    if (error) return;

    const filters = readFilters();
    const categoryNames = { s: "До 6 гостей", m: "10–15 гостей", l: "До 30 гостей", xl: "До 50 гостей" };
    const lead = {
      id: window.crypto && crypto.randomUUID ? crypto.randomUUID : String(Date.now()),
      createdAt: new Date().toISOString(),
      houseId: house.id,
      houseName: house.name,
      from,
      to,
      nights: Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / DAY),
      guests,
      name,
      phone,
      amenities: house.am.map((key) => amenities[key].label),
      selectedFilters: [...filters.cats.map((key) => categoryNames[key]), ...filters.am.map((key) => amenities[key].label)],
      status: "Новая"
    };
    state.leads.push(lead);
    if (!saveLeads()) {
      state.leads.pop();
      $("#request-error").textContent = "Браузер не разрешил сохранить заявку. Проверьте настройки хранилища и попробуйте снова.";
      $("#request-error").hidden = false;
      return;
    }
    updateLeadCounters();

    const text = `Здравствуйте! Меня зовут ${name}.\n\nИнтересует ${house.name} с ${formatDate(from)} по ${formatDate(to)}. Гостей: ${guests}.\n\nУдобства: ${lead.amenities.join(", ")}.\n\nПодскажите, пожалуйста, свободны ли эти даты и какая будет итоговая стоимость?\n\nТелефон для связи: ${phone}`;
    $("#request-text").value = text;
    $("#request-form").hidden = true;
    $("#request-result").hidden = false;
    $("#copy-request").focus();
  }

  function renderLeads() {
    const hasLeads = state.leads.length > 0;
    $("#leads-total").textContent = hasLeads ? `Всего заявок: ${state.leads.length}` : "Заявок пока нет";
    $("#leads-table-wrap").hidden = !hasLeads;
    $("#leads-empty").hidden = hasLeads;
    $("#export-leads").disabled = !hasLeads;
    $("#clear-leads").disabled = !hasLeads;
    $("#leads-body").innerHTML = [...state.leads].reverse().map((lead) => `<tr>
      <td>${escapeHtml(new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(lead.createdAt)))}</td>
      <td><strong>${escapeHtml(lead.houseName)}</strong></td>
      <td>${escapeHtml(formatDate(lead.from))}</td><td>${escapeHtml(formatDate(lead.to))}</td>
      <td>${escapeHtml(lead.guests)}</td><td>${escapeHtml(lead.name)}</td><td>${escapeHtml(lead.phone)}</td>
      <td>${escapeHtml(lead.amenities.join(", "))}</td>
    </tr>`).join("");
  }

  function openLeads(trigger) {
    state.leadsLastFocus = trigger || document.activeElement;
    if (dialog.open) dialog.close();
    const mobileMenu = $("#mobile-menu");
    if (!mobileMenu.hidden) {
      mobileMenu.hidden = true;
      $("#menu-toggle").setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    }
    renderLeads();
    leadsDialog.showModal();
    document.body.style.overflow = "hidden";
    $("#leads-close").focus();
  }

  function exportLeads() {
    if (!state.leads.length) return;
    const headers = ["Номер", "Создана", "Дом", "Заезд", "Выезд", "Ночей", "Гостей", "Имя", "Телефон", "Удобства дома", "Выбранные фильтры", "Статус"];
    const rows = state.leads.map((lead, index) => [
      index + 1, new Date(lead.createdAt).toLocaleString("ru-RU"), lead.houseName, lead.from, lead.to,
      lead.nights, lead.guests, lead.name, lead.phone, lead.amenities.join(", "), lead.selectedFilters.join(", "), lead.status
    ]);
    const escapeCsv = (value) => {
      let text = String(value ?? "");
      // Не даём Excel выполнить пользовательский текст как формулу.
      if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    // BOM и точка с запятой помогают Excel правильно открыть русский текст в CSV.
    const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zayavki-doma-${dateValue(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Файл CSV для Excel скачан");
  }

  let toastTimer;
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    // Popover выводит уведомление поверх открытого модального окна.
    if (typeof toast.showPopover === "function" && !toast.matches(":popover-open")) toast.showPopover();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (typeof toast.hidePopover === "function" && toast.matches(":popover-open")) toast.hidePopover();
      toast.hidden = true;
    }, 2400);
  }

  async function copyRequest() {
    const textarea = $("#request-text");
    try {
      await navigator.clipboard.writeText(textarea.value);
      showToast("Текст скопирован");
    } catch (error) {
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      showToast(copied ? "Текст скопирован" : "Выделите текст и скопируйте вручную");
    }
  }

  function initMap() {
    if (!window.L) {
      $("#map").innerHTML = "<p style='padding:24px'>Не удалось загрузить карту. Метки домов доступны в карточках каталога.</p>";
      return;
    }
    const map = L.map("map", { scrollWheelZoom: false }).setView([56.84, 60.65], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);
    const bounds = [];
    state.houses.forEach((house) => {
      const marker = L.marker([house.lat, house.lng], {
        icon: L.divIcon({ className: "house-marker", html: `<span>${house.id}</span>`, iconSize: [34, 34] }),
        title: `${house.name} — условная метка`,
        keyboard: true
      }).addTo(map);
      marker.bindPopup(`<strong>${house.name}</strong><br>До ${house.guests} гостей · ${house.km} км<br><small>Метка и дом вымышлены</small>`);
      bounds.push([house.lat, house.lng]);
    });
    map.fitBounds(bounds, { padding: [20, 20] });
  }

  function bindEvents() {
    filterForm.addEventListener("submit", (event) => { event.preventDefault(); applyFilters(); });
    filterForm.addEventListener("change", (event) => {
      if (event.target.matches("input[type='checkbox'], input[type='date']")) applyFilters();
    });
    $("#filter-guests").addEventListener("input", applyFilters);
    $("#reset-filters").addEventListener("click", resetFilters);
    $("#empty-reset").addEventListener("click", resetFilters);
    $("#empty-without-dates").addEventListener("click", () => {
      $("#filter-from").value = "";
      $("#filter-to").value = "";
      applyFilters();
    });
    $("#sort-houses").addEventListener("change", renderHouses);
    grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-house]");
      if (button) openHouse(button.dataset.openHouse, button);
    });

    $("#quick-search").addEventListener("submit", (event) => {
      event.preventDefault();
      const from = $("#quick-from").value;
      const to = $("#quick-to").value;
      const guests = Number($("#quick-guests").value);
      const error = $("#quick-error");
      let message = "";
      if (!from || !to) message = "Выберите даты заезда и выезда.";
      else if (!guests || guests < 1 || guests > 50) message = "Укажите от 1 до 50 гостей.";
      error.textContent = message;
      error.hidden = !message;
      if (message) return;
      $("#filter-from").value = from;
      $("#filter-to").value = to;
      $("#filter-guests").value = guests;
      if (!applyQuickDates()) return;
      $("#filter-toggle").setAttribute("aria-expanded", "false");
      $("#filters").classList.remove("is-open");
      $("#catalog").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });

    $("#filter-toggle").addEventListener("click", () => {
      const open = $("#filters").classList.toggle("is-open");
      $("#filter-toggle").setAttribute("aria-expanded", String(open));
      if (open) $("#filters").scrollIntoView({ block: "nearest" });
    });

    $("#dialog-close").addEventListener("click", closeDialog);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
    dialog.addEventListener("close", () => {
      document.body.style.overflow = "";
      if (state.lastFocus && document.contains(state.lastFocus)) state.lastFocus.focus();
    });
    $("#gallery-prev").addEventListener("click", () => changeGallery(-1));
    $("#gallery-next").addEventListener("click", () => changeGallery(1));
    $("#request-form").addEventListener("submit", submitRequest);
    $("#copy-request").addEventListener("click", copyRequest);
    $("#edit-request").addEventListener("click", () => {
      $("#request-result").hidden = true;
      $("#request-form").hidden = false;
      $("#request-name").focus();
    });
    $$('[data-open-leads]').forEach((button) => button.addEventListener("click", () => openLeads(button)));
    $("#leads-close").addEventListener("click", () => leadsDialog.close());
    leadsDialog.addEventListener("click", (event) => { if (event.target === leadsDialog) leadsDialog.close(); });
    leadsDialog.addEventListener("close", () => {
      document.body.style.overflow = "";
      if (state.leadsLastFocus && document.contains(state.leadsLastFocus)) state.leadsLastFocus.focus();
    });
    $("#export-leads").addEventListener("click", exportLeads);
    $("#clear-leads").addEventListener("click", () => {
      if (!state.leads.length) return;
      if (!window.confirm("Удалить все заявки из этого браузера? Отменить очистку будет нельзя.")) return;
      state.leads = [];
      if (saveLeads()) {
        updateLeadCounters();
        renderLeads();
        showToast("Журнал заявок очищен");
      }
    });

    const menuButton = $("#menu-toggle");
    const menu = $("#mobile-menu");
    function closeMenu() {
      menu.hidden = true;
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Открыть меню");
      document.body.classList.remove("menu-open");
    }
    menuButton.addEventListener("click", () => {
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      menuButton.setAttribute("aria-expanded", String(willOpen));
      menuButton.setAttribute("aria-label", willOpen ? "Закрыть меню" : "Открыть меню");
      document.body.classList.toggle("menu-open", willOpen);
    });
    menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !menu.hidden) closeMenu(); });
    window.addEventListener("scroll", () => { $(".site-header").classList.toggle("scrolled", window.scrollY > 24); }, { passive: true });
  }

  function applyQuickDates() {
    const from = new Date(`${$("#quick-from").value}T12:00:00`);
    const to = new Date(`${$("#quick-to").value}T12:00:00`);
    if (!validateDates(from, to, $("#quick-error"))) return false;
    applyFilters();
    return !$("#filter-error").textContent;
  }

  async function init() {
    loadLeads();
    updateLeadCounters();
    setDateLimits();
    linkDatePair("#quick-from", "#quick-to");
    linkDatePair("#filter-from", "#filter-to");
    linkDatePair("#request-from", "#request-to");
    bindEvents();
    refreshIcons();
    try {
      const response = await fetch("data/houses.json");
      if (!response.ok) throw new Error("Данные домов не загрузились");
      state.houses = await response.json();
      state.filtered = [...state.houses];
      renderHouses();
      initMap();
    } catch (error) {
      grid.innerHTML = "<p class='form-error'>Не удалось загрузить каталог. Обновите страницу или проверьте файл data/houses.json.</p>";
      grid.setAttribute("aria-busy", "false");
      $("#results-count").textContent = "Каталог недоступен";
      console.error(error.message);
    }
  }

  init();
})();
