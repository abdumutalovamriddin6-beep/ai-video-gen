/**
 * OTP helpers.
 * In production, send the code via your existing Telegraf.js Telegram bot
 * or SMS gateway. Here we log it for development.
 */

function generateOtp(length = 6) {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * 10)];
  }
  return code;
}

async function sendOtp(phone, code) {
  // ---------------------------------------------------------------
  // PLUG IN YOUR TELEGRAM BOT HERE
  // Example with Telegraf:
  //
  // const bot = require('../bot'); // your existing Telegraf instance
  // await bot.telegram.sendMessage(
  //   process.env.TELEGRAM_OTP_CHAT_ID || phone,
  //   `Sizning AI Video Generator kodingiz: ${code}`
  // );
  // ---------------------------------------------------------------

  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const fetch = require('node-fetch');
      // Simple sendMessage – you may need chat_id mapping for phone→telegram
      const chatId = process.env.TELEGRAM_OTP_CHAT_ID;
      if (chatId) {
        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `🔐 AI Video Generator OTP: ${code}\nTelefon: ${phone}`,
            }),
          }
        );
      }
    } catch (err) {
      console.error('Telegram OTP send error:', err.message);
    }
  }

  // Always log in non-production for easy testing
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[OTP] ${phone} → ${code}`);
  }

  return true;
}

module.exports = { generateOtp, sendOtp };
