// Nightly snapshot of every eatery in Dubai from OpenStreetMap (run by .github/workflows/refresh-data.yml).
import { mkdir, writeFile } from 'node:fs/promises';
import { fetchOverpass, toRows } from '../js/osm.js';

const json = await fetchOverpass({
  extraHeaders: { 'User-Agent': 'RetroDubai/1.0 (+https://github.com/ikhanai777/RetroMaps)' },
  rounds: 3,
});
const rows = toRows(json).sort((a, b) => a[0].localeCompare(b[0]));
if (rows.length < 500) throw new Error(`Only ${rows.length} places returned; refusing to overwrite the snapshot.`);
const out = { updated: new Date().toISOString(), count: rows.length, source: 'OpenStreetMap contributors (ODbL)', rows };
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(new URL('../data/restaurants.json', import.meta.url), JSON.stringify(out));
console.log(`Wrote ${rows.length} places`);
