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

function getDynamicImage(query, seed) {
  const q = encodeURIComponent(query);
  const s = encodeURIComponent(seed);
  const primary = `https://source.unsplash.com/900x700/?${q}`;
  const fallback = `https://picsum.photos/seed/${s}/900/700`;
  return `<img src="${primary}" alt="${query}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'" />`;
}

function imageSrcFromMarkup(markup) {
  const match = String(markup || "").match(/src="([^"]+)"/);
  return match ? match[1] : "";
}

function downloadItineraryFile(input, plan) {
  if (!input || !plan) return;

  const hotelsHtml = plan.hotels
    .map(
      (hotel) => `
      <article class="mini">
        <img src="${imageSrcFromMarkup(hotel.image)}" alt="${hotel.name}">
        <h4>${hotel.name}</h4>
        <p>${hotel.adv}</p>
        <p>${hotel.price}/night · ${hotel.rating}</p>
        <p>${hotel.dist} from attractions</p>
      </article>
    `
    )
    .join("");

  const restaurantsHtml = plan.restaurants
    .map(
      (restaurant) => `
      <article class="mini">
        <img src="${imageSrcFromMarkup(restaurant.image)}" alt="${restaurant.name}">
        <h4>${restaurant.name}</h4>
        <p>Veg: ${restaurant.veg}</p>
        <p>Non-veg: ${restaurant.nonVeg}</p>
        <p>Local dish: ${restaurant.dish}</p>
        <p>Estimated per meal: ${restaurant.cost}</p>
      </article>
    `
    )
    .join("");

  const daysHtml = plan.itinerary
    .map(
      (day) => `
      <article class="mini">
        <img src="${imageSrcFromMarkup(day.image)}" alt="Day ${day.day} place">
        <h4>Day ${day.day}: ${day.title}</h4>
        <p>Timings: ${day.timings}</p>
        <p>Must visit: ${day.places.join(", ")}</p>
        <p>Nearby food: ${day.foodSpots.join(", ")}</p>
      </article>
    `
    )
    .join("");

  const content = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${input.destination} Itinerary - Explorer</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f2f5fb; color: #0f172a; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 24px; }
    .card { background: #fff; border: 1px solid #dbe3f0; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
    h1, h2, h3, h4 { margin: 0 0 8px; }
    p { margin: 6px 0; }
    .muted { color: #475569; }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid3 { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .mini { background: #fff; border: 1px solid #dbe3f0; border-radius: 10px; padding: 10px; }
    .mini img { width: 100%; height: 160px; object-fit: cover; border-radius: 8px; margin-bottom: 8px; }
    @media (max-width: 900px) { .grid, .grid3 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <h1>Explorer - Complete Itinerary</h1>
      <p class="muted">Destination: ${input.destination} | Days: ${input.days} | Budget: ${input.tier} | Mode: ${input.modeType}</p>
      <p>${plan.overview}</p>
    </section>

    <section class="grid">
      <article class="card">
        <h3>Transport</h3>
        <p><strong>${plan.transport.mode}</strong> · ${plan.transport.duration}</p>
        <p>Approx Cost: ${plan.transport.cost}</p>
        <p>${plan.transport.reason}</p>
      </article>
      <article class="card">
        <h3>Weather</h3>
        <p>${plan.weather.condition}</p>
        <p>Avg Temp: ${plan.weather.temp}°C</p>
        <p>${plan.weather.note}</p>
      </article>
    </section>

    <section class="card">
      <h3>Budget Breakdown</h3>
      <p>Transport: ${money(plan.budget.transport)}</p>
      <p>Stay: ${money(plan.budget.stay)}</p>
      <p>Food: ${money(plan.budget.food)}</p>
      <p>Activities: ${money(plan.budget.activities)}</p>
      <p><strong>Total: ${money(plan.budget.total)}</strong></p>
    </section>

    <section class="card">
      <h3>Hotels</h3>
      <div class="grid3">${hotelsHtml}</div>
    </section>

    <section class="card">
      <h3>Restaurants</h3>
      <div class="grid3">${restaurantsHtml}</div>
    </section>

    <section class="card">
      <h3>Day-wise Itinerary</h3>
      <div class="grid">${daysHtml}</div>
    </section>
  </main>
</body>
</html>`;

  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const cleanDestination = String(input.destination || "trip").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  link.download = `${cleanDestination}-itinerary.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function setPhotoSrc(destination) {
  const base = destination && destination.trim() ? destination.trim() : "classic travel";
  const tags = [
    "old town",
    "landmark architecture",
    "sunset skyline",
    "street market",
    "coastal view",
    "heritage district"
  ];

  photoSlots.forEach((img, index) => {
    const query = encodeURIComponent(`${base} ${tags[index]}`);
    const unsplashUrl = `https://source.unsplash.com/900x700/?${query}`;
    const fallbackUrl = `https://picsum.photos/seed/${encodeURIComponent(`${base}-${index}`)}/900/700`;

    img.src = unsplashUrl;
    img.onerror = () => {
      img.onerror = null;
      img.src = fallbackUrl;
    };
  });
}

function planTrip({ destination, days, tier, custom, modeType }) {
  const total = getTotalBudget(days, tier, custom);
  const transport = Math.round(total * 0.2);
  const stay = Math.round(total * 0.4);
  const food = Math.round(total * 0.22);
  const activities = Math.max(total - transport - stay - food, 0);

  const travelMode =
    tier === "high" || modeType === "luxury" ? "Flight" : tier === "low" ? "Train" : "Bus";
  const transportReason =
    travelMode === "Flight"
      ? "Fastest option, best for maximizing high-value experiences."
      : "Best value for your selected budget while keeping travel practical.";

  const hotels = [
    {
      name: `${destination} Central Stay`,
      adv: "Near city center and public transport",
      price: money(Math.max(Math.round(stay / days), 1800)),
      rating: "4.4/5",
      dist: "1.2 km",
      image: getDynamicImage(`${destination} classic hotel exterior`, `${destination}-hotel-1`)
    },
    {
      name: `${destination} Skyline Suites`,
      adv: "Nightlife + premium city views",
      price: money(Math.max(Math.round((stay / days) * 1.15), 2400)),
      rating: "4.6/5",
      dist: "2.0 km",
      image: getDynamicImage(`${destination} luxury hotel room`, `${destination}-hotel-2`)
    },
    {
      name: `${destination} Heritage Inn`,
      adv: "Close to old town and museums",
      price: money(Math.max(Math.round((stay / days) * 0.9), 1500)),
      rating: "4.3/5",
      dist: "0.9 km",
      image: getDynamicImage(`${destination} heritage boutique hotel`, `${destination}-hotel-3`)
    }
  ];

  const restaurants = [
    {
      name: "Local Spice Kitchen",
      veg: "Veg thali, paneer grills, salads",
      nonVeg: "Chicken roast, fish curry",
      dish: "Regional signature tasting platter",
      cost: money(Math.max(Math.round(food / (days * 2)), 250)),
      image: getDynamicImage(`${destination} local restaurant food plating`, `${destination}-food-1`)
    },
    {
      name: "Night Bazaar Bites",
      veg: "Tofu stir fry, stuffed flatbreads",
      nonVeg: "Kebabs, grilled skewers",
      dish: "Street-style market combo",
      cost: money(Math.max(Math.round((food / (days * 2)) * 0.8), 180)),
      image: getDynamicImage(`${destination} street food market`, `${destination}-food-2`)
    },
    {
      name: "Harbor Table",
      veg: "Herb pasta, roasted vegetables",
      nonVeg: "Seafood platter, smoked meats",
      dish: "Locally inspired chef menu",
      cost: money(Math.max(Math.round((food / (days * 2)) * 1.2), 350)),
      image: getDynamicImage(`${destination} fine dining restaurant`, `${destination}-food-3`)
    }
  ];

  const itinerary = Array.from({ length: days }).map((_, i) => {
    const first = i === 0;
    const last = i === days - 1;
    return {
      day: i + 1,
      title: first ? "Arrival + Iconic Highlights" : last ? "Leisure + Departure" : "Explore Hidden Gems",
      timings: "09:00 - 21:00",
      places: [`${destination} Old Quarter`, `${destination} Top Viewpoint`, `${destination} Cultural Spot ${i + 1}`],
      foodSpots: ["Market Street Cafe", "Lantern Grill", "Sunset Bistro"],
      image: getDynamicImage(`${destination} tourist places day ${i + 1}`, `${destination}-day-${i + 1}`)
    };
  });

  return {
    overview: `${days}-day ${modeType} plan for ${destination}. Personalized for your ${tier} budget profile.`,
    transport: {
      mode: travelMode,
      cost: money(transport),
      duration: travelMode === "Flight" ? "~2h 15m" : "~6h to 10h",
      reason: transportReason
    },
    weather: {
      condition: "Pleasant with mild breeze",
      temp: "18-25",
      note: "Carry a light jacket for evenings."
    },
    budget: { transport, stay, food, activities, total },
    hotels,
    restaurants,
    itinerary
  };
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

  const hotels = plan.hotels
    .map(
      (h) => `
      <div class="mini">
        ${h.image}
        <h4>${h.name}</h4>
        <p>${h.adv}</p>
        <p>${h.price}/night · ${h.rating}</p>
        <p>${h.dist} from attractions</p>
      </div>`
    )
    .join("");

  const restaurants = plan.restaurants
    .map(
      (r) => `
      <div class="mini">
        ${r.image}
        <h4>${r.name}</h4>
        <p>Veg: ${r.veg}</p>
        <p>Non-veg: ${r.nonVeg}</p>
        <p>Local dish: ${r.dish}</p>
        <p>Estimated per meal: ${r.cost}</p>
      </div>`
    )
    .join("");

  const days = plan.itinerary
    .map(
      (d) => `
      <div class="day">
        <h4>Day ${d.day}: ${d.title}</h4>
        ${d.image}
        <p>Timings: ${d.timings}</p>
        <p>Must visit: ${d.places.join(", ")}</p>
        <p>Nearby food: ${d.foodSpots.join(", ")}</p>
      </div>`
    )
    .join("");

  results.innerHTML = `
    <div class="results-header">
      <div>
        <h2>${input.destination} Trip Blueprint</h2>
        <p>${plan.overview}</p>
      </div>
      <button class="print-btn" id="downloadBtn">Download Itinerary</button>
    </div>

    <div class="grid2">
      <article class="section card">
        <h3>Transport Recommendation</h3>
        <p><strong>${plan.transport.mode}</strong> · ${plan.transport.duration}</p>
        <p>Approx cost: ${plan.transport.cost}</p>
        <p>${plan.transport.reason}</p>
      </article>
      <article class="section card">
        <h3>Weather Snapshot</h3>
        <p>${plan.weather.condition}</p>
        <p>Avg Temp: ${plan.weather.temp}°C</p>
        <p>${plan.weather.note}</p>
      </article>
    </div>

    <article class="section card">
      <h3>Budget Breakdown</h3>
      <p>Estimated Total: ${money(plan.budget.total)}</p>
      <div class="bars">${bars}</div>
    </article>

    <div class="grid2">
      <article class="section card">
        <h3>Hotel Recommendations</h3>
        <div class="stack">${hotels}</div>
      </article>
      <article class="section card">
        <h3>Restaurant Recommendations</h3>
        <div class="stack">${restaurants}</div>
      </article>
    </div>

    <article class="section card">
      <h3>Day-wise Itinerary</h3>
      <div class="timeline">${days}</div>
    </article>
  `;

  results.classList.remove("hidden");

  document.getElementById("downloadBtn").addEventListener("click", () => {
    downloadItineraryFile(latestInput, latestPlan);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  generateBtn.textContent = "Generating...";
  generateBtn.disabled = true;

  const destination = document.getElementById("destination").value.trim();
  const days = Number(document.getElementById("days").value || 1);
  const custom = Number(document.getElementById("customBudget").value || 0);

  const payload = { destination, days, tier: budgetTier, custom, modeType: mode };
  sessionStorage.setItem("trip-input", JSON.stringify(payload));

  setTimeout(() => {
    const plan = planTrip(payload);
    latestInput = payload;
    latestPlan = plan;
    renderPlan(payload, plan);
    setPhotoSrc(destination);
    photoWall.classList.add("hidden");
    generateBtn.textContent = "Generate Travel Plan";
    generateBtn.disabled = false;
  }, 450);
});

(function loadFromSession() {
  const raw = sessionStorage.getItem("trip-input");
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    document.getElementById("destination").value = data.destination || "";
    document.getElementById("days").value = String(data.days || 3);
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
    setPhotoSrc(data.destination || "");
  } catch {
    sessionStorage.removeItem("trip-input");
  }
})();

if (!sessionStorage.getItem("trip-input")) {
  setPhotoSrc("classic destinations");
}

const savedTheme = sessionStorage.getItem("bg-theme");
if (savedTheme === "forest" || savedTheme === "beach" || savedTheme === "water") {
  bgTheme = savedTheme === "water" ? "beach" : savedTheme;
}

setTheme(bgTheme);
