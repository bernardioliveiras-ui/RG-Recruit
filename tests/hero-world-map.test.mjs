import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const asset = name => readFile(new URL('../public/' + name, import.meta.url), 'utf8');

test('hero shows a recognizable global map with Europe highlighted instead of the oversized logo', async () => {
  const html = await asset('index.html');
  const heroArtwork = html.match(/<div class="atlas"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/u)?.[1];
  assert.ok(heroArtwork, 'hero illustration is present');
  assert.match(heroArtwork, /<svg[^>]+class="world-map"[^>]+viewBox="0 0 780 480"/u);
  assert.ok((heroArtwork.match(/class="map-landmass"/gu) || []).length >= 5, 'separate continent silhouettes');
  assert.ok((heroArtwork.match(/class="map-route"/gu) || []).length >= 3, 'global connection routes');
  assert.match(heroArtwork, /class="[^"]*map-europe-highlight[^"]*"/u);
  assert.match(heroArtwork, /EUROPA/u);
  assert.doesNotMatch(heroArtwork, /hero-mark|rg-mark\.png/u);
});

test('world map retains responsive sizing and honors reduced motion', async () => {
  const html = await asset('index.html');
  const css = await asset('premium.css');
  assert.match(html, /class="brand"[\s\S]*?src="\/assets\/rg-mark\.png"/u, 'brand still owns the RG logo');
  assert.match(css, /\.world-map\s*\{/u);
  assert.match(css, /@media\s*\(max-width:\s*650px\)[\s\S]*?\.world-map/u);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.map-route/u);
});
