const express = require('express');
const router = express.Router();
const Generation = require('../models/Generation');
const { authMiddleware } = require('../middleware/auth');

/**
 * GET /api/history
 * Query: ?page=1&limit=20
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Generation.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-referenceImage -providerMeta')
        .lean(),
      Generation.countDocuments({ user: req.user._id }),
    ]);

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('history error:', err);
    res.status(500).json({ error: 'Tarixni yuklashda xato' });
  }
});

/**
 * DELETE /api/history/:id
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await Generation.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!deleted) {
      return res.status(404).json({ error: 'Topilmadi' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'O\'chirishda xato' });
  }
});

module.exports = router;
