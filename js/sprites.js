// 8-bit pin sprites drawn from tiny pixel grids, so the app ships with no image files.
// Each icon is a 10x10 glyph on a 16x16 badge with a pointer, scaled up with hard pixels.

export const CATEGORIES = [
  { key: 'restaurant', label: 'Restaurant', color: '#ff2bd6' },
  { key: 'fast_food', label: 'Fast food', color: '#ff8a3d' },
  { key: 'cafe', label: 'Cafe', color: '#19c3d6' },
  { key: 'food_court', label: 'Food court', color: '#ffd23f' },
];

const GLYPHS = {
  // fork and knife
  restaurant: [
    '#.#.#...#.',
    '#.#.#..##.',
    '#.#.#..##.',
    '#####..##.',
    '.###...##.',
    '..#....##.',
    '..#.....#.',
    '..#.....#.',
    '..#.....#.',
    '..#.....#.',
  ],
  // burger
  fast_food: [
    '..######..',
    '.########.',
    '##.#..#.##',
    '##########',
    '..........',
    '##########',
    '.########.',
    '..........',
    '##########',
    '.########.',
  ],
  // coffee cup
  cafe: [
    '..#..#....',
    '.#..#.....',
    '..#..#....',
    '..........',
    '#######...',
    '#######.##',
    '#######..#',
    '#######.##',
    '.#####....',
    '##########',
  ],
  // tray with dome
  food_court: [
    '....##....',
    '..######..',
    '.########.',
    '##########',
    '##########',
    '##########',
    '..........',
    '##########',
    '##########',
    '..........',
  ],
  star: [
    '....##....',
    '....##....',
    '...####...',
    '##########',
    '.########.',
    '..######..',
    '..######..',
    '.###..###.',
    '.##....##.',
    '##......##',
  ],
};

const BADGE = [
  '.##############.',
  '################',
  '################',
  '################',
  '################',
  '################',
  '################',
  '################',
  '################',
  '################',
  '################',
  '################',
  '.##############.',
  '.....######.....',
  '......####......',
  '.......##.......',
];

function draw(glyph, color, scale) {
  const size = 16 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x * scale, y * scale, scale, scale); };
  // dark outline: draw badge offset in black first
  BADGE.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px(x, y, '#000'); }));
  BADGE.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '#' && x > 0 && x < 15 && y > 0 && y < 15 && BADGE[y][x - 1] === '#' && BADGE[y][x + 1] === '#' && BADGE[y - 1][x] === '#' && BADGE[y + 1][x] === '#') px(x, y, color);
  }));
  glyph.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px(x + 3, y + 2, '#fff'); }));
  return ctx.getImageData(0, 0, size, size);
}

export function registerSprites(map) {
  const scale = 2;
  for (const c of CATEGORIES) {
    for (const [suffix, col] of [['', c.color], ['-sel', '#ffffff']]) {
      const id = `pin-${c.key}${suffix}`;
      if (map.hasImage(id)) continue;
      const img = suffix ? drawSelected(GLYPHS[c.key], c.color, scale) : draw(GLYPHS[c.key], col, scale);
      map.addImage(id, img, { pixelRatio: 1 });
    }
  }
  if (!map.hasImage('pin-star')) map.addImage('pin-star', draw(GLYPHS.star, '#7a3cff', scale), { pixelRatio: 1 });
}

function drawSelected(glyph, color, scale) {
  // inverted badge: white body, coloured glyph
  const size = 16 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x * scale, y * scale, scale, scale); };
  BADGE.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px(x, y, color); }));
  BADGE.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '#' && x > 0 && x < 15 && y > 0 && y < 15 && BADGE[y][x - 1] === '#' && BADGE[y][x + 1] === '#' && BADGE[y - 1][x] === '#' && BADGE[y + 1][x] === '#') px(x, y, '#fff');
  }));
  glyph.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px(x + 3, y + 2, '#000'); }));
  return ctx.getImageData(0, 0, size, size);
}
