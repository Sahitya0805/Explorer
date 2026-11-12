# Explorer

A trip planner that turns a destination, number of days and budget into a complete, day-wise travel plan in Indian rupees, and lets you download the whole itinerary as a single file.

**Live demo:** https://explorer-ochre.vercel.app

## Features

- **Instant trip plan** – pick a destination, 1–14 days, a budget tier (Low / Medium / High / Custom) and a travel mode (Balanced / Luxury / Adventure).
- **Budget breakdown in INR** – transport, stay, food and activities, with a total.
- **Full plan** – suggested transport, hotel and restaurant picks, an estimated weather snapshot and a day-by-day schedule.
- **Downloadable itinerary** – exports the plan as a standalone HTML file with images, ready to share or print.
- **Visuals** – destination photos (Unsplash, with a Picsum fallback) and switchable animated backgrounds (Forest / Beach).
- **Login / sign-up** – accounts and saved trips are stored in the browser (localStorage).

## Tech stack

JavaScript · HTML/CSS · Vercel (static hosting)

## Run locally

It is a static site:

```bash
npx serve .
```

Then open http://localhost:3000.

## Project structure

```
index.html   Planner page
hindex.js    Plan generation, budget logic, itinerary download
inde.css     Styles
auth.html    Login / sign-up page
auth.js      Browser-stored accounts
assets/      Background videos and images
```

## Roadmap

- Live weather from a forecast API instead of estimates.
- A backend for real accounts and saved trips across devices.
