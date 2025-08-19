#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { feature } from 'topojson-client';
import { geoPath } from 'd3-geo';
import { geoRobinson } from 'd3-geo-projection';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'public', 'data');
const landPath = path.join(dataDir, 'land-110m.json');
const countriesPath = path.join(dataDir, 'countries-110m.json');
let world;
if (fs.existsSync(landPath)) {
  const landTopo = JSON.parse(fs.readFileSync(landPath, 'utf8'));
  world = feature(landTopo, landTopo.objects.land);
} else if (fs.existsSync(countriesPath)) {
  const topo = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
  world = feature(topo, topo.objects.countries);
} else {
  console.error('Missing TopoJSON: expected land-110m.json or countries-110m.json');
  process.exit(1);
}

const width = 2000;
const height = 1100;
const projection = geoRobinson().fitSize([width, height], world);
const pathGen = geoPath(projection);

let paths = '';
for (const f of world.features) {
  const d = pathGen(f);
  if (d) paths += `    <path d="${d}"/>
`;
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Natural Earth-derived (World Atlas 110m) Robinson projection. Public Domain. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="World map (Robinson)">
  <defs>
    <style>
      /* Super-light coastline stroke only; no interior borders when using land-110m */
      .land { fill: #cfe5ff; stroke: #2b6cb0; stroke-width: 0.6; }
    </style>
  </defs>
  <g class="land" opacity="0.98">
${paths}  </g>
</svg>`;

const outDir = path.join(__dirname, '..', 'public', 'images');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'world-map-robinson-ne.svg');
fs.writeFileSync(outFile, svg, 'utf8');
console.log('Wrote', outFile);
