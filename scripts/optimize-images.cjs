#!/usr/bin/env node
/**
 * Optimize team & hero images: create WebP versions and compressed originals.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const imagesDir = path.join(__dirname, '..', 'public', 'images');
const targets = [
  'Logan.png','Moe.png','Haidan.png','John.png','HeroImage.png'
];

(async () => {
  for (const file of targets) {
    const src = path.join(imagesDir, file);
    if (!fs.existsSync(src)) { console.warn('Missing image', file); continue; }
    const base = path.parse(src).name;
    const webpOut = path.join(imagesDir, base + '.webp');
    try {
      await sharp(src).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 75 }).toFile(webpOut);
      console.log('Created WebP:', path.basename(webpOut));
    } catch (e) {
      console.error('Error converting', file, e.message);
    }
  }
})();
