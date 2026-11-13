const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../planner-core.js");

test("budget tiers and breakdown add up", () => {
  assert.equal(core.getTotalBudget(3, "low"), 10500);
  assert.equal(core.getTotalBudget(3, "medium"), 21000);
  assert.equal(core.getTotalBudget(3, "high"), 42000);
  assert.equal(core.getTotalBudget(3, "custom", 1000), 5000, "custom has a ₹5,000 floor");
  const b = core.planBudget(4, "medium");
  assert.equal(b.transport + b.stay + b.food + b.activities, b.total);
  assert.equal(b.perNight, Math.round(b.stay / 4));
});

test("geocoding results can be narrowed by state and are de-duplicated", () => {
  const results = [
    { name: "Manali", admin1: "Tamil Nadu", country: "India", latitude: 13.1, longitude: 80.2 },
    { name: "Manali", admin1: "Himachal Pradesh", country: "India", latitude: 32.2, longitude: 77.1 },
    { name: "Manali", admin1: "Tamil Nadu", country: "India", latitude: 13.2, longitude: 80.3 },
    { name: "Broken", admin1: "X", country: "Y" }
  ];
  assert.equal(core.filterGeocodeResults(results, "Manali").length, 2);
  const himachal = core.filterGeocodeResults(results, "Manali, Himachal");
  assert.equal(himachal.length, 1);
  assert.equal(himachal[0].admin1, "Himachal Pradesh");
});

test("only attraction-like Wikipedia pages are kept, photos first", () => {
  const pages = [
    { pageid: 1, title: "Manali, Himachal Pradesh", description: "Town in India", thumbnail: { source: "a" } },
    { pageid: 2, title: "Manali Assembly constituency", description: "Legislative Assembly constituency in India" },
    { pageid: 3, title: "Rehala Falls", description: "Waterfall in Himachal Pradesh", index: 1 },
    { pageid: 4, title: "Hidimba Devi Temple", description: "Hindu temple", thumbnail: { source: "t" }, index: 5, coordinates: [{ lat: 32.24, lon: 77.18 }] },
    { pageid: 5, title: "Dhundhar", description: "Historical region in Rajasthan, India" }
  ];
  const kept = core.selectAttractions(pages, "Manali");
  assert.deepEqual(kept.map((p) => p.name), ["Hidimba Devi Temple", "Rehala Falls"]);
  assert.equal(kept[0].lat, 32.24);
  assert.equal(kept[1].lat, null);
});

test("itinerary spreads places over days and never repeats a food spot in a day", () => {
  const places = ["A", "B", "C", "D", "E"].map((name) => ({ name }));
  const food = [{ name: "Cafe 1" }];
  const weather = [{ date: "2026-11-12" }, { date: "2026-11-13" }, { date: "2026-11-14" }];
  const plan = core.buildItinerary(3, places, food, weather, "Jaipur");
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((d) => d.places.length), [2, 2, 1]);
  assert.equal(plan[0].title, "Arrive and settle in");
  assert.equal(plan[2].title, "Last sights and departure");
  assert.equal(plan[0].food.length, 1);
});

test("days without places become free days", () => {
  const plan = core.buildItinerary(2, [], [], [{}, {}], "Ooty");
  assert.match(plan[1].freeTime, /Ooty/);
});

test("weather tips react to cold and rain", () => {
  assert.match(core.weatherNote([{ min: 2, max: 10, rain: 80 }]), /warm layers.*umbrella/);
  assert.match(core.weatherNote([{ min: 20, max: 28, rain: 5 }]), /comfortable/);
  assert.match(core.weatherNote([{ unavailable: true }]), /16 days/);
  assert.match(core.weatherNote([{ unavailable: true, failed: true }]), /Couldn't load/);
});

test("share links round-trip the trip and the exact place", () => {
  const input = { destination: "Manali", days: 3, startDate: "2026-12-01", tier: "medium", custom: 0, modeType: "adventure" };
  const place = { name: "Manali", admin1: "Himachal Pradesh", country: "India", latitude: 32.2432, longitude: 77.1892 };
  const decoded = core.decodeShare(core.encodeShare(input, place), "2026-11-12");
  assert.equal(decoded.destination, "Manali");
  assert.equal(decoded.days, 3);
  assert.equal(decoded.startDate, "2026-12-01");
  assert.equal(decoded.tier, "medium");
  assert.equal(decoded.modeType, "adventure");
  assert.equal(decoded.place.admin1, "Himachal Pradesh");
  assert.equal(decoded.place.latitude, 32.2432);
});

test("share links are validated", () => {
  assert.equal(core.decodeShare("", "2026-11-12"), null);
  const d = core.decodeShare("to=Goa&days=99&budget=gold&mode=x&start=2020-01-01&lat=999&lon=0", "2026-11-12");
  assert.equal(d.days, 14);
  assert.equal(d.tier, "low");
  assert.equal(d.modeType, "balanced");
  assert.equal(d.startDate, "2026-11-12", "past start dates move to today");
  assert.equal(d.place, null, "invalid coordinates are ignored");
});

test("escapeHtml neutralises markup", () => {
  assert.equal(core.escapeHtml(`<img src=x onerror="a">`), "&lt;img src=x onerror=&quot;a&quot;&gt;");
});

test("addDays crosses month boundaries", () => {
  assert.equal(core.addDays("2026-11-30", 1), "2026-12-01");
});

test("packing list reacts to cold, rain, heat and trip mode", () => {
  const ids = (w, days, mode) => core.packingList(w, days, mode).map((i) => i.id);
  const cold = ids([{ min: 2, max: 10, rain: 70, code: 73 }], 3, "adventure");
  for (const id of ["thermals", "snow", "rain", "daypack", "torch", "id"]) assert.ok(cold.includes(id), id);
  assert.ok(!cold.includes("sun"));
  const hot = ids([{ min: 24, max: 36, rain: 0, code: 0 }], 2, "luxury");
  for (const id of ["sun", "water", "outfit"]) assert.ok(hot.includes(id), id);
  assert.ok(!hot.includes("jacket") && !hot.includes("thermals"));
  const unknown = ids([{ unavailable: true }], 1, "balanced");
  assert.ok(unknown.includes("clothes") && !unknown.includes("rain"));
});

test("saved trips: newest first, no duplicates, capped", () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = core.addSavedTrip(list, { query: `q${i}`, label: `Trip ${i}` });
  assert.equal(list.length, 10);
  assert.equal(list[0].query, "q11");
  list = core.addSavedTrip(list, { query: "q5", label: "Trip 5 again" });
  assert.equal(list[0].label, "Trip 5 again");
  assert.equal(list.filter((t) => t.query === "q5").length, 1);
});
