const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { authMiddleware } = require('../middleware/auth');

/**
 * Credit packages (UZS)
 * Adjust prices for your market.
 */
const PACKAGES = [
  { id: 'pack_10', credits: 10, price: 15000, label: '10 kredit' },
  { id: 'pack_30', credits: 30, price: 40000, label: '30 kredit' },
  { id: 'pack_100', credits: 100, price: 120000, label: '100 kredit' },
];

/**
 * GET /api/payment/packages
 */
router.get('/packages', (_req, res) => {
  res.json({ packages: PACKAGES });
});

/**
 * POST /api/payment/create
 * Body: { packageId, provider: "payme" | "click" | "uzum" }
 * Returns a payment URL or form data the frontend can redirect to.
 */
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { packageId, provider } = req.body;
    const pkg = PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      return res.status(400).json({ error: 'Paket topilmadi' });
    }
    if (!['payme', 'click', 'uzum'].includes(provider)) {
      return res.status(400).json({ error: 'Noto\'g\'ri to\'lov tizimi' });
    }

    const tx = await Transaction.create({
      user: req.user._id,
      provider,
      amount: pkg.price,
      creditsAdded: pkg.credits,
      status: 'pending',
    });

    // ---------------------------------------------------------------
    // PAYME integration (Merchant API)
    // Docs: https://developer.help.paycom.uz
    // In production you generate a payment link or use Checkout form.
    // ---------------------------------------------------------------
    if (provider === 'payme') {
      // Example: redirect to Payme checkout
      // Real implementation uses merchant_id + amount + account
      const merchantId = process.env.PAYME_MERCHANT_ID || 'TEST_MERCHANT';
      const amountTiyin = pkg.price * 100; // Payme uses tiyin
      const paymentUrl = `https://checkout.paycom.uz/${merchantId}?amount=${amountTiyin}&account[order_id]=${tx._id}`;

      return res.json({
        success: true,
        transactionId: tx._id,
        paymentUrl,
        provider: 'payme',
      });
    }

    // ---------------------------------------------------------------
    // CLICK integration
    // Docs: https://docs.click.uz
    // ---------------------------------------------------------------
    if (provider === 'click') {
      const merchantId = process.env.CLICK_MERCHANT_ID || 'TEST';
      const serviceId = process.env.CLICK_SERVICE_ID || 'TEST';
      // Click usually uses a form POST or prepared URL
      const paymentUrl = `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${pkg.price}&transaction_param=${tx._id}`;

      return res.json({
        success: true,
        transactionId: tx._id,
        paymentUrl,
        provider: 'click',
      });
    }

    // ---------------------------------------------------------------
    // UZUM Bank / Uzum Pay (placeholder)
    // ---------------------------------------------------------------
    if (provider === 'uzum') {
      return res.json({
        success: true,
        transactionId: tx._id,
        paymentUrl: `https://uzumbank.uz/pay?amount=${pkg.price}&order=${tx._id}`,
        provider: 'uzum',
        message: 'Uzum integratsiyasi demo rejimida',
      });
    }
  } catch (err) {
    console.error('payment create error:', err);
    res.status(500).json({ error: 'To\'lov yaratishda xato' });
  }
});

/**
 * POST /api/payment/webhook/payme
 * Payme sends JSON-RPC style callbacks.
 * You must verify signature / auth header in production.
 */
router.post('/webhook/payme', express.json(), async (req, res) => {
  try {
    // ---------------------------------------------------------------
    // REAL IMPLEMENTATION:
    // 1. Verify Authorization header with PAYME_SECRET_KEY
    // 2. Handle methods: CheckPerformTransaction, CreateTransaction,
    //    PerformTransaction, CancelTransaction, CheckTransaction
    // See official Payme Merchant API docs.
    // ---------------------------------------------------------------

    const { method, params } = req.body || {};
    console.log('[Payme webhook]', method, params);

    // Demo: if PerformTransaction arrives with our order_id – credit the user
    if (method === 'PerformTransaction' && params?.account?.order_id) {
      const tx = await Transaction.findById(params.account.order_id);
      if (tx && tx.status === 'pending') {
        tx.status = 'completed';
        tx.externalId = String(params.id || '');
        tx.rawPayload = req.body;
        await tx.save();

        await User.findByIdAndUpdate(tx.user, {
          $inc: { credits: tx.creditsAdded },
        });
      }
    }

    // Always respond in Payme expected format
    res.json({ result: { allow: true } });
  } catch (err) {
    console.error('Payme webhook error:', err);
    res.status(500).json({ error: { code: -32400, message: 'Internal error' } });
  }
});

/**
 * POST /api/payment/webhook/click
 * Click sends form-urlencoded or JSON depending on version.
 */
router.post('/webhook/click', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    // ---------------------------------------------------------------
    // REAL IMPLEMENTATION:
    // Verify sign_string = md5(click_trans_id + service_id + SECRET_KEY + ...)
    // Handle action 0 (prepare) and action 1 (complete)
    // ---------------------------------------------------------------

    const body = req.body;
    console.log('[Click webhook]', body);

    const orderId = body.merchant_trans_id || body.transaction_param;
    if (orderId && (body.action === '1' || body.action === 1)) {
      const tx = await Transaction.findById(orderId);
      if (tx && tx.status === 'pending') {
        // Optional signature check
        // const sign = crypto.createHash('md5')...
        tx.status = 'completed';
        tx.externalId = String(body.click_trans_id || '');
        tx.rawPayload = body;
        await tx.save();

        await User.findByIdAndUpdate(tx.user, {
          $inc: { credits: tx.creditsAdded },
        });
      }
    }

    // Click expects specific response codes
    res.json({
      click_trans_id: body.click_trans_id,
      merchant_trans_id: orderId,
      error: 0,
      error_note: 'Success',
    });
  } catch (err) {
    console.error('Click webhook error:', err);
    res.status(500).json({ error: -1, error_note: 'Internal error' });
  }
});

/**
 * POST /api/payment/webhook/uzum  (placeholder)
 */
router.post('/webhook/uzum', express.json(), async (req, res) => {
  console.log('[Uzum webhook]', req.body);
  // Implement according to Uzum merchant docs
  res.json({ success: true });
});

/**
 * DEV ONLY: manually add credits (remove in production)
 */
router.post('/dev-add-credits', authMiddleware, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Faqat development rejimida' });
  }
  const amount = Math.min(100, Math.max(1, parseInt(req.body.amount, 10) || 10));
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $inc: { credits: amount } },
    { new: true }
  );
  res.json({ success: true, credits: user.credits });
});

module.exports = router;
