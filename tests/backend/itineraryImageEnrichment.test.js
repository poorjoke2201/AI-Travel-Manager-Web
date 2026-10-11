const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isWikipediaTitleMatch,
  normalizePlacePart,
  wikipediaPageTitle,
  chooseWikipediaTitle,
} = require('../../server/src/services/trip/itineraryImageEnrichment.service');

test('Wikipedia image matching accepts exact and close multi-word place titles', () => {
  assert.equal(isWikipediaTitleMatch('Mysore Palace', 'Mysore Palace'), true);
  assert.equal(isWikipediaTitleMatch('Mysore Palace', 'Mysore Palace (building)'), true);
  assert.equal(isWikipediaTitleMatch('Chamundi Hill', 'Chamundi Hills'), true);
  assert.equal(isWikipediaTitleMatch('Mysore Palace', 'Palace of Mysore'), true);
});

test('Wikipedia title matching rejects unreliable short and unrelated results', () => {
  assert.equal(isWikipediaTitleMatch('Palace', 'Mysore Palace'), false);
  assert.equal(isWikipediaTitleMatch('GRS Fantasy Park', 'Fantasy'), false);
  assert.equal(isWikipediaTitleMatch('Mysore Palace', 'Mysore Zoo'), false);
});

test('Wikipedia search checks later results for a close place-title match', () => {
  assert.equal(chooseWikipediaTitle('Mysore Palace', [
    { title: 'Mysore' },
    { title: 'Mysore Palace' },
    { title: 'Mysore Zoo' },
  ]), 'Mysore Palace');
  assert.equal(chooseWikipediaTitle('GRS Fantasy Park', [
    { title: 'Fantasy' },
    { title: 'Mysore attractions' },
  ]), null);
});

test('place cache normalization is accent-insensitive and whitespace-stable', () => {
  assert.equal(normalizePlacePart('  Café   Palace '), 'cafe palace');
});

test('Wikipedia references accept article URLs and page titles', () => {
  assert.equal(wikipediaPageTitle('Mysore_Palace'), 'Mysore Palace');
  assert.equal(wikipediaPageTitle('https://en.wikipedia.org/wiki/Mysore_Palace'), 'Mysore Palace');
  assert.equal(wikipediaPageTitle('https://en.wikipedia.org/wiki/Mysore_Palace_(building)'), 'Mysore Palace (building)');
  assert.equal(wikipediaPageTitle('https://example.com/place'), null);
});
