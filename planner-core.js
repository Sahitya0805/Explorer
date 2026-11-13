/*
 * Explorer planner core: pure functions with no DOM or network access.
 * Used by the page (window.PlannerCore) and by the Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PlannerCore = api;
})(typeof self !== "undefined" ? self : this, function () {
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

  const BUDGET_TIERS = ["low", "medium", "high", "custom"];
  const MODES = ["balanced", "luxury", "adventure"];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isoDate(d) {
    const copy = new Date(d.getTime());
    copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
    return copy.toISOString().slice(0, 10);
  }

  function todayIso() {
    return isoDate(new Date());
  }

  function addDays(iso, n) {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + n);
    return isoDate(d);
  }

  function formatDate(iso) {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  }

  function getTotalBudget(days, tier, custom) {
    if (tier === "custom") return Math.max(custom || 0, 5000);
    if (tier === "low") return days * 3500;
    if (tier === "medium") return days * 7000;
    return days * 14000;
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

  function placeLabel(place) {
    return [place.name, place.admin1, place.country].filter(Boolean).join(", ");
  }

  /** Narrows Open-Meteo geocoding results by an optional ", state" part and removes duplicates. */
  function filterGeocodeResults(results, query) {
    const region = String(query || "").split(",").slice(1).map((p) => p.trim()).filter(Boolean).join(" ").toLowerCase();
    let list = (results || []).filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number");
    if (region) {
      const matching = list.filter((r) =>
        [r.admin1, r.admin2, r.country].some((field) => field && field.toLowerCase().includes(region))
      );
      if (matching.length) list = matching;
    }
    const seen = new Set();
    return list.filter((r) => {
      const key = `${r.name}|${r.admin1}|${r.country}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Keeps Wikipedia geosearch pages that look like attractions, photos first. */
  function selectAttractions(pages, townName) {
    const town = String(townName || "").toLowerCase();
    return (pages || [])
      .filter((page) => page.description && !NOT_ATTRACTION.test(page.description))
      .filter((page) => !page.title.toLowerCase().startsWith(`${town},`) && page.title.toLowerCase() !== town)
      .sort((a, b) => Number(Boolean(b.thumbnail)) - Number(Boolean(a.thumbnail)) || (a.index || 0) - (b.index || 0))
      .map((page) => ({
        name: page.title,
        description: page.description,
        image: page.thumbnail?.source || null,
        lat: page.coordinates?.[0]?.lat ?? null,
        lon: page.coordinates?.[0]?.lon ?? null,
        url: `https://en.wikipedia.org/?curid=${page.pageid}`
      }));
  }

  function weatherNote(daysWeather) {
    const known = (daysWeather || []).filter((d) => !d.unavailable);
    if (!known.length && (daysWeather || []).some((d) => d.failed)) {
      return "Couldn't load the forecast right now. Plan again in a moment to get it.";
    }
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

  /** Trip settings + resolved place -> URL query string for a shareable link. */
  function encodeShare(input, place) {
    const params = new URLSearchParams();
    params.set("to", input.destination);
    if (place) {
      params.set("place", place.name);
      if (place.admin1) params.set("region", place.admin1);
      if (place.country) params.set("country", place.country);
      params.set("lat", Number(place.latitude).toFixed(4));
      params.set("lon", Number(place.longitude).toFixed(4));
    }
    params.set("days", String(input.days));
    params.set("start", input.startDate);
    params.set("budget", input.tier);
    if (input.tier === "custom") params.set("custom", String(input.custom));
    params.set("mode", input.modeType);
    return params.toString();
  }

  /** Parses a share link back into trip settings. Returns null if there is no trip in the URL. */
  function decodeShare(search, today) {
    const params = new URLSearchParams(search);
    const destination = (params.get("to") || "").trim().slice(0, 100);
    if (!destination) return null;
    const days = Math.min(Math.max(parseInt(params.get("days"), 10) || 3, 1), 14);
    const tier = BUDGET_TIERS.includes(params.get("budget")) ? params.get("budget") : "low";
    const modeType = MODES.includes(params.get("mode")) ? params.get("mode") : "balanced";
    const custom = Math.max(parseInt(params.get("custom"), 10) || 0, 0);
    const start = params.get("start");
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(start || "") && start >= today ? start : today;
    const lat = parseFloat(params.get("lat"));
    const lon = parseFloat(params.get("lon"));
    const place =
      isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
        ? {
            name: (params.get("place") || destination).slice(0, 100),
            admin1: (params.get("region") || "").slice(0, 100) || undefined,
            country: (params.get("country") || "").slice(0, 100) || undefined,
            latitude: lat,
            longitude: lon
          }
        : null;
    return { destination, days, tier, custom, modeType, startDate, place };
  }

  /** Packing list built from the trip's forecast, length and travel mode. */
  function packingList(weather, days, modeType) {
    const known = (weather || []).filter((d) => d && !d.unavailable);
    const minT = known.length ? Math.min(...known.map((d) => d.min)) : null;
    const maxT = known.length ? Math.max(...known.map((d) => d.max)) : null;
    const maxRain = known.length ? Math.max(...known.map((d) => d.rain ?? 0)) : 0;
    const snow = known.some((d) => [71, 73, 75, 77, 85, 86].includes(d.code));
    const nights = Math.max(days - 1, 1);

    const items = [
      { id: "id", label: "ID proof (Aadhaar, passport or driving licence)", group: "Essentials" },
      { id: "tickets", label: "Tickets and hotel bookings (offline copy)", group: "Essentials" },
      { id: "cash", label: "Some cash and a UPI-ready phone", group: "Essentials" },
      { id: "charger", label: "Phone charger and power bank", group: "Essentials" },
      { id: "meds", label: "Personal medicines and a small first-aid kit", group: "Essentials" },
      { id: "clothes", label: `Clothes for ${days} day${days > 1 ? "s" : ""} (${nights + 1} sets)`, group: "Clothing" },
      { id: "shoes", label: "Comfortable walking shoes", group: "Clothing" }
    ];

    if (minT !== null && minT <= 5) {
      items.push({ id: "thermals", label: `Thermals, a heavy jacket, gloves and a woollen cap (lows of ${minT}°C)`, group: "Weather" });
    } else if (minT !== null && minT <= 15) {
      items.push({ id: "jacket", label: `A warm jacket for mornings and evenings (lows of ${minT}°C)`, group: "Weather" });
    }
    if (snow) items.push({ id: "snow", label: "Waterproof boots for snow", group: "Weather" });
    if (maxRain >= 40) items.push({ id: "rain", label: `Umbrella or rain jacket (up to ${maxRain}% chance of rain)`, group: "Weather" });
    if (maxT !== null && maxT >= 30) {
      items.push({ id: "sun", label: `Sunscreen, sunglasses and a cap (highs of ${maxT}°C)`, group: "Weather" });
      items.push({ id: "water", label: "A refillable water bottle", group: "Weather" });
    }
    if (modeType === "adventure") {
      items.push({ id: "daypack", label: "Day backpack for hikes", group: "Activities" });
      items.push({ id: "torch", label: "Torch or headlamp", group: "Activities" });
    }
    if (modeType === "luxury") {
      items.push({ id: "outfit", label: "One smart outfit for dinners", group: "Activities" });
    }
    return items;
  }

  /** Adds a trip to the saved list: newest first, no duplicates, at most `limit`. */
  function addSavedTrip(list, trip, limit = 10) {
    const others = (list || []).filter((t) => t.query !== trip.query);
    return [trip, ...others].slice(0, limit);
  }

  return {
    packingList,
    addSavedTrip,
    NOT_ATTRACTION,
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
    decodeShare
  };
});
