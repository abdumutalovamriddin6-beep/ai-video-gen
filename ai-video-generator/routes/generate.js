const express = require('express');
const router = express.Router();
const multer = require('multer');
const Generation = require('../models/Generation');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { createGenerationJob, getGenerationStatus, PROVIDER } = require('../utils/aiProvider');

// In-memory multer for optional reference image (max 5 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Faqat JPEG, PNG yoki WebP rasm qabul qilinadi'));
    }
  },
});

function getCreditCost(duration) {
  const map = {
    3: parseInt(process.env.CREDIT_COST_3S, 10) || 1,
    5: parseInt(process.env.CREDIT_COST_5S, 10) || 2,
    10: parseInt(process.env.CREDIT_COST_10S, 10) || 4,
  };
  return map[duration] || 2;
}

/**
 * POST /api/generate
 * multipart/form-data or JSON:
 *   prompt (required)
 *   aspectRatio: 9:16 | 16:9 | 1:1
 *   duration: 3 | 5 | 10
 *   image (optional file)
 */
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const prompt = (req.body.prompt || '').trim();
    if (!prompt || prompt.length < 3) {
      return res.status(400).json({ error: 'Prompt kamida 3 belgidan iborat bo\'lishi kerak' });
    }
    if (prompt.length > 2000) {
      return res.status(400).json({ error: 'Prompt juda uzun (max 2000)' });
    }

    const aspectRatio = ['9:16', '16:9', '1:1'].includes(req.body.aspectRatio)
      ? req.body.aspectRatio
      : '16:9';
    const duration = [3, 5, 10].includes(Number(req.body.duration))
      ? Number(req.body.duration)
      : 5;

    const cost = getCreditCost(duration);
    const user = await User.findById(req.user._id);

    if (user.credits < cost) {
      return res.status(402).json({
        error: 'Kredit yetarli emas',
        required: cost,
        balance: user.credits,
      });
    }

    // Convert image to base64 if present
    let imageBase64 = null;
    if (req.file) {
      imageBase64 = req.file.buffer.toString('base64');
    }

    // Call AI provider
    const { jobId } = await createGenerationJob({
      prompt,
      imageBase64,
      aspectRatio,
      duration,
    });

    // Deduct credits immediately
    user.credits -= cost;
    await user.save();

    const generation = await Generation.create({
      user: user._id,
      prompt,
      referenceImage: imageBase64 ? `data:${req.file.mimetype};base64,${imageBase64.slice(0, 50)}...` : null,
      aspectRatio,
      duration,
      jobId,
      provider: PROVIDER,
      status: 'pending',
      creditsUsed: cost,
    });

    res.status(201).json({
      success: true,
      jobId: generation.jobId,
      generationId: generation._id,
      status: generation.status,
      creditsLeft: user.credits,
      message: 'Generatsiya boshlandi',
    });
  } catch (err) {
    console.error('generate error:', err);
    res.status(500).json({
      error: err.message || 'Generatsiya xatosi',
    });
  }
});

/**
 * GET /api/status/:jobId
 * Poll this endpoint every 3–5 seconds from the frontend.
 */
router.get('/status/:jobId', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const generation = await Generation.findOne({
      jobId,
      user: req.user._id,
    });

    if (!generation) {
      return res.status(404).json({ error: 'Job topilmadi' });
    }

    // Already finished – return cached result
    if (generation.status === 'completed' || generation.status === 'failed') {
      return res.json({
        status: generation.status,
        videoUrl: generation.videoUrl,
        thumbnailUrl: generation.thumbnailUrl,
        error: generation.errorMessage,
        generationId: generation._id,
      });
    }

    // Poll provider
    let result;
    try {
      result = await getGenerationStatus(jobId);
    } catch (providerErr) {
      console.error('Provider status error:', providerErr.message);
      // Don't fail the whole request – keep processing
      return res.json({
        status: 'processing',
        message: 'Tekshirilmoqda...',
      });
    }

    // Update DB
    if (result.status === 'completed') {
      generation.status = 'completed';
      generation.videoUrl = result.videoUrl;
      generation.thumbnailUrl = result.thumbnailUrl || null;
      generation.providerMeta = result;
      await generation.save();
    } else if (result.status === 'failed') {
      generation.status = 'failed';
      generation.errorMessage = result.error || 'Noma\'lum xato';
      // Refund credits on failure
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { credits: generation.creditsUsed },
      });
      await generation.save();
    } else {
      generation.status = 'processing';
      await generation.save();
    }

    res.json({
      status: generation.status,
      videoUrl: generation.videoUrl,
      thumbnailUrl: generation.thumbnailUrl,
      error: generation.errorMessage,
      generationId: generation._id,
    });
  } catch (err) {
    console.error('status error:', err);
    res.status(500).json({ error: 'Status tekshirishda xato' });
  }
});

module.exports = router;
