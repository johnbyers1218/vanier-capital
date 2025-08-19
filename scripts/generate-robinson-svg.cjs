#!/usr/bin/env node
/*
  Generates a simple Robinson-projected world silhouette SVG from coarse lon/lat polygons.
  Output: public/images/world-map-robinson.svg
  Note: This is a simplified silhouette for fallback purposes, not full Natural Earth fidelity.
*/

const fs = require('fs');
const path = require('path');

// Coarse world polygons (lon, lat)
const POLYS = [
  // North America
  [
    [-168, 72], [-130, 72], [-100, 65], [-80, 50], [-90, 30], [-100, 18], [-125, 20], [-160, 35], [-168, 55], [-168, 72]
  ],
  // South America
  [
    [-82, 12], [-60, 10], [-50, -10], [-55, -30], [-60, -45], [-72, -50], [-80, -35], [-82, 12]
  ],
  // Europe/Africa/West Asia
  [
    [-10, 72], [10, 68], [30, 62], [40, 50], [55, 40], [65, 30], [55, 20], [35, 15], [25, 5], [15, -5], [10, -20], [5, -35], [-5, -35], [-10, -5], [-10, 20], [-10, 40], [-10, 72]
  ],
  // East Asia
  [
    [65, 55], [90, 50], [110, 45], [120, 35], [125, 25], [135, 35], [140, 45], [150, 50], [160, 55], [170, 60], [170, 45], [150, 35], [140, 25], [130, 15], [110, 20], [90, 25], [75, 35], [65, 55]
  ],
  // Southern Africa connection
  [
    [15, -5], [20, -15], [22, -25], [25, -35], [28, -32], [30, -25], [32, -15], [30, -5]
  ],
  // Australia
  [
    [112, -12], [155, -12], [155, -43], [114, -43], [112, -12]
  ]
];

// Robinson projection (table-driven), outputs [x,y] in pixels for given width/height
function robinsonProject(lon, lat, width, height) {
  const RX = [
    0.8487,0.847,0.8442,0.8423,0.8405,0.8386,0.8368,0.8349,0.833,0.8311,
    0.8293,0.8274,0.8256,0.8237,0.8218,0.8199,0.818,0.8162,0.8143
  ];
  const RY = [
    0,0.0837,0.1671,0.2503,0.3333,0.4162,0.499,0.5816,0.6642,0.7466,
    0.8289,0.911,0.9931,1.075,1.1566,1.2379,1.3189,1.3994,1.4796
  ];
  const absLat = Math.abs(lat);
  const deg = Math.min(90, Math.max(0, absLat));
  const i = Math.min(18, Math.floor(deg / 5));
  const f = Math.min(1, Math.max(0, (deg - i * 5) / 5));
  const rx = i < 18 ? RX[i] + (RX[i + 1] - RX[i]) * f : RX[18];
  const ry = i < 18 ? RY[i] + (RY[i + 1] - RY[i]) * f : RY[18];
  const R = height / (2 * 1.48);
  const x = R * rx * (lon * Math.PI / 180);
  const y = R * (lat < 0 ? -ry : ry);
  const cx = width / 2 + x;
  const cy = height / 2 - y;
  return [cx, cy];
}

function polyToPath(poly, w, h) {
  return poly.map(([lon, lat], idx) => {
    const [x, y] = robinsonProject(lon, lat, w, h);
    return `${idx ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + ' Z';
}

function buildSvg(width, height) {
  const paths = POLYS.map(p => `<path d="${polyToPath(p, width, height)}"/>`).join('\n    ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Simplified Robinson world silhouette (public domain). Replace with full Natural Earth Robinson for higher fidelity when ready. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="World map (Robinson)">
  <defs>
    <style>
      .land { fill: #cfe5ff; stroke: #2b6cb0; stroke-width: 1.2; }
    </style>
  </defs>
  <g class="land" opacity="0.96">
    ${paths}
  </g>
</svg>`;
}

const outDir = path.join(__dirname, '..', 'public', 'images');
const outPath = path.join(outDir, 'world-map-robinson.svg');
const width = 2000;
const height = 1100; // Slightly taller to fit Robinson extents nicely

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, buildSvg(width, height), 'utf8');
console.log(`Wrote ${outPath}`);
