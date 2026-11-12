# Explorer

A trip planner that turns any destination, start date, number of days and budget into a day-wise plan built from **real data**: notable places and photos from Wikipedia, the weather forecast for your dates, and nearby places to stay and eat — with an INR budget breakdown and a downloadable itinerary.

**Live demo:** https://explorer-ochre.vercel.app

## Features

- **Finds the right place** – looks the destination up with the Open-Meteo geocoding API, ranks same-name matches by how many notable places are nearby (so "Manali" means the Himachal hill station), and offers the others under "Not this place?". Typing "Manali, Himachal" narrows it by state.
- **Real attractions with photos** – notable places within 10 km from the Wikipedia GeoSearch API, spread across the days of the trip, each linking to its article.
- **Weather for your dates** – daily forecast (up to 16 days ahead) from Open-Meteo, with packing tips based on temperature and rain chance.
- **Stays and restaurants nearby** – real hotels, guest houses, restaurants and cafés from OpenStreetMap (Overpass API). Loaded in the background; if the public map service is busy, the app says so and links to Google Maps instead.
- **Budget breakdown in INR** – transport, stay, food and activities for Low / Medium / High / Custom budgets, with a per-night stay budget.
- **Downloadable itinerary** – exports the plan as a standalone HTML file, ready to share or print.
- **Login / sign-up** – accounts and saved trips are stored in the browser (localStorage).

No API keys are needed — every data source is free and public.

## Tech stack

JavaScript · HTML/CSS · Open-Meteo API · Wikipedia API · OpenStreetMap Overpass API · Vercel (static hosting)

## Run locally

It is a static site:

```bash
npx serve .
```

Then open http://localhost:3000.

## Project structure

```
index.html   Planner page
hindex.js    Geocoding, data fetching, plan building, rendering and itinerary download
inde.css     Styles
auth.html    Login / sign-up page
auth.js      Browser-stored accounts
assets/      Background videos and images
```

## Data sources

Weather and geocoding: [Open-Meteo](https://open-meteo.com) · Places and photos: [Wikipedia](https://www.wikipedia.org) · Stays and restaurants: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
