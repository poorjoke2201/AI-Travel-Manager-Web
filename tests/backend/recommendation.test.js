const test = require('node:test');
const assert = require('node:assert/strict');
const { budgetScore, candidateDataQualityScore, candidateQualityScore, preferenceMatchScore, proximityScore, weightedScore } = require('../../server/src/services/recommendation/scoring.service');

test('recommendation scoring keeps values in the expected range', () => {
	assert.equal(preferenceMatchScore(['beach', 'museum'], ['Beach', 'nature']), 0.5);
	assert.equal(budgetScore(500, 1000), 0.85);
	assert.equal(proximityScore(5, 10), 0.5);
	assert.equal(weightedScore({ preference: 0.5, rating: 0.5 }, { preference: 1, rating: 0 }), 0.5);
});

test('candidate quality prefers verified popularity signals without penalizing unknown values as zero', () => {
	const popular = candidateQualityScore({ popularityScore: 0.9, googleRating: 4.7, reviewCountLakhs: 2, confidence: 0.95, sourceCount: 3, wikidataId: 'Q1' });
	const unknown = candidateQualityScore({});

	assert.ok(popular > unknown);
	assert.ok(unknown > 0);
});

test('candidate data quality rewards usable itinerary metadata', () => {
	const complete = candidateDataQualityScore({
		latitude: 12.3,
		longitude: 76.6,
		description: 'A real place',
		openingTime: '09:00',
		closingTime: '18:00',
		website: 'https://example.com',
		category: 'Heritage',
	});

	assert.equal(complete, 1);
	assert.ok(candidateDataQualityScore({}) < complete);
});
