# AI Video Generator

Full-stack AI video generator optimized for the Uzbekistan market (Payme / Click / Uzum payments, Uzbek UI).

**Stack:** Node.js + Express · MongoDB · single-file vanilla HTML/CSS/JS · Railway-ready

---

## Features

- Text prompt → AI video (optional reference image)
- Aspect ratio: 16:9 / 9:16 / 1:1
- Duration: 3s / 5s / 10s (credit cost configurable)
- Job polling with live progress UI
- In-browser video player + download
- Generation history per user
- Credits system + payment packages
- Auth: phone + OTP (Telegram bot ready) **or** email + password
- Dark, mobile-first, Uzbek-language UI
- Swappable AI provider via `API_PROVIDER` env (`mock` | `kling` | `runway` | `veo`)

---

## Quick start (local)

```bash
cp .env.example .env
# edit .env – at minimum set MONGO_URI and JWT_SECRET

npm install
# Make sure MongoDB is running, or use MongoDB Atlas URI

npm run dev   # or npm start
# open http://localhost:3000
```

With `API_PROVIDER=mock` (default) no external AI key is required — a sample video is returned after ~8–15 s.

---

## Environment variables

See `.env.example` for the full list. Important ones:

| Variable | Description |
|----------|-------------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Long random string for tokens |
| `API_PROVIDER` | `mock` / `kling` / `runway` / `veo` |
| `API_KEY` | Provider API key |
| `API_BASE_URL` | Optional override of provider base URL |
| `PAYME_MERCHANT_ID` / `PAYME_SECRET_KEY` | Payme merchant credentials |
| `CLICK_MERCHANT_ID` / `CLICK_SERVICE_ID` / `CLICK_SECRET_KEY` | Click credentials |
| `TELEGRAM_BOT_TOKEN` | Optional – send OTP via Telegram |

---

## API overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/request-otp` | — | Send OTP to phone |
| POST | `/api/auth/verify-otp` | — | Verify OTP → JWT |
| POST | `/api/auth/register` | — | Email + password register |
| POST | `/api/auth/login` | — | Email + password login |
| GET | `/api/auth/me` | ✓ | Current user |
| POST | `/api/generate` | ✓ | Start generation (multipart) |
| GET | `/api/generate/status/:jobId` | ✓ | Poll job status |
| GET | `/api/history` | ✓ | Past generations |
| GET | `/api/payment/packages` | — | Credit packages |
| POST | `/api/payment/create` | ✓ | Create payment session |
| POST | `/api/payment/webhook/payme` | — | Payme callback |
| POST | `/api/payment/webhook/click` | — | Click callback |
| GET | `/api/health` | — | Health check |

---

## Plugging in a real AI video API

1. Set `API_PROVIDER=kling` (or `runway`) and `API_KEY=...`
2. Open `utils/aiProvider.js`
3. Replace the TODO sections inside `klingCreateJob` / `klingGetStatus` (or runway equivalents) with the exact request/response shape from the provider docs.
4. Map provider status strings to our internal `pending | processing | completed | failed`.

The frontend and the rest of the backend stay unchanged.

---

## Payments (Uzbekistan)

- **Payme** – implement full JSON-RPC Merchant API methods in `routes/payment.js` → `/webhook/payme`. Verify the Authorization header with `PAYME_SECRET_KEY`.
- **Click** – verify `sign_string` (MD5) and handle action 0 / 1 in `/webhook/click`.
- **Uzum** – placeholder; add according to current Uzum merchant docs.

After a successful webhook the user’s `credits` balance is incremented and a `Transaction` record is marked `completed`.

---

## Deploy on Railway

1. Create a new Railway project.
2. Add a **MongoDB** plugin (or use Atlas and set `MONGO_URI`).
3. Connect the GitHub repo (or deploy from CLI).
4. Set environment variables from `.env.example`.
5. Railway will detect `package.json` and run `npm start`.
6. Point `FRONTEND_URL` to your Railway public domain.
7. Configure Payme/Click webhook URLs to `https://your-app.up.railway.app/api/payment/webhook/payme` (etc.).

---

## Project structure

```
├── server.js              # Express entry
├── package.json
├── .env.example
├── models/
│   ├── User.js
│   ├── Generation.js
│   └── Transaction.js
├── routes/
│   ├── auth.js
│   ├── generate.js
│   ├── history.js
│   └── payment.js
├── middleware/
│   └── auth.js
├── utils/
│   ├── aiProvider.js      # ← swap AI providers here
│   └── otp.js             # ← plug Telegram bot here
└── public/
    └── index.html         # full SPA (CSS + JS embedded)
```

---

## License

MIT – use freely for commercial or personal projects.
