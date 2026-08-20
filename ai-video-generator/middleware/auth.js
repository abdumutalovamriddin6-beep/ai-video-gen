const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(user) {
  return jwt.sign(
    { id: user._id, phone: user.phone, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autorizatsiya talab qilinadi' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'Foydalanuvchi topilmadi' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati o\'tgan' });
  }
}

// Optional auth – attaches user if token present, otherwise continues
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(payload.id);
  } catch (_) {
    /* ignore */
  }
  next();
}

module.exports = { signToken, authMiddleware, optionalAuth, JWT_SECRET };
