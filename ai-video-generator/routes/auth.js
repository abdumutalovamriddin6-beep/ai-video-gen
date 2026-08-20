const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { signToken, authMiddleware } = require('../middleware/auth');
const { generateOtp, sendOtp } = require('../utils/otp');

const OTP_EXPIRE_MS = (parseInt(process.env.OTP_EXPIRE_MINUTES, 10) || 5) * 60 * 1000;
const FREE_CREDITS = parseInt(process.env.FREE_CREDITS, 10) || 3;

/**
 * POST /api/auth/request-otp
 * Body: { phone: "+998901234567" }
 */
router.post('/request-otp', async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Telefon raqami kerak' });
    }
    // Normalize: keep digits and leading +
    phone = phone.replace(/[^\d+]/g, '');
    if (!phone.startsWith('+')) phone = '+' + phone;

    if (!/^\+998\d{9}$/.test(phone) && process.env.NODE_ENV === 'production') {
      // Soft check – allow any in dev
      return res.status(400).json({ error: 'Faqat O\'zbekiston (+998) raqamlari qo\'llab-quvvatlanadi' });
    }

    let user = await User.findOne({ phone });
    if (!user) {
      user = new User({ phone, credits: FREE_CREDITS });
    }

    const code = generateOtp(6);
    user.otp = {
      code,
      expiresAt: new Date(Date.now() + OTP_EXPIRE_MS),
    };
    await user.save();

    await sendOtp(phone, code);

    res.json({
      success: true,
      message: 'OTP yuborildi',
      // In development expose the code for convenience
      ...(process.env.NODE_ENV !== 'production' ? { devCode: code } : {}),
    });
  } catch (err) {
    console.error('request-otp error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Body: { phone, code }
 */
router.post('/verify-otp', async (req, res) => {
  try {
    let { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: 'Telefon va kod kerak' });
    }
    phone = phone.replace(/[^\d+]/g, '');
    if (!phone.startsWith('+')) phone = '+' + phone;

    const user = await User.findOne({ phone });
    if (!user || !user.otp || !user.otp.code) {
      return res.status(400).json({ error: 'Avval OTP so\'rang' });
    }

    if (user.otp.expiresAt < new Date()) {
      return res.status(400).json({ error: 'OTP muddati o\'tgan' });
    }

    if (user.otp.code !== String(code).trim()) {
      return res.status(400).json({ error: 'Noto\'g\'ri kod' });
    }

    user.otp = undefined;
    user.isVerified = true;
    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        credits: user.credits,
      },
    });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

/**
 * POST /api/auth/register  (email + password fallback)
 * Body: { email, password, name? }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Email va kamida 6 belgidan iborat parol kerak' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      name: name || '',
      credits: FREE_CREDITS,
      isVerified: true,
    });

    const token = signToken(user);
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        credits: user.credits,
      },
    });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email va parol kerak' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        credits: user.credits,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authMiddleware, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      phone: req.user.phone,
      email: req.user.email,
      name: req.user.name,
      credits: req.user.credits,
    },
  });
});

module.exports = router;
