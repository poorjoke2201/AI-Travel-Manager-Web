const test = require('node:test');
const assert = require('node:assert/strict');
const { budgetScore, preferenceMatchScore, proximityScore, weightedScore } = require('../../server/src/services/recommendation/scoring.service');

test('recommendation scoring keeps values in the expected range', () => {
	assert.equal(preferenceMatchScore(['beach', 'museum'], ['Beach', 'nature']), 0.5);
	assert.equal(budgetScore(500, 1000), 0.85);
	assert.equal(proximityScore(5, 10), 0.5);
	assert.equal(weightedScore({ preference: 0.5, rating: 0.5 }, { preference: 1, rating: 0 }), 0.5);
});
