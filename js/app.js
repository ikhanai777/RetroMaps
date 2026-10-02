import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs';
import { makeStyle } from './style.js';
import { registerSprites, CATEGORIES } from './sprites.js';
import { fetchOverpass, toRows, rowToFeature } from './osm.js';
import * as nav from './nav.js';

const DOWNTOWN = [55.2744, 25.1972];
const DUBAI_MALL = [55.2796, 25.1985];
const BOUNDS = [[54.85, 24.6], [55.75, 25.45]];
const CACHE_KEY = 'rd-rows-v1';
const CACHE_MS = 24 * 3600 * 1000;

const LANDMARKS = [
  ['Burj Khalifa', 55.2744, 25.1972],
  ['Burj Al Arab', 55.1853, 25.1412],
  ['Museum of the Future', 55.2820, 25.2192],
  ['Dubai Frame', 55.3003, 25.2353],
  ['Atlantis The Palm', 55.1171, 25.1304],
  ['Dubai Creek', 55.3270, 25.2600],
  ['Mall of the Emirates', 55.2006, 25.1181],
];

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};

const state = {
  theme: dubaiHour() >= 6 && dubaiHour() < 18 ? 'day' : 'night',
  crt: store.get('rd-crt') ?? true,
  rows: [],
  enabled: new Set(CATEGORIES.map((_, i) => i)),
  selected: null, // {props, coord}
  mode: 'drive',
  me: null,
  heading: null,
  watchId: null,
  marker: null,
  follow: false,
  route: null,
  navigating: false,
  stepIdx: 1,
  warned: -1,
  offRoute: 0,
  lastReroute: 0,
  voice: true,
  demo: null,
};

function dubaiHour() {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Dubai' }).format(new Date()));
}

// ---------- map ----------
document.body.dataset.theme = state.theme;
document.body.classList.toggle('no-crt', !state.crt);
$('btn-crt').classList.toggle('on', state.crt);
$('btn-theme').textContent = state.theme === 'night' ? '☀' : '☾';

const map = new maplibregl.Map({
  container: 'map',
  style: makeStyle(state.theme),
  center: DOWNTOWN,
  zoom: 14.6,
  pitch: 62,
  bearing: -28,
  maxPitch: 75,
  maxBounds: BOUNDS,
  attributionControl: false,
  pixelRatio: state.crt ? 0.75 : window.devicePixelRatio,
});
window.__map = map; // handy for debugging in the console

map.on('style.load', addLayers);
map.on('dragstart', () => { state.follow = false; });

function addLayers() {
  registerSprites(map);
  map.addSource('eats', {
    type: 'geojson', data: filteredCollection(), cluster: true, clusterMaxZoom: 15, clusterRadius: 48,
  });
  map.addSource('selected', { type: 'geojson', data: selectedCollection() });
  map.addSource('route', { type: 'geojson', data: routeCollection() });
  map.addSource('landmarks', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: LANDMARKS.map(([name, lon, lat]) => ({ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: [lon, lat] } })) },
  });

  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'square' },
    paint: { 'line-color': '#000', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 17, 16] } });
  map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'butt' },
    paint: { 'line-color': '#39ff6a', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 17, 10], 'line-dasharray': [1, 1] } });

  map.addLayer({ id: 'clusters', type: 'circle', source: 'eats', filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#19c3d6', 25, '#ffd23f', 100, '#ff8a3d', 400, '#ff2bd6'],
      'circle-radius': ['step', ['get', 'point_count'], 16, 25, 21, 100, 27, 400, 34],
      'circle-stroke-width': 4, 'circle-stroke-color': '#000', 'circle-pitch-alignment': 'map',
    } });
  map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'eats', filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'text-allow-overlap': true },
    paint: { 'text-color': '#000' } });
  map.addLayer({ id: 'eats', type: 'symbol', source: 'eats', filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['match', ['get', 'cat'], 1, 'pin-fast_food', 2, 'pin-cafe', 3, 'pin-food_court', 'pin-restaurant'],
      'icon-anchor': 'bottom', 'icon-allow-overlap': true,
      'text-field': ['step', ['zoom'], '', 16.5, ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': 12,
      'text-anchor': 'top', 'text-offset': [0, 0.3], 'text-optional': true,
    },
    paint: { 'text-color': state.theme === 'night' ? '#fff' : '#2a1745', 'text-halo-color': state.theme === 'night' ? '#000' : '#fff6df', 'text-halo-width': 2 } });
  map.addLayer({ id: 'landmarks', type: 'symbol', source: 'landmarks',
    layout: {
      'icon-image': 'pin-star', 'icon-anchor': 'bottom', 'icon-allow-overlap': true,
      'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-transform': 'uppercase',
      'text-anchor': 'top', 'text-offset': [0, 0.3], 'text-optional': true,
    },
    paint: { 'text-color': '#ffd23f', 'text-halo-color': '#000', 'text-halo-width': 2 } });
  map.addLayer({ id: 'selected', type: 'symbol', source: 'selected',
    layout: {
      'icon-image': ['match', ['get', 'cat'], 1, 'pin-fast_food-sel', 2, 'pin-cafe-sel', 3, 'pin-food_court-sel', 'pin-restaurant-sel'],
      'icon-anchor': 'bottom', 'icon-size': 1.5, 'icon-allow-overlap': true,
    } });
}

// dash animation on the route line, like an RPG path
const DASHES = [[0, 1, 1], [0.25, 1, 0.75], [0.5, 1, 0.5], [0.75, 1, 0.25], [1, 1, 0], [0, 0.25, 1, 0.75], [0, 0.5, 1, 0.5], [0, 0.75, 1, 0.25]];
let dashStep = 0;
setInterval(() => {
  if (!state.route || !map.getLayer('route-line')) return;
  dashStep = (dashStep + 1) % DASHES.length;
  map.setPaintProperty('route-line', 'line-dasharray', DASHES[dashStep]);
}, 120);

// ---------- data ----------
function filteredCollection() {
  return { type: 'FeatureCollection', features: state.rows.filter((r) => state.enabled.has(r[5])).map(rowToFeature) };
}
function selectedCollection() {
  if (!state.selected) return { type: 'FeatureCollection', features: [] };
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: state.selected.props, geometry: { type: 'Point', coordinates: state.selected.coord } }] };
}
function routeCollection() {
  return { type: 'FeatureCollection', features: state.route ? [{ type: 'Feature', properties: {}, geometry: state.route.geometry }] : [] };
}
function refreshEats() { map.getSource('eats')?.setData(filteredCollection()); }

function progress(msg, pct) {
  $('loading-msg').textContent = msg;
  $('loading-bar').style.width = `${pct}%`;
}

async function loadRestaurants() {
  progress('LOADING RESTAURANTS...', 30);
  try {
    const res = await fetch('data/restaurants.json', { cache: 'no-cache' });
    if (res.ok) {
      const json = await res.json();
      if (json.rows?.length) return { rows: json.rows, updated: json.updated, source: 'snapshot' };
    }
  } catch { /* no snapshot yet, fall through to live data */ }

  const cached = store.get(CACHE_KEY);
  if (cached?.rows?.length && Date.now() - cached.t < CACHE_MS) return { rows: cached.rows, updated: new Date(cached.t).toISOString(), source: 'cache' };

  progress('DOWNLOADING LIVE FROM OPENSTREETMAP...', 55);
  const rows = toRows(await fetchOverpass());
  store.set(CACHE_KEY, { t: Date.now(), rows });
  return { rows, updated: new Date().toISOString(), source: 'live' };
}

// ---------- UI: chips & search ----------
function renderChips() {
  const counts = CATEGORIES.map(() => 0);
  for (const r of state.rows) counts[r[5]]++;
  $('chips').innerHTML = '';
  CATEGORIES.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.enabled.has(i) ? '' : ' off');
    b.setAttribute('aria-pressed', state.enabled.has(i));
    b.innerHTML = `<span class="dot" style="background:${c.color}"></span>${c.label} <small>${counts[i].toLocaleString()}</small>`;
    b.onclick = () => {
      state.enabled.has(i) ? state.enabled.delete(i) : state.enabled.add(i);
      if (!state.enabled.size) state.enabled.add(i);
      renderChips();
      refreshEats();
      runSearch();
    };
    $('chips').append(b);
  });
}

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
let searchTimer;
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 120); });
$('search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('results').querySelector('li')?.click();
  if (e.key === 'Escape') { $('search').value = ''; runSearch(); }
});

function runSearch() {
  const q = norm($('search').value.trim());
  const list = $('results');
  if (q.length < 2) { list.hidden = true; return; }
  const origin = state.me || map.getCenter().toArray();
  const hits = [];
  for (const r of state.rows) {
    if (!state.enabled.has(r[5])) continue;
    if (norm(r[3]).includes(q) || r[4].includes(q) || norm(r[6]).includes(q)) hits.push([nav.haversine(origin, [r[2], r[1]]), r]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  list.innerHTML = '';
  if (!hits.length) list.innerHTML = '<li>No matches. Try another word.</li>';
  for (const [d, r] of hits.slice(0, 30)) {
    const li = document.createElement('li');
    li.innerHTML = `<span></span><small>${nav.fmtDistance(d)}</small>`;
    li.firstChild.textContent = `${r[3]}${r[6] ? ' · ' + r[6] : ''}`;
    li.onclick = () => { list.hidden = true; $('search').blur(); select(rowToFeature(r).properties, [r[2], r[1]], true); };
    list.append(li);
  }
  list.hidden = false;
}
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) $('results').hidden = true; });

// ---------- selection card ----------
map.on('click', 'eats', (e) => {
  const f = e.features[0];
  select(f.properties, f.geometry.coordinates, false);
});
map.on('click', 'clusters', async (e) => {
  const f = e.features[0];
  const zoom = await map.getSource('eats').getClusterExpansionZoom(f.properties.cluster_id);
  map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(zoom + 0.2, 18) });
});
map.on('click', 'landmarks', (e) => {
  new maplibregl.Popup({ closeButton: false }).setLngLat(e.features[0].geometry.coordinates).setText(`★ ${e.features[0].properties.name}`).addTo(map);
});
for (const l of ['eats', 'clusters', 'landmarks']) {
  map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
}

function select(props, coord, fly) {
  if (state.navigating) return;
  state.selected = { props, coord };
  map.getSource('selected')?.setData(selectedCollection());
  const cat = CATEGORIES[props.cat] || CATEGORIES[0];
  $('card-cat').textContent = `${cat.label.toUpperCase()}${props.cuisine ? ' · ' + props.cuisine.toUpperCase() : ''}`;
  $('card-cat').style.color = cat.color;
  $('card-name').textContent = props.name;
  $('card-ar').textContent = props.ar || '';
  const facts = $('card-facts');
  facts.innerHTML = '';
  const add = (k, v, href) => {
    if (!v) return;
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd');
    if (href) { const a = document.createElement('a'); a.href = href; a.textContent = v; a.target = '_blank'; a.rel = 'noopener'; dd.append(a); } else dd.textContent = v;
    facts.append(dt, dd);
  };
  if (state.me) add('Distance', `${nav.fmtDistance(nav.haversine(state.me, coord))} away`);
  add('Hours', props.hours);
  add('Address', props.addr);
  add('Phone', props.phone, props.phone ? `tel:${props.phone.replace(/[^+\d]/g, '')}` : null);
  if (props.web) add('Website', props.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), props.web.startsWith('http') ? props.web : `https://${props.web}`);
  add('OSM', 'View or fix listing', `https://www.openstreetmap.org/${{ n: 'node', w: 'way', r: 'relation' }[props.osm[0]]}/${props.osm.slice(1)}`);
  updateHandoffLinks();
  $('route-info').textContent = '';
  $('card').hidden = false;
  if (fly) map.flyTo({ center: coord, zoom: Math.max(map.getZoom(), 17), padding: { bottom: 260 }, pitch: 60 });
  else map.easeTo({ center: coord, padding: { bottom: 260 } });
}

function updateHandoffLinks() {
  if (!state.selected) return;
  const [lon, lat] = state.selected.coord;
  $('btn-gmaps').href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=${state.mode === 'walk' ? 'walking' : 'driving'}`;
  $('btn-waze').href = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
}

function closeCard() {
  $('card').hidden = true;
  state.selected = null;
  map.getSource('selected')?.setData(selectedCollection());
  map.easeTo({ padding: { bottom: 0 } });
}
$('card-close').onclick = closeCard;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !state.navigating && !$('card').hidden) closeCard(); });

document.querySelectorAll('.mode').forEach((b) => {
  b.onclick = () => {
    state.mode = b.dataset.mode;
    document.querySelectorAll('.mode').forEach((x) => x.classList.toggle('on', x === b));
    updateHandoffLinks();
  };
});

// ---------- GPS ----------
function startWatch() {
  if (state.watchId != null || !('geolocation' in navigator)) return;
  state.watchId = navigator.geolocation.watchPosition(
    (pos) => { if (!state.demo) onPosition([pos.coords.longitude, pos.coords.latitude], pos.coords.heading); },
    (err) => toast(err.code === 1 ? 'Location permission denied. Directions start from Dubai Mall instead.' : 'Could not get your location.'),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
  );
}

function waitForFix(ms = 8000) {
  if (state.me) return Promise.resolve(state.me);
  startWatch();
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (state.me || Date.now() - t0 > ms) { clearInterval(iv); resolve(state.me); }
    }, 200);
  });
}

function insideDubai(p) {
  return p[0] > BOUNDS[0][0] && p[0] < BOUNDS[1][0] && p[1] > BOUNDS[0][1] && p[1] < BOUNDS[1][1];
}

function onPosition(p, heading) {
  const first = !state.me;
  if (state.me && (heading == null || Number.isNaN(heading)) && nav.haversine(state.me, p) > 3) heading = nav.bearing(state.me, p);
  state.me = p;
  if (heading != null && !Number.isNaN(heading)) state.heading = heading;

  if (!state.marker) {
    const el = document.createElement('div');
    el.className = 'me no-heading';
    el.innerHTML = '<div class="ring"></div><div class="cone"></div><div class="core"></div>';
    state.marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(p).addTo(map);
  }
  state.marker.setLngLat(p);
  if (state.heading != null) { state.marker.getElement().classList.remove('no-heading'); state.marker.setRotation(state.heading); }

  if (first && !state.navigating) {
    if (insideDubai(p)) { state.follow = true; map.flyTo({ center: p, zoom: 16.5, pitch: 60 }); } else toast('You are outside Dubai, so the map stays on Downtown.');
  }
  if (state.navigating) navUpdate(p);
  else if (state.follow) map.easeTo({ center: p, duration: 600 });
}

$('btn-locate').onclick = async () => {
  state.follow = true;
  if (state.me) map.flyTo({ center: state.me, zoom: Math.max(map.getZoom(), 16), pitch: 60 });
  else { toast('Finding you...'); startWatch(); }
};

// ---------- navigation ----------
$('btn-go').onclick = async () => {
  if (!state.selected) return;
  $('route-info').textContent = 'Getting your location...';
  let from = await waitForFix();
  if (!from || !insideDubai(from)) {
    from = DUBAI_MALL;
    toast('No GPS fix in Dubai. Route starts from Dubai Mall (use DEMO DRIVE to try it).');
  }
  $('route-info').textContent = 'Plotting route...';
  try {
    state.route = await nav.fetchRoute(from, state.selected.coord, state.mode);
  } catch (e) {
    $('route-info').textContent = `${e.message}. Try Google Maps or Waze.`;
    return;
  }
  state.routeFrom = from;
  map.getSource('route').setData(routeCollection());
  startNavigation(from);
};

function startNavigation(from) {
  state.navigating = true;
  state.stepIdx = Math.min(1, state.route.steps.length - 1);
  state.warned = -1;
  state.offRoute = 0;
  state.follow = true;
  $('route-info').textContent = '';
  document.body.classList.add('navigating');
  $('card').hidden = true;
  $('navbanner').hidden = false;
  $('navpanel').hidden = false;
  $('btn-demo').textContent = 'DEMO DRIVE';
  speak(`${state.route.steps[0].text}. ${nav.fmtDuration(state.route.duration)} to ${state.selected.props.name}.`);
  const b = new maplibregl.LngLatBounds(from, from);
  state.route.geometry.coordinates.forEach((c) => b.extend(c));
  map.fitBounds(b, { padding: { top: 140, bottom: 160, left: 40, right: 80 }, pitch: 45, duration: 1200 });
  setTimeout(() => state.navigating && navUpdate(state.me && insideDubai(state.me) ? state.me : from, true), 1300);
}

function navUpdate(p, initial = false) {
  const r = state.route;
  if (!r) return;
  const dest = state.selected.coord;
  const toDest = nav.haversine(p, dest);
  if (toDest < 30) return arrive();

  // off-route detection and reroute
  if (!initial && nav.distanceToLine(p, r.geometry.coordinates) > 45) {
    state.offRoute++;
    if (state.offRoute >= 3 && Date.now() - state.lastReroute > 10000) reroute(p);
  } else state.offRoute = 0;

  // advance through manoeuvres as we pass them
  while (state.stepIdx < r.steps.length - 1 && nav.haversine(p, r.steps[state.stepIdx].location) < 22) state.stepIdx++;
  const step = r.steps[state.stepIdx];
  const toStep = nav.haversine(p, step.location);
  if (state.warned !== state.stepIdx && toStep < (state.mode === 'drive' ? 300 : 60)) {
    state.warned = state.stepIdx;
    speak(`In ${nav.fmtDistance(toStep)}, ${step.text}`);
  }
  $('nav-arrow').textContent = nav.arrowFor(step);
  $('nav-dist').textContent = nav.fmtDistance(toStep);
  $('nav-instr').textContent = step.text;

  let left = toStep;
  for (let k = state.stepIdx; k < r.steps.length; k++) left += r.steps[k].distance;
  left = Math.max(left, toDest);
  const secs = (r.duration / Math.max(r.distance, 1)) * left;
  $('nav-left').textContent = nav.fmtDistance(left);
  $('nav-eta').textContent = `${nav.fmtDuration(secs)} · arrive ${new Date(Date.now() + secs * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  if (state.follow && !initial) {
    map.easeTo({ center: p, zoom: state.mode === 'drive' ? 17 : 18, pitch: 65, bearing: state.heading ?? map.getBearing(), duration: 900, padding: { top: 120, bottom: 120 } });
  }
}

async function reroute(p) {
  state.lastReroute = Date.now();
  state.offRoute = 0;
  toast('Rerouting...');
  speak('Rerouting');
  try {
    state.route = await nav.fetchRoute(p, state.selected.coord, state.mode);
    state.stepIdx = Math.min(1, state.route.steps.length - 1);
    state.warned = -1;
    map.getSource('route').setData(routeCollection());
  } catch {
    toast('Could not reroute. Keep heading to the star.');
  }
}

function arrive() {
  const name = state.selected.props.name;
  speak(`You have arrived at ${name}. Enjoy your meal!`);
  stopNavigation();
  toast(`★ ARRIVED AT ${name.toUpperCase()} ★`);
}

function stopNavigation() {
  stopDemo();
  state.navigating = false;
  state.route = null;
  map.getSource('route')?.setData(routeCollection());
  document.body.classList.remove('navigating');
  $('navbanner').hidden = true;
  $('navpanel').hidden = true;
  if (state.selected) $('card').hidden = false;
  map.easeTo({ pitch: 60, zoom: 16, padding: { top: 0, bottom: 0 } });
}
$('btn-stop').onclick = stopNavigation;

$('btn-voice').onclick = () => {
  state.voice = !state.voice;
  $('btn-voice').textContent = state.voice ? 'VOICE ON' : 'VOICE OFF';
  $('btn-voice').classList.toggle('on', state.voice);
  if (!state.voice) window.speechSynthesis?.cancel();
};

function speak(text) {
  if (!state.voice || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  u.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

// Demo drive: replays the route as fake GPS fixes so anyone can try navigation from a desk.
$('btn-demo').onclick = () => {
  if (state.demo) return stopDemo();
  const pts = nav.densify(state.route.geometry.coordinates, 6);
  let i = 0;
  state.follow = true;
  $('btn-demo').textContent = 'STOP DEMO';
  state.demo = setInterval(() => {
    if (!state.navigating || i >= pts.length) return stopDemo();
    const prev = pts[Math.max(0, i - 3)];
    onPosition(pts[i], nav.haversine(prev, pts[i]) > 1 ? nav.bearing(prev, pts[i]) : state.heading);
    i += state.mode === 'drive' ? 3 : 1;
  }, 250);
};
function stopDemo() {
  if (state.demo) clearInterval(state.demo);
  state.demo = null;
  $('btn-demo').textContent = 'DEMO DRIVE';
}

// ---------- toggles ----------
$('btn-pitch').onclick = () => {
  const flat = map.getPitch() > 10;
  map.easeTo({ pitch: flat ? 0 : 62, bearing: flat ? 0 : -28 });
  $('btn-pitch').textContent = flat ? '3D' : '2D';
};
$('btn-theme').onclick = () => {
  state.theme = state.theme === 'night' ? 'day' : 'night';
  document.body.dataset.theme = state.theme;
  $('btn-theme').textContent = state.theme === 'night' ? '☀' : '☾';
  map.setStyle(makeStyle(state.theme), { diff: false });
};
$('btn-crt').onclick = () => {
  state.crt = !state.crt;
  store.set('rd-crt', state.crt);
  document.body.classList.toggle('no-crt', !state.crt);
  $('btn-crt').classList.toggle('on', state.crt);
  map.setPixelRatio(state.crt ? 0.75 : window.devicePixelRatio);
};

// Keep the round buttons above whichever bottom panel is open.
function layoutFabs() {
  const panel = [$('card'), $('navpanel')].find((el) => !el.hidden);
  const narrow = window.innerWidth < 600;
  $('fabs').style.bottom = panel && narrow ? `${panel.offsetHeight + 52}px` : '';
}
new ResizeObserver(layoutFabs).observe($('card'));
new ResizeObserver(layoutFabs).observe($('navpanel'));
window.addEventListener('resize', layoutFabs);

let toastTimer;
function toast(msg) {
  $('toast').textContent = msg;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}

// ---------- boot ----------
progress('LOADING CITY...', 10);
const mapReady = new Promise((resolve) => map.once('load', resolve));
loadRestaurants()
  .then(async ({ rows, updated, source }) => {
    state.rows = rows;
    progress(`${rows.length.toLocaleString()} RESTAURANTS FOUND`, 85);
    renderChips();
    await mapReady;
    refreshEats();
    progress('READY PLAYER ONE', 100);
    setTimeout(() => $('loading').classList.add('done'), 500);
    console.info(`Retro Dubai: ${rows.length} places from ${source}, updated ${updated}`);
  })
  .catch(async (e) => {
    console.error(e);
    await mapReady;
    $('loading').classList.add('done');
    toast('Could not load restaurants right now. Pull to refresh in a minute.');
  });
