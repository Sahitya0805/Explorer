const {
  WEATHER_CODES,
  escapeHtml,
  todayIso,
  addDays,
  formatDate,
  getTotalBudget,
  planBudget,
  suggestTransport,
  placeLabel,
  filterGeocodeResults,
  selectAttractions,
  weatherNote,
  buildItinerary,
  encodeShare,
  decodeShare,
  packingList,
  addSavedTrip
} = window.PlannerCore;

const form = document.getElementById("plannerForm");
const results = document.getElementById("results");
const generateBtn = document.getElementById("generateBtn");
const customBudgetWrap = document.getElementById("customBudgetWrap");
const photoSlots = document.querySelectorAll(".place-photo");
const photoWall = document.getElementById("photoWall");
const bgVideo = document.getElementById("bgVideo");
const themeButtons = document.querySelectorAll(".theme-btn");

let budgetTier = "low";
let mode = "balanced";
let bgTheme = "forest";
let latestInput = null;
let latestPlan = null;
let currentVideoIndex = 0;

const themeVideos = {
  forest: [
    "assets/forest-local.mp4",
    "https://videos.pexels.com/video-files/3121459/3121459-uhd_2560_1440_25fps.mp4",
    "https://cdn.coverr.co/videos/coverr-flying-over-a-forest-1599/1080p.mp4",
    "https://cdn.coverr.co/videos/coverr-aerial-view-of-a-river-and-forest-5176/1080p.mp4"
  ],
  beach: [
    "assets/beach-local.mp4",
    "https://videos.pexels.com/video-files/855402/855402-hd_1920_1080_25fps.mp4",
    "https://cdn.coverr.co/videos/coverr-rushing-waterfall-1579/1080p.mp4",
    "https://cdn.coverr.co/videos/coverr-ocean-waves-1564/1080p.mp4"
  ]
};

function loadThemeVideo() {
  const sources = themeVideos[bgTheme] || themeVideos.forest;
  const safeIndex = Math.min(Math.max(currentVideoIndex, 0), sources.length - 1);
  bgVideo.src = sources[safeIndex];
  bgVideo.load();
  bgVideo
    .play()
    .catch(() => {
      // Browser autoplay policies may block until first interaction.
    });
}

function setTheme(theme) {
  bgTheme = theme in themeVideos ? theme : "forest";
  currentVideoIndex = 0;
  bgVideo.muted = true;
  bgVideo.setAttribute("muted", "");
  bgVideo.setAttribute("playsinline", "");
  bgVideo.autoplay = true;
  bgVideo.loop = true;
  loadThemeVideo();
  sessionStorage.setItem("bg-theme", bgTheme);
  themeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === bgTheme);
  });
}

themeButtons.forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.theme));
});

bgVideo.addEventListener("error", () => {
  const sources = themeVideos[bgTheme] || [];
  if (currentVideoIndex < sources.length - 1) {
    currentVideoIndex += 1;
    loadThemeVideo();
  }
});

function resumeVideoOnInteraction() {
  bgVideo.play().catch(() => {});
}

window.addEventListener("click", resumeVideoOnInteraction, { passive: true });
window.addEventListener("touchstart", resumeVideoOnInteraction, { passive: true });

function pick(containerId, attr, cb) {
  const container = document.getElementById(containerId);
  container.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    container.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("active"));
    button.classList.add("active");
    cb(button.dataset[attr]);
  });
}

pick("budgetChips", "budget", (value) => {
  budgetTier = value;
  customBudgetWrap.classList.toggle("hidden", value !== "custom");
});

pick("modeChips", "mode", (value) => {
  mode = value;
});


function money(value) {
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

/* ------------------------------------------------------------------
 * Real trip data from free, key-less public APIs:
 *  - Open-Meteo: geocoding + daily forecast
 *  - Wikipedia: notable places nearby, with photos
 *  - OpenStreetMap (Overpass): real hotels and restaurants nearby
 * ------------------------------------------------------------------ */

const statusBox = document.getElementById("plannerStatus");
const startDateInput = document.getElementById("startDate");
const FORECAST_DAYS = 16;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];



function setStatus(message, tone = "info") {
  if (!statusBox) return;
  statusBox.textContent = message || "";
  statusBox.dataset.tone = tone;
  statusBox.classList.toggle("hidden", !message);
}

async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}




/* ---------- Geocoding with sensible disambiguation ---------- */

async function geocode(query) {
  const namePart = query.split(",")[0].trim();
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(namePart)}&count=8&language=en&format=json`;
  const data = await fetchJson(url);
  return filterGeocodeResults(data.results, query);
}


/* ---------- Notable places from Wikipedia ---------- */

async function fetchNearbyPlaces(place) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
    "&generator=geosearch&ggsradius=10000&ggslimit=40" +
    `&ggscoord=${place.latitude}%7C${place.longitude}` +
    "&prop=pageimages%7Cdescription%7Ccoordinates&piprop=thumbnail&pithumbsize=640";
  const data = await fetchJson(url);
  return selectAttractions(Object.values(data?.query?.pages || {}), place.name);
}

async function pickBestPlace(candidates) {
  // Rank the top few matches by how many notable places Wikipedia lists nearby,
  // so "Manali" resolves to the Himachal hill station rather than a Chennai suburb.
  const top = candidates.slice(0, 3);
  const scored = await Promise.all(
    top.map(async (place) => {
      try {
        const places = await fetchNearbyPlaces(place);
        return { place, places, score: places.filter((p) => p.image).length * 2 + places.length };
      } catch {
        return { place, places: [], score: 0 };
      }
    })
  );
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

/* ---------- Weather from Open-Meteo ---------- */

async function fetchWeather(place, startIso, days) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    `&timezone=auto&forecast_days=${FORECAST_DAYS}`;
  const data = await fetchJson(url);
  const byDate = {};
  (data.daily?.time || []).forEach((date, i) => {
    byDate[date] = {
      code: data.daily.weather_code[i],
      max: Math.round(data.daily.temperature_2m_max[i]),
      min: Math.round(data.daily.temperature_2m_min[i]),
      rain: data.daily.precipitation_probability_max?.[i]
    };
  });
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(startIso, i);
    return { date, ...(byDate[date] || { unavailable: true }) };
  });
}


/* ---------- Hotels and restaurants from OpenStreetMap ---------- */

async function fetchOsmPlaces(place) {
  const query =
    `[out:json][timeout:20];(` +
    `node["tourism"~"^(hotel|guest_house|hostel)$"]["name"](around:5000,${place.latitude},${place.longitude});` +
    `node["amenity"~"^(restaurant|cafe)$"]["name"](around:5000,${place.latitude},${place.longitude});` +
    `);out 80;`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 1; attempt += 1) {
      try {
        const data = await fetchJson(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: `data=${encodeURIComponent(query)}`
          }, 12000);
        const elements = data.elements || [];
        const stays = elements
          .filter((e) => e.tags?.tourism)
          .map((e) => ({
            name: e.tags.name,
            kind: { hotel: "Hotel", guest_house: "Guest house", hostel: "Hostel" }[e.tags.tourism] || "Stay",
            stars: e.tags.stars || null,
            url: `https://www.openstreetmap.org/node/${e.id}`
          }));
        const food = elements
          .filter((e) => e.tags?.amenity)
          .map((e) => ({
            name: e.tags.name,
            kind: e.tags.amenity === "cafe" ? "Café" : "Restaurant",
            cuisine: (e.tags.cuisine || "").split(";").map((c) => c.replace(/_/g, " ")).filter(Boolean).slice(0, 2).join(", "),
            veg: e.tags["diet:vegetarian"] === "yes" || e.tags["diet:vegetarian"] === "only",
            url: `https://www.openstreetmap.org/node/${e.id}`
          }));
        return { stays, food };
      } catch {
        // try the next endpoint
      }
    }
  }
  return null; // all endpoints busy
}

/* ---------- Plan assembly ---------- */




/* ---------- Rendering ---------- */

function placeCard(p) {
  return `
    <a class="mini place-card" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">
      ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" />` : `<div class="img-placeholder" aria-hidden="true">📍</div>`}
      <h4>${escapeHtml(p.name)}</h4>
      <p>${escapeHtml(p.description)}</p>
    </a>`;
}

function weatherChip(w) {
  if (!w || w.unavailable) return `<span class="weather-chip muted">Forecast not out yet</span>`;
  const [label, icon] = WEATHER_CODES[w.code] || ["—", "🌡️"];
  return `<span class="weather-chip">${icon} ${escapeHtml(label)} · ${w.min}–${w.max}°C${w.rain != null ? ` · ${w.rain}% rain` : ""}</span>`;
}

function renderPlan(input, plan) {
  const bars = [
    ["Transport", plan.budget.transport],
    ["Stay", plan.budget.stay],
    ["Food", plan.budget.food],
    ["Activities", plan.budget.activities]
  ]
    .map(([label, value]) => {
      const width = Math.max((value / (plan.budget.total || 1)) * 100, 4);
      return `
      <div>
        <div class="bar-label"><span>${label}</span><span>${money(value)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
      </div>`;
    })
    .join("");

  const mapSearch = (what) =>
    `https://www.google.com/maps/search/${encodeURIComponent(`${what} near ${plan.place.label}`)}`;

  const loadingRow = `<p class="muted loading-row">Finding nearby places on OpenStreetMap…</p>`;
  const staysHtml = plan.osm === undefined
    ? loadingRow
    : plan.osm
    ? plan.osm.stays.length
      ? plan.osm.stays.slice(0, 6).map((s) => `
          <a class="list-row" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">
            <strong>${escapeHtml(s.name)}</strong>
            <span>${escapeHtml(s.kind)}${s.stars ? ` · ${escapeHtml(s.stars)}★` : ""}</span>
          </a>`).join("")
      : `<p class="muted">No stays are mapped nearby yet.</p>`
    : `<p class="muted">Couldn't reach the map service right now. <button type="button" class="link-btn" data-retry-osm>Try again</button></p>`;

  const foodHtml = plan.osm === undefined
    ? loadingRow
    : plan.osm
    ? plan.osm.food.length
      ? plan.osm.food.slice(0, 6).map((f) => `
          <a class="list-row" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">
            <strong>${escapeHtml(f.name)}</strong>
            <span>${escapeHtml([f.kind, f.cuisine, f.veg ? "veg options" : ""].filter(Boolean).join(" · "))}</span>
          </a>`).join("")
      : `<p class="muted">No restaurants are mapped nearby yet.</p>`
    : `<p class="muted">Couldn't reach the map service right now. <button type="button" class="link-btn" data-retry-osm>Try again</button></p>`;

  const daysHtml = plan.itinerary
    .map((d) => `
      <div class="day">
        <div class="day-head">
          <h4>Day ${d.day} · ${escapeHtml(formatDate(d.weather.date))}: ${escapeHtml(d.title)}</h4>
          ${weatherChip(d.weather)}
        </div>
        ${d.places.length ? `<div class="place-grid">${d.places.map(placeCard).join("")}</div>` : ""}
        ${d.freeTime ? `<p>${escapeHtml(d.freeTime)}</p>` : ""}
        ${d.food.length ? `<p class="day-food"><strong>Eat nearby:</strong> ${d.food.map((f) => escapeHtml(f.name)).join(", ")}</p>` : ""}
      </div>`)
    .join("");

  const otherPlaces = plan.alternatives.length
    ? `<p class="alt-places">Not this place? ${plan.alternatives
        .map((alt, i) => `<button type="button" class="link-btn" data-alt="${i}">${escapeHtml(alt.label)}</button>`)
        .join(" · ")}</p>`
    : "";

  results.innerHTML = `
    <div class="results-header">
      <div>
        <h2>${escapeHtml(plan.place.label)}</h2>
        <p>${input.days}-day ${escapeHtml(input.modeType)} trip from ${escapeHtml(formatDate(input.startDate))} · ${escapeHtml(input.tier)} budget</p>
        ${otherPlaces}
      </div>
      <div class="results-actions">
        <button class="print-btn" id="shareBtn" type="button">Share Trip</button>
        <button class="print-btn" id="saveTripBtn" type="button">Save Trip</button>
        <button class="print-btn" id="downloadBtn" type="button">Download Itinerary</button>
      </div>
    </div>

    <div class="grid2">
      <article class="section card">
        <h3>Weather for your dates</h3>
        <div class="weather-strip">${plan.weather.map(weatherChip).join("")}</div>
        <p>${escapeHtml(plan.weatherNote)}</p>
        <p class="source-note">Source: Open-Meteo forecast</p>
      </article>
      <article class="section card">
        <h3>Budget estimate</h3>
        <p>Estimated total: <strong>${money(plan.budget.total)}</strong> · about ${money(plan.budget.perNight)} per night for stays</p>
        <div class="bars">${bars}</div>
        <p class="source-note">Suggested travel: ${escapeHtml(plan.transport.mode)} — ${escapeHtml(plan.transport.reason)}</p>
      </article>
    </div>

    <article class="section card packing-card">
      <div class="packing-head">
        <h3>Packing list</h3>
        <span class="packing-progress" id="packingProgress"></span>
      </div>
      <p class="source-note">Built from your dates' forecast. Ticks are remembered on this device.</p>
      <div class="packing-groups" id="packingList"></div>
    </article>

    <article class="section card" id="mapCard">
      <h3>Trip map</h3>
      <div id="tripMap" class="trip-map" role="region" aria-label="Map of the places in this trip"></div>
      <div class="map-legend">${plan.itinerary
        .filter((d) => d.places.some((p) => p.lat != null))
        .map((d) => `<span class="legend-item"><span class="day-pin day-${((d.day - 1) % 7) + 1}">${d.day}</span>Day ${d.day}</span>`)
        .join("")}</div>
      <p class="source-note">Map data © OpenStreetMap contributors</p>
    </article>

    <article class="section card">
      <h3>Day-wise itinerary</h3>
      ${plan.places.length ? "" : `<p class="muted">Wikipedia lists few notable places near here, so the plan keeps days flexible.</p>`}
      <div class="timeline">${daysHtml}</div>
      <p class="source-note">Places and photos: Wikipedia</p>
    </article>

    <div class="grid2">
      <article class="section card">
        <h3>Places to stay nearby</h3>
        <div class="list">${staysHtml}</div>
        <a class="map-link" href="${mapSearch("hotels")}" target="_blank" rel="noopener">See prices and reviews on Google Maps ↗</a>
      </article>
      <article class="section card">
        <h3>Places to eat nearby</h3>
        <div class="list">${foodHtml}</div>
        <a class="map-link" href="${mapSearch("restaurants")}" target="_blank" rel="noopener">See more on Google Maps ↗</a>
      </article>
    </div>
    <p class="source-note">Stays and restaurants: OpenStreetMap contributors</p>
  `;

  results.classList.remove("hidden");

  document.getElementById("downloadBtn").addEventListener("click", () => downloadItineraryFile(input, plan));
  document.getElementById("shareBtn").addEventListener("click", () => shareTrip(input, plan));
  document.getElementById("saveTripBtn").addEventListener("click", () => saveTrip(input, plan));
  updateSaveButton(input, plan);
  renderPackingList(input, plan);
  renderMap(plan);
  results.querySelectorAll("[data-retry-osm]").forEach((btn) => {
    btn.addEventListener("click", () => loadOsmInto(input, plan));
  });
  results.querySelectorAll("[data-alt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const alt = plan.alternatives[Number(btn.dataset.alt)];
      generatePlan({ ...input, forcedPlace: alt.raw });
    });
  });
}

let tripMap = null;

function renderMap(plan) {
  const card = document.getElementById("mapCard");
  const el = document.getElementById("tripMap");
  if (tripMap) {
    tripMap.remove();
    tripMap = null;
  }
  if (!card || !el) return;
  if (!window.L) {
    card.classList.add("hidden");
    return;
  }

  tripMap = L.map(el, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(tripMap);

  const points = [];
  plan.itinerary.forEach((d) => {
    d.places.forEach((p) => {
      if (p.lat == null || p.lon == null) return;
      const icon = L.divIcon({
        className: "",
        html: `<span class="day-pin day-${((d.day - 1) % 7) + 1}">${d.day}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      L.marker([p.lat, p.lon], { icon, title: p.name })
        .addTo(tripMap)
        .bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>Day ${d.day} · ${escapeHtml(p.description)}<br><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">Wikipedia ↗</a>`);
      points.push([p.lat, p.lon]);
    });
  });

  if (points.length) {
    tripMap.fitBounds(points, { padding: [30, 30], maxZoom: 14 });
  } else {
    tripMap.setView([plan.place.latitude, plan.place.longitude], 12);
  }
}

function shareUrl(input, plan) {
  return `${window.location.origin}${window.location.pathname}?${encodeShare(input, plan.place)}`;
}

async function shareTrip(input, plan) {
  const url = shareUrl(input, plan);
  const title = `${input.days}-day trip to ${plan.place.name}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, text: `${title} — planned with Explorer`, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    setStatus("Trip link copied. Anyone with the link sees the same plan.");
  } catch (error) {
    if (error && error.name === "AbortError") return; // user closed the share sheet
    setStatus(`Copy this link to share your trip: ${url}`);
  }
}

/* ---------- Packing list ---------- */

function packingKey(input, plan) {
  return `explorer-packing:${plan.place.latitude.toFixed(2)},${plan.place.longitude.toFixed(2)}:${input.startDate}:${input.days}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked or full: the page still works without it
  }
}

function renderPackingList(input, plan) {
  const container = document.getElementById("packingList");
  const progress = document.getElementById("packingProgress");
  if (!container) return;

  const items = packingList(plan.weather, input.days, input.modeType);
  const key = packingKey(input, plan);
  const checked = new Set(readJson(key, []));
  const groups = [...new Set(items.map((i) => i.group))];

  container.innerHTML = groups
    .map((group) => `
      <div class="packing-group">
        <h4>${escapeHtml(group)}</h4>
        ${items
          .filter((i) => i.group === group)
          .map((i) => `
            <label class="packing-item">
              <input type="checkbox" data-id="${escapeHtml(i.id)}" ${checked.has(i.id) ? "checked" : ""} />
              <span>${escapeHtml(i.label)}</span>
            </label>`)
          .join("")}
      </div>`)
    .join("");

  const update = () => {
    const done = [...container.querySelectorAll("input:checked")].map((el) => el.dataset.id);
    writeJson(key, done);
    if (progress) progress.textContent = `${done.length}/${items.length} packed`;
  };
  container.querySelectorAll("input").forEach((el) => el.addEventListener("change", update));
  if (progress) progress.textContent = `${[...checked].filter((id) => items.some((i) => i.id === id)).length}/${items.length} packed`;
}

/* ---------- Saved trips ---------- */

const SAVED_TRIPS_KEY = "explorer-saved-trips";

function tripLabel(input, plan) {
  return `${plan.place.name} · ${input.days} day${input.days > 1 ? "s" : ""} from ${formatDate(input.startDate)}`;
}

function updateSaveButton(input, plan) {
  const btn = document.getElementById("saveTripBtn");
  if (!btn) return;
  const query = encodeShare(input, plan.place);
  const saved = readJson(SAVED_TRIPS_KEY, []).some((t) => t.query === query);
  btn.textContent = saved ? "Saved ✓" : "Save Trip";
  btn.disabled = saved;
}

function saveTrip(input, plan) {
  const trip = { query: encodeShare(input, plan.place), label: tripLabel(input, plan), savedAt: Date.now() };
  writeJson(SAVED_TRIPS_KEY, addSavedTrip(readJson(SAVED_TRIPS_KEY, []), trip));
  updateSaveButton(input, plan);
  renderSavedTrips();
  setStatus("Trip saved. Find it under “My saved trips” above the planner.");
}

function renderSavedTrips() {
  const wrap = document.getElementById("savedTrips");
  const list = document.getElementById("savedTripsList");
  if (!wrap || !list) return;
  const trips = readJson(SAVED_TRIPS_KEY, []);
  wrap.classList.toggle("hidden", trips.length === 0);
  list.innerHTML = trips
    .map((t, i) => `
      <li class="saved-trip">
        <a href="?${escapeHtml(t.query)}">${escapeHtml(t.label)}</a>
        <button type="button" class="link-btn" data-remove="${i}" aria-label="Remove ${escapeHtml(t.label)}">Remove</button>
      </li>`)
    .join("");
  list.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = readJson(SAVED_TRIPS_KEY, []).filter((_, i) => i !== Number(btn.dataset.remove));
      writeJson(SAVED_TRIPS_KEY, next);
      renderSavedTrips();
      if (latestInput && latestPlan) updateSaveButton(latestInput, latestPlan);
    });
  });
}

/* ---------- Loading placeholders ---------- */

function renderSkeleton(days) {
  const block = (cls) => `<div class="skeleton ${cls}"></div>`;
  results.innerHTML = `
    <div class="results-header">${block("sk-title")}</div>
    <div class="grid2">
      <article class="section card">${block("sk-line")}${block("sk-line short")}${block("sk-chips")}</article>
      <article class="section card">${block("sk-line")}${block("sk-bar")}${block("sk-bar")}${block("sk-bar")}</article>
    </div>
    <article class="section card">${block("sk-map")}</article>
    <article class="section card">
      ${Array.from({ length: Math.min(days, 3) }, () => `${block("sk-line")}<div class="sk-row">${block("sk-photo")}${block("sk-photo")}${block("sk-photo")}</div>`).join("")}
    </article>`;
  results.classList.remove("hidden");
  results.setAttribute("aria-busy", "true");
}

/* ---------- Destination suggestions ---------- */

let pickedPlace = null;

function setupDestinationSuggestions() {
  const input = document.getElementById("destination");
  const list = document.getElementById("destSuggestions");
  if (!input || !list) return;
  let timer = null;
  let results = [];
  let active = -1;
  let requestId = 0;

  const close = () => {
    list.classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };

  const choose = (index) => {
    const place = results[index];
    if (!place) return;
    pickedPlace = place;
    input.value = placeLabel(place);
    close();
  };

  const highlight = (index) => {
    active = index;
    [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === index)));
    if (index >= 0) input.setAttribute("aria-activedescendant", `dest-opt-${index}`);
  };

  const render = () => {
    if (!results.length) return close();
    list.innerHTML = results
      .map((r, i) => `
        <li id="dest-opt-${i}" role="option" aria-selected="false" data-index="${i}">
          <strong>${escapeHtml(r.name)}</strong>
          <span>${escapeHtml([r.admin1, r.country].filter(Boolean).join(", "))}</span>
        </li>`)
      .join("");
    list.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
  };

  input.addEventListener("input", () => {
    pickedPlace = null;
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) return close();
    timer = setTimeout(async () => {
      const id = ++requestId;
      try {
        const found = await geocode(query);
        if (id !== requestId) return;
        results = found.slice(0, 6);
        render();
      } catch {
        close();
      }
    }, 300);
  });

  input.addEventListener("keydown", (e) => {
    if (list.classList.contains("hidden")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight(Math.min(active + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight(Math.max(active - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      close();
    }
  });

  // mousedown fires before the input loses focus
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-index]");
    if (!li) return;
    e.preventDefault();
    choose(Number(li.dataset.index));
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
}

function renderPhotoWall(places) {
  const withPhotos = places.filter((p) => p.image);
  photoSlots.forEach((img, index) => {
    const figure = img.closest("figure");
    const place = withPhotos[index];
    if (!place) {
      figure.classList.add("hidden");
      return;
    }
    figure.classList.remove("hidden");
    img.src = place.image;
    img.alt = place.name;
    const caption = figure.querySelector("figcaption");
    if (caption) caption.textContent = place.name;
  });
  photoWall.classList.toggle("hidden", withPhotos.length === 0);
}

/* ---------- Download ---------- */

function downloadItineraryFile(input, plan) {
  if (!input || !plan) return;
  const rows = plan.itinerary
    .map((d) => `
      <section class="card">
        <h3>Day ${d.day} · ${escapeHtml(formatDate(d.weather.date))}: ${escapeHtml(d.title)}</h3>
        <p class="muted">${d.weather.unavailable ? "Forecast not out yet" : `${escapeHtml((WEATHER_CODES[d.weather.code] || ["—"])[0])}, ${d.weather.min}–${d.weather.max}°C`}</p>
        ${d.places.map((p) => `<div class="place">${p.image ? `<img src="${escapeHtml(p.image)}" alt="">` : ""}<div><strong>${escapeHtml(p.name)}</strong><br><span class="muted">${escapeHtml(p.description)}</span></div></div>`).join("")}
        ${d.freeTime ? `<p>${escapeHtml(d.freeTime)}</p>` : ""}
        ${d.food.length ? `<p><strong>Eat nearby:</strong> ${d.food.map((f) => escapeHtml(f.name)).join(", ")}</p>` : ""}
      </section>`)
    .join("");

  const list = (items) => items.slice(0, 6).map((i) => `<li>${escapeHtml(i.name)} <span class="muted">(${escapeHtml(i.kind)})</span></li>`).join("");

  const content = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(plan.place.label)} itinerary – Explorer</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; background: #f2f5fb; color: #0f172a; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 24px; }
  .card { background: #fff; border: 1px solid #dbe3f0; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
  .muted { color: #475569; }
  .place { display: flex; gap: 12px; align-items: center; margin: 10px 0; }
  .place img { width: 120px; height: 80px; object-fit: cover; border-radius: 8px; }
  @media print { body { background: #fff; } .card { break-inside: avoid; } }
</style></head>
<body><main class="wrap">
  <section class="card">
    <h1>${escapeHtml(plan.place.label)}</h1>
    <p class="muted">${input.days} days from ${escapeHtml(formatDate(input.startDate))} · ${escapeHtml(input.tier)} budget · ${escapeHtml(input.modeType)}</p>
    <p>Estimated total: ${money(plan.budget.total)} (transport ${money(plan.budget.transport)}, stay ${money(plan.budget.stay)}, food ${money(plan.budget.food)}, activities ${money(plan.budget.activities)})</p>
    <p>${escapeHtml(plan.weatherNote)}</p>
  </section>
  ${rows}
  ${plan.osm ? `<section class="card"><h3>Places to stay</h3><ul>${list(plan.osm.stays)}</ul><h3>Places to eat</h3><ul>${list(plan.osm.food)}</ul></section>` : ""}
  <p class="muted">Weather: Open-Meteo · Places: Wikipedia · Stays and food: OpenStreetMap contributors</p>
</main></body></html>`;

  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const cleanDestination = String(plan.place.name || "trip").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  link.download = `${cleanDestination}-itinerary.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

/* ---------- Form flow ---------- */

function loadOsmInto(input, plan) {
  const requestId = (loadOsmInto.requestId = (loadOsmInto.requestId || 0) + 1);
  if (plan.osm === null) {
    plan.osm = undefined;
    renderPlan(input, plan);
  }
  setStatus("");
  fetchOsmPlaces(plan.place).then((osm) => {
    if (requestId !== loadOsmInto.requestId || latestPlan !== plan) return; // a newer request replaced this one
    plan.osm = osm;
    plan.itinerary = buildItinerary(input.days, plan.places, osm ? osm.food : [], plan.weather, plan.place.name);
    renderPlan(input, plan);
    if (!osm) setStatus("The map service is busy right now, so stays and restaurants are linked to Google Maps instead.", "warn");
  });
}

async function generatePlan(input) {
  generateBtn.disabled = true;
  generateBtn.textContent = "Planning…";
  renderSkeleton(input.days);

  try {
    let chosen;
    let alternatives = [];
    if (input.forcedPlace) {
      setStatus(`Finding things to do around ${input.forcedPlace.name}…`);
      chosen = { place: input.forcedPlace, places: await fetchNearbyPlaces(input.forcedPlace).catch(() => []) };
      alternatives = (input.candidates || []).filter((c) => c !== input.forcedPlace);
    } else {
      setStatus(`Looking up “${input.destination}”…`);
      const candidates = await geocode(input.destination);
      if (!candidates.length) {
        setStatus(`We couldn't find “${input.destination}”. Check the spelling, or add the state, e.g. “Manali, Himachal”.`, "error");
        results.classList.add("hidden");
        results.removeAttribute("aria-busy");
        return;
      }
      setStatus(`Finding things to do around ${candidates[0].name}…`);
      chosen = await pickBestPlace(candidates);
      input.candidates = candidates;
      alternatives = candidates.filter((c) => c !== chosen.place);
    }

    const place = chosen.place;
    setStatus("Checking the weather for your dates…");
    const weather = await fetchWeather(place, input.startDate, input.days).catch(() =>
      Array.from({ length: input.days }, (_, i) => ({ date: addDays(input.startDate, i), unavailable: true }))
    );

    const plan = {
      place: { ...place, label: placeLabel(place) },
      alternatives: alternatives.slice(0, 3).map((raw) => ({ raw, label: placeLabel(raw) })),
      weather,
      weatherNote: weatherNote(weather),
      budget: planBudget(input.days, input.tier, input.custom),
      transport: suggestTransport(input.tier, input.modeType),
      places: chosen.places,
      osm: undefined, // undefined = still loading, null = unavailable
      itinerary: buildItinerary(input.days, chosen.places, [], weather, place.name)
    };

    latestInput = input;
    latestPlan = plan;
    try {
      window.history.replaceState(null, "", `?${encodeShare(input, plan.place)}`);
    } catch {
      // ignore: some embedded viewers block history changes
    }
    results.removeAttribute("aria-busy");
    renderPlan(input, plan);
    renderPhotoWall(chosen.places);
    setStatus("");
    results.scrollIntoView({ behavior: "smooth", block: "start" });

    // Stays and restaurants load in the background so the plan appears quickly.
    loadOsmInto(input, plan);
  } catch (error) {
    setStatus("Something went wrong while planning. Please check your connection and try again.", "error");
    results.classList.add("hidden");
    results.removeAttribute("aria-busy");
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "Generate Travel Plan";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const destination = document.getElementById("destination").value.trim();
  const days = Math.min(Math.max(Number(document.getElementById("days").value || 1), 1), 14);
  const custom = Number(document.getElementById("customBudget").value || 0);
  const startDate = (startDateInput && startDateInput.value) || todayIso();

  if (!destination) {
    setStatus("Enter a destination to start planning.", "error");
    return;
  }
  if (budgetTier === "custom" && custom < 5000) {
    setStatus("Enter a custom budget of at least ₹5,000.", "error");
    return;
  }

  const payload = { destination, days, tier: budgetTier, custom, modeType: mode, startDate };
  sessionStorage.setItem("trip-input", JSON.stringify(payload));
  generatePlan(pickedPlace ? { ...payload, forcedPlace: pickedPlace } : payload);
});

setupDestinationSuggestions();
renderSavedTrips();

if (startDateInput) {
  startDateInput.min = todayIso();
  if (!startDateInput.value) startDateInput.value = todayIso();
}

function applyInputToForm(data) {
  document.getElementById("destination").value = data.destination || "";
  document.getElementById("days").value = String(data.days || 3);
  if (data.startDate && startDateInput && data.startDate >= todayIso()) startDateInput.value = data.startDate;
  if (data.tier) {
    budgetTier = data.tier;
    document.querySelectorAll("#budgetChips .chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.budget === data.tier);
    });
    customBudgetWrap.classList.toggle("hidden", data.tier !== "custom");
  }
  if (data.custom) document.getElementById("customBudget").value = String(data.custom);
  if (data.modeType) {
    mode = data.modeType;
    document.querySelectorAll("#modeChips .chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.mode === data.modeType);
    });
  }
}

(function loadSharedOrSavedTrip() {
  // 1. A shared trip link (?to=...) opens that exact plan.
  const shared = decodeShare(window.location.search, todayIso());
  if (shared) {
    applyInputToForm(shared);
    const { place, ...input } = shared;
    generatePlan(place ? { ...input, forcedPlace: place } : input);
    return;
  }

  // 2. Otherwise restore the last form values from this browser tab.
  const raw = sessionStorage.getItem("trip-input");
  if (!raw) return;
  try {
    applyInputToForm(JSON.parse(raw));
  } catch {
    sessionStorage.removeItem("trip-input");
  }
})();

// Until a destination is chosen, show a few well-known Indian destinations from Wikipedia.
(async function loadStarterPhotos() {
  try {
    const titles = ["Taj Mahal", "Hawa Mahal", "Gateway of India", "Meenakshi Temple", "Victoria Memorial, Kolkata", "Mysore Palace"];
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages%7Cdescription" +
      `&piprop=thumbnail&pithumbsize=640&titles=${encodeURIComponent(titles.join("|"))}`;
    const data = await fetchJson(url);
    const pages = Object.values(data?.query?.pages || {}).map((p) => ({
      name: p.title,
      description: p.description || "",
      image: p.thumbnail?.source || null
    }));
    if (!latestPlan) renderPhotoWall(pages);
  } catch {
    photoWall.classList.add("hidden");
  }
})();

const savedTheme = sessionStorage.getItem("bg-theme");
if (savedTheme === "forest" || savedTheme === "beach" || savedTheme === "water") {
  bgTheme = savedTheme === "water" ? "beach" : savedTheme;
}

setTheme(bgTheme);
