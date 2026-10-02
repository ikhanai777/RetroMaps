// Builds the retro MapLibre style on top of OpenFreeMap's OpenMapTiles vector tiles.
// Two themes: "night" (synthwave neon) and "day" (desert 8-bit).

export const THEMES = {
  night: {
    land: '#1b1035', sand: '#2a1745', park: '#123a2f', water: '#0a2a4a', waterLine: '#19c3d6',
    motorway: '#ff2bd6', trunk: '#ff8a3d', primary: '#ffd23f', secondary: '#b56cff', minor: '#4a3480',
    path: '#6f58b0', rail: '#19c3d6', airport: '#24164a',
    buildings: ['#3b2470', '#6a2fa0', '#c2389b', '#ff6b5b', '#ffd23f'],
    label: '#9be7ff', labelHalo: '#1b1035', roadLabel: '#ffd6f5',
    sky: '#12052b', horizon: '#ff2bd6', fog: '#2a0f4f', lightColor: '#ffd6ff', lightIntensity: 0.35,
  },
  day: {
    land: '#f3e2b8', sand: '#ecd29a', park: '#9fd28a', water: '#3fb6c6', waterLine: '#1f7f9a',
    motorway: '#e8505b', trunk: '#f39c3d', primary: '#f7c548', secondary: '#ffffff', minor: '#fff6df',
    path: '#c9a66b', rail: '#7d4e57', airport: '#e6d3a8',
    buildings: ['#e9d7b9', '#d9b48f', '#c4886b', '#a35f5f', '#6b3e5e'],
    label: '#3b2470', labelHalo: '#fff6df', roadLabel: '#5a3d2b',
    sky: '#7fd3ff', horizon: '#ffe3a3', fog: '#ffe9c4', lightColor: '#ffffff', lightIntensity: 0.5,
  },
};

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

function roadWidth(base) {
  return ['interpolate', ['exponential', 1.6], ['zoom'], 8, base * 0.4, 12, base, 16, base * 5, 19, base * 14];
}

export function makeStyle(themeName) {
  const t = THEMES[themeName];
  const road = (id, classes, color, base, extra = {}) => ({
    id, type: 'line', source: 'omt', 'source-layer': 'transportation',
    filter: ['all', ['in', ['get', 'class'], ['literal', classes]], ['!=', ['get', 'brunnel'], 'tunnel']],
    layout: { 'line-cap': 'square', 'line-join': 'miter' },
    paint: { 'line-color': color, 'line-width': roadWidth(base), ...extra },
  });

  return {
    version: 8,
    name: `Retro Dubai ${themeName}`,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    sky: {
      'sky-color': t.sky, 'horizon-color': t.horizon, 'fog-color': t.fog,
      'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4,
    },
    light: { anchor: 'map', color: t.lightColor, intensity: t.lightIntensity, position: [1.4, 210, 40] },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': t.land } },
      { id: 'landcover-sand', type: 'fill', source: 'omt', 'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['sand', 'bare_rock']]], paint: { 'fill-color': t.sand } },
      { id: 'landcover-green', type: 'fill', source: 'omt', 'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood', 'farmland']]], paint: { 'fill-color': t.park, 'fill-opacity': 0.8 } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': t.park } },
      { id: 'aeroway', type: 'fill', source: 'omt', 'source-layer': 'aeroway',
        filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': t.airport } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': t.water } },
      { id: 'water-edge', type: 'line', source: 'omt', 'source-layer': 'water',
        paint: { 'line-color': t.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 2], 'line-dasharray': [2, 2] } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': t.water, 'line-width': 2 } },

      road('road-path', ['path', 'track'], t.path, 0.4, { 'line-dasharray': [1, 1.5] }),
      road('road-minor', ['minor', 'service'], t.minor, 0.8),
      road('road-secondary', ['secondary', 'tertiary'], t.secondary, 1.1),
      road('road-primary', ['primary'], t.primary, 1.5),
      road('road-trunk', ['trunk'], t.trunk, 1.9),
      road('road-motorway', ['motorway'], t.motorway, 2.3),
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['rail', 'transit']]],
        paint: { 'line-color': t.rail, 'line-width': 1.5, 'line-dasharray': [3, 2] } },

      { id: 'buildings-3d', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13,
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
            0, t.buildings[0], 40, t.buildings[1], 120, t.buildings[2], 250, t.buildings[3], 500, t.buildings[4]],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, ['coalesce', ['get', 'render_height'], 6]],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.92,
          'fill-extrusion-vertical-gradient': false,
        } },

      { id: 'road-label', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': FONT, 'text-size': 11, 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 },
        paint: { 'text-color': t.roadLabel, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.5 } },
      { id: 'water-label', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
        layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': FONT, 'text-size': 12,
          'text-transform': 'uppercase', 'text-letter-spacing': 0.3 },
        paint: { 'text-color': t.waterLine, 'text-halo-color': t.labelHalo, 'text-halo-width': 1 } },
      { id: 'place-label', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'suburb', 'quarter', 'neighbourhood']]],
        layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': FONT_BOLD, 'text-transform': 'uppercase', 'text-letter-spacing': 0.15,
          'text-size': ['match', ['get', 'class'], 'city', 18, 'town', 15, 'suburb', 13, 11] },
        paint: { 'text-color': t.label, 'text-halo-color': t.labelHalo, 'text-halo-width': 2 } },
    ],
  };
}
