const mongoose = require('mongoose');

const placeImagesSchema = new mongoose.Schema(
  {
    normalizedName: { type: String, required: true },
    normalizedCity: { type: String, required: true },
    name: { type: String, required: true },
    city: { type: String, required: true },
    imageUrl: { type: String, default: null },
    photos: { type: [mongoose.Schema.Types.Mixed], default: [] },
    description: { type: String, default: null },
    wikipediaTitle: { type: String, default: null },
  },
  { timestamps: true, collection: 'placeimages' }
);

placeImagesSchema.index({ normalizedName: 1, normalizedCity: 1 }, { unique: true });

module.exports = mongoose.model('PlaceImages', placeImagesSchema);
