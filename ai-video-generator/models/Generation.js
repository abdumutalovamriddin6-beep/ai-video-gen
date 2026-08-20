const mongoose = require('mongoose');

const generationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    prompt: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    // Optional reference image (base64 or stored URL)
    referenceImage: {
      type: String,
      default: null,
    },
    aspectRatio: {
      type: String,
      enum: ['9:16', '16:9', '1:1'],
      default: '16:9',
    },
    duration: {
      type: Number,
      enum: [3, 5, 10],
      default: 5,
    },
    // Provider job tracking
    jobId: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      default: 'mock',
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    videoUrl: {
      type: String,
      default: null,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    creditsUsed: {
      type: Number,
      default: 1,
    },
    // Raw provider response for debugging
    providerMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

generationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Generation', generationSchema);
