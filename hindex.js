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

function getTotalBudget(days, tier, custom) {
  if (tier === "custom") return Math.max(custom || 0, 5000);
  if (tier === "low") return days * 3500;
  if (tier === "medium") return days * 7000;
  return days * 14000;
}

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
const NOT_ATTRACTION =
  /constituency|village|town in|city in|capital of|district|tehsil|taluk|census|municipal|human settlement|railway|station|airport|school|college|university|institute|hospital|highway|road|bridge|company|neighbourhood|suburb|locality|ward|historical region|region of|division of/i;

const WEATHER_CODES = {
  0: ["Clear sky", "☀️"], 1: ["Mostly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"], 77: ["Snow grains", "🌨️"],
  80: ["Rain showers", "🌦️"], 81: ["Rain showers", "🌧️"], 82: ["Violent showers", "⛈️"],
  85: ["Snow showers", "🌨️"], 86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm with hail", "⛈️"], 99: ["Thunderstorm with hail", "⛈️"]
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/* ---------- Geocoding with sensible disambiguation ---------- */

async function geocode(query) {
  const [namePart, ...regionParts] = query.split(",").map((part) => part.trim()).filter(Boolean);
  const region = regionParts.join(" ").toLowerCase();
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(namePart)}&count=8&language=en&format=json`;
  const data = await fetchJson(url);
  let results = (data.results || []).filter((r) => typeof r.latitude === "number");
  if (region) {
    const matching = results.filter((r) =>
      [r.admin1, r.admin2, r.country].some((field) => field && field.toLowerCase().includes(region))
    );
    if (matching.length) results = matching;
  }
  // Drop near-duplicates (same name and state)
  const seen = new Set();
  return results.filter((r) => {
    const key = `${r.name}|${r.admin1}|${r.country}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function placeLabel(place) {
  return [place.name, place.admin1, place.country].filter(Boolean).join(", ");
}

/* ---------- Notable places from Wikipedia ---------- */

async function fetchNearbyPlaces(place) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
    "&generator=geosearch&ggsradius=10000&ggslimit=40" +
    `&ggscoord=${place.latitude}%7C${place.longitude}` +
    "&prop=pageimages%7Cdescription&piprop=thumbnail&pithumbsize=640";
  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages || {});
  const townName = place.name.toLowerCase();
  return pages
    .filter((page) => page.description && !NOT_ATTRACTION.test(page.description))
    .filter((page) => !page.title.toLowerCase().startsWith(`${townName},`) && page.title.toLowerCase() !== townName)
    .sort((a, b) => Number(Boolean(b.thumbnail)) - Number(Boolean(a.thumbnail)) || (a.index || 0) - (b.index || 0))
    .map((page) => ({
      name: page.title,
      description: page.description,
      image: page.thumbnail?.source || null,
      url: `https://en.wikipedia.org/?curid=${page.pageid}`
    }));
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

function weatherNote(daysWeather) {
  const known = daysWeather.filter((d) => !d.unavailable);
  if (!known.length) return "The forecast covers the next 16 days. Check again closer to your trip.";
  const minT = Math.min(...known.map((d) => d.min));
  const maxRain = Math.max(...known.map((d) => d.rain ?? 0));
  const tips = [];
  if (minT <= 5) tips.push("Pack warm layers — nights get close to freezing.");
  else if (minT <= 15) tips.push("Carry a jacket for cool mornings and evenings.");
  if (maxRain >= 60) tips.push("Rain is likely on some days, so keep an umbrella and an indoor backup plan.");
  if (!tips.length) tips.push("Weather looks comfortable for sightseeing.");
  return tips.join(" ");
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

function buildItinerary(days, places, food, weather, destination) {
  const perDay = Math.max(1, Math.min(3, Math.ceil(places.length / days) || 1));
  return Array.from({ length: days }, (_, i) => {
    const todaysPlaces = places.slice(i * perDay, i * perDay + perDay);
    const todaysFood = food.length ? [food[(i * 2) % food.length], food[(i * 2 + 1) % food.length]] : [];
    const first = i === 0;
    const last = i === days - 1 && days > 1;
    return {
      day: i + 1,
      weather: weather[i],
      title: first ? "Arrive and settle in" : last ? "Last sights and departure" : todaysPlaces.length ? "Explore nearby highlights" : "Free day",
      places: todaysPlaces,
      freeTime: todaysPlaces.length === 0 ? `Explore ${destination} at your own pace — markets, cafés and walks.` : null,
      food: [...new Map(todaysFood.map((f) => [f.name, f])).values()]
    };
  });
}

function planBudget(days, tier, custom) {
  const total = getTotalBudget(days, tier, custom);
  const transport = Math.round(total * 0.2);
  const stay = Math.round(total * 0.4);
  const food = Math.round(total * 0.22);
  const activities = Math.max(total - transport - stay - food, 0);
  return { transport, stay, food, activities, total, perNight: Math.round(stay / days) };
}

function suggestTransport(tier, modeType) {
  if (tier === "high" || modeType === "luxury") return { mode: "Flight + cab", reason: "Fastest option for a higher budget." };
  if (tier === "low") return { mode: "Train or state bus", reason: "Cheapest way to travel long distances in India." };
  return { mode: "Train, bus or shared cab", reason: "A balance of cost and comfort." };
}

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
      <button class="print-btn" id="downloadBtn" type="button">Download Itinerary</button>
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
  results.classList.add("hidden");

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
    renderPlan(input, plan);
    renderPhotoWall(chosen.places);
    setStatus("");
    results.scrollIntoView({ behavior: "smooth", block: "start" });

    // Stays and restaurants load in the background so the plan appears quickly.
    loadOsmInto(input, plan);
  } catch (error) {
    setStatus("Something went wrong while planning. Please check your connection and try again.", "error");
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
  generatePlan(payload);
});

if (startDateInput) {
  startDateInput.min = todayIso();
  if (!startDateInput.value) startDateInput.value = todayIso();
}

(function loadFromSession() {
  const raw = sessionStorage.getItem("trip-input");
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
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
