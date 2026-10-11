const test = require('node:test');
const assert = require('node:assert/strict');
const {
  profileUpdateSchema,
  phoneChangeSchema,
  verifyPhoneChangeSchema,
} = require('../../server/src/validators/profile.validator');

test('profile update validates name, city/country and the 80-character tagline limit', () => {
  assert.equal(profileUpdateSchema.safeParse({
    name: 'A traveller',
    location: { city: 'Mysuru', country: 'India' },
    tagline: 'Collecting moments, not things',
  }).success, true);
  assert.equal(profileUpdateSchema.safeParse({ tagline: 'x'.repeat(81) }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ location: { city: 'x'.repeat(101) } }).success, false);
  assert.equal(profileUpdateSchema.safeParse({}).success, false);
  assert.equal(profileUpdateSchema.safeParse({ phoneNumber: '+919876543210' }).success, false);
});

test('travel preferences accept only the shared Create Trip option lists', () => {
  assert.equal(profileUpdateSchema.safeParse({
    preferences: {
      placePreferences: ['Nature', 'Historical'],
      foodPreferences: ['Vegetarian'],
      travelStyle: 'moderate',
      pace: 'balanced',
      transportPreference: 'train',
      accommodationPreference: 'hotel',
    },
  }).success, true);
  assert.equal(profileUpdateSchema.safeParse({ preferences: { placePreferences: ['Skydiving'] } }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ preferences: { transportPreference: 'spaceship' } }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ preferences: {} }).success, false);
});

test('phone changes require a valid number and six-digit verification code', () => {
  assert.equal(phoneChangeSchema.safeParse({ phoneNumber: '+919876543210' }).success, true);
  assert.equal(phoneChangeSchema.safeParse({ phoneNumber: 'not-a-phone' }).success, false);
  assert.equal(verifyPhoneChangeSchema.safeParse({
    phoneNumber: '+919876543210',
    code: '123456',
  }).success, true);
  assert.equal(verifyPhoneChangeSchema.safeParse({
    phoneNumber: '+919876543210',
    code: '12345',
  }).success, false);
});
