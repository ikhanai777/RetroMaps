// Routing (FOSSGIS OSRM servers on OpenStreetMap data) plus turn-by-turn helpers.

const PROFILES = {
  drive: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  walk: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
};

export async function fetchRoute(from, to, mode) {
  const url = `${PROFILES[mode]}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('No route found');
  const r = json.routes[0];
  const steps = r.legs.flatMap((leg) => leg.steps).map((s) => ({
    text: instruction(s),
    location: s.maneuver.location,
    distance: s.distance,
    type: s.maneuver.type,
    modifier: s.maneuver.modifier || '',
  }));
  return { geometry: r.geometry, distance: r.distance, duration: r.duration, steps };
}

function instruction(s) {
  const m = s.maneuver;
  const road = s.name ? ` onto ${s.name}` : '';
  const mod = m.modifier || '';
  switch (m.type) {
    case 'depart': return `Head ${dirWord(m.bearing_after)}${s.name ? ` on ${s.name}` : ''}`;
    case 'arrive': return 'You have arrived';
    case 'roundabout':
    case 'rotary': return `At the roundabout, take ${m.exit ? `exit ${m.exit}` : 'the exit'}${road}`;
    case 'merge': return `Merge ${mod}${road}`.trim();
    case 'on ramp': return `Take the ramp${mod ? ` on the ${mod}` : ''}${road}`;
    case 'off ramp': return `Take the exit${mod ? ` on the ${mod}` : ''}${road}`;
    case 'fork': return `Keep ${mod.replace('slight ', '')} at the fork${road}`;
    case 'end of road': return `At the end of the road, turn ${mod}${road}`;
    case 'continue':
    case 'new name': return `Continue${mod && mod !== 'straight' ? ` ${mod}` : ''}${road}`;
    default:
      if (mod === 'straight') return `Go straight${road}`;
      if (mod === 'uturn') return `Make a U-turn${road}`;
      return `Turn ${mod}${road}`.trim();
  }
}

function dirWord(bearing = 0) {
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(bearing / 45) % 8];
}

export function arrowFor(step) {
  if (step.type === 'arrive') return '★';
  const m = step.modifier;
  if (m.includes('uturn')) return '↶';
  if (m.includes('sharp left') || m === 'left') return '←';
  if (m.includes('slight left')) return '↖';
  if (m.includes('sharp right') || m === 'right') return '→';
  if (m.includes('slight right')) return '↗';
  return '↑';
}

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distance in metres from point p to a polyline, using a local flat projection (fine at city scale).
export function distanceToLine(p, coords) {
  const kx = Math.cos(rad(p[1])) * R * (Math.PI / 180);
  const ky = R * (Math.PI / 180);
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = (coords[i][0] - p[0]) * kx, ay = (coords[i][1] - p[1]) * ky;
    const bx = (coords[i + 1][0] - p[0]) * kx, by = (coords[i + 1][1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const x = ax + t * dx, y = ay + t * dy;
    best = Math.min(best, Math.hypot(x, y));
  }
  return best;
}

export function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function fmtDistance(m) {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`;
}

export function fmtDuration(s) {
  const min = Math.max(1, Math.round(s / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

// Points along a line every `step` metres, used by the demo drive.
export function densify(coords, step = 8) {
  const out = [coords[0]];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1];
    const n = Math.max(1, Math.round(haversine(a, b) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
