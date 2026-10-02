// Shared by the browser (live fallback) and scripts/fetch-restaurants.mjs (nightly snapshot).

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Every eatery inside the Emirate of Dubai's admin boundary.
export const OVERPASS_QUERY = `[out:json][timeout:120];
area["ISO3166-2"="AE-DU"]->.dubai;
nwr["amenity"~"^(restaurant|fast_food|cafe|food_court)$"](area.dubai);
out center tags;`;

const CAT_INDEX = { restaurant: 0, fast_food: 1, cafe: 2, food_court: 3 };

// Compact row: [osmType/id, lat, lon, name, nameAr, cat, cuisine, hours, phone, website, address]
export function toRows(overpassJson) {
  const rows = [];
  for (const el of overpassJson.elements || []) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const name = t['name:en'] || t.name;
    if (lat == null || lon == null || !name) continue;
    const addr = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] || t['addr:city']].filter(Boolean).join(', ');
    rows.push([
      `${el.type[0]}${el.id}`,
      Math.round(lat * 1e6) / 1e6,
      Math.round(lon * 1e6) / 1e6,
      name,
      t['name:ar'] && t['name:ar'] !== name ? t['name:ar'] : '',
      CAT_INDEX[t.amenity] ?? 0,
      (t.cuisine || '').replace(/_/g, ' '),
      t.opening_hours || '',
      t.phone || t['contact:phone'] || '',
      t.website || t['contact:website'] || '',
      addr,
    ]);
  }
  return rows;
}

export function rowToFeature(r) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [r[2], r[1]] },
    properties: {
      osm: r[0], name: r[3], ar: r[4], cat: r[5], cuisine: r[6], hours: r[7], phone: r[8], web: r[9], addr: r[10],
    },
  };
}

export async function fetchOverpass(fetchImpl = fetch) {
  let lastErr;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(OVERPASS_QUERY),
      });
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
