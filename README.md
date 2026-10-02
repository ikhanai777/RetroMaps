# Retro Dubai

Every restaurant in Dubai on a retro 3D map, with live GPS turn-by-turn directions. Free, runs in any phone browser, no API keys.

## What it does

- **Retro 3D city:** real building heights for all of Dubai from OpenStreetMap, rendered flat-shaded in a synthwave night palette or a desert 8-bit day palette (switches by Dubai local time, toggle with ☾/☀). Optional CRT scanlines and chunky pixels (▤).
- **All the eateries:** every restaurant, fast food place, cafe and food court OpenStreetMap lists inside the Emirate of Dubai, as 8-bit pins that cluster when zoomed out. Filter by type, search by name, Arabic name or cuisine (results sorted by distance).
- **Restaurant card:** hours, address, phone, website, a link to fix the listing on OpenStreetMap, and one-tap hand-off to Google Maps or Waze.
- **Live GPS navigation:** car or walking routes, a turn banner with distance, voice prompts, ETA, automatic rerouting when you leave the route, and arrival detection. **Demo drive** replays the route as fake GPS so you can try it from a desk.
- **Installable:** add to home screen as an app (web manifest).

## Run it locally

It is a static site with no build step:

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

GPS needs HTTPS or `localhost`. To host it on your own server (or have an agent do it), follow [DEPLOY_LOCAL.md](DEPLOY_LOCAL.md).

## Data and services

| What | Source | Notes |
| --- | --- | --- |
| Map tiles and 3D buildings | [OpenFreeMap](https://openfreemap.org) (OpenMapTiles schema) | Free, no key |
| Restaurants | [OpenStreetMap](https://www.openstreetmap.org) via the Overpass API | Nightly snapshot in `data/restaurants.json`; the app queries Overpass live if no snapshot exists |
| Routing | [FOSSGIS OSRM](https://routing.openstreetmap.de) car and foot profiles | Fair-use public servers; swap for Mapbox, HERE or a self-hosted OSRM/Valhalla before heavy traffic |
| Map engine | [MapLibre GL JS](https://maplibre.org) 6 | Loaded from unpkg |

The **Refresh restaurant data** GitHub Action (`.github/workflows/refresh-data.yml`) rebuilds the snapshot every night at 02:30 Dubai time and on demand from the Actions tab.

Map data © OpenStreetMap contributors, available under the ODbL.

## Code map

| File | Job |
| --- | --- |
| `index.html`, `css/style.css` | Layout and the pixel UI |
| `js/app.js` | Map setup, layers, search, cards, GPS and navigation flow |
| `js/style.js` | The two retro map themes |
| `js/sprites.js` | Pixel-art pins drawn from text grids |
| `js/osm.js` | Overpass query and the compact row format (shared with the data script) |
| `js/nav.js` | Routing calls, turn instructions, distance maths |
| `scripts/fetch-restaurants.mjs` | Builds `data/restaurants.json` |

## Next steps

See the product spec for later phases: Metro routing, offline city pack, mall floors, native apps, and optional affiliate links on delivery and booking buttons.
