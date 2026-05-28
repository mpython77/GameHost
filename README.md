# 🎮 GameHost — Playable Ads Hosting Platform

Cocos Creator va boshqa Playable Ad HTML5 fayllarini **yuklash, boshqarish, test qilish va ulashish** uchun ishlab chiqilgan modular Node.js platformasi.

---

## 🚀 Tezkor ishga tushirish

```bash
cp .env.example .env       # admin user/parolni o'zgartiring
npm install
npm start                  # → http://localhost:8080
```

Birinchi kirish: `admin.html` → env'da belgilagan login/parolingiz.

---

## 🏛️ Arxitektura

```
GameHost/
├── server.js                   # entry point (thin)
├── src/
│   ├── app.js                  # Express app factory
│   ├── config/                 # env validatsiya, doimiylar
│   ├── lib/                    # logger, errors, escape, files, zip, slugify, secret-store
│   ├── db/                     # GamesDB (JSON file repository)
│   ├── services/               # business logic (games, upload, token, qr, storage)
│   ├── middleware/             # auth, rate-limits, error-handler, no-cache, multer, cors
│   ├── validators/             # tiny schema validatorlar (zod-siz)
│   ├── routes/                 # health, auth, games, upload, admin
│   └── migrations/             # eski v2.x → v3 migratsiya
├── public/                     # to'liq frontend
│   ├── index.html  play.html  upload.html  admin.html
│   ├── css/style.css  upload.css  admin.css
│   └── js/
│       ├── i18n.js  games-config.js
│       ├── lib/                # api, auth, escape, toast, util
│       └── pages/              # home, play, upload, admin
├── data/                       # runtime state (gitignored)
│   ├── games-db.json
│   ├── games/                  # uploaded games
│   ├── .admin-secret           # persistent HMAC key
│   └── .token-denylist.json    # revoked admin tokens
└── scripts/
    └── smoke-test.js           # curl-siz boshlang'ich tekshiruv
```

### Qatlamlar oqimi

```
HTTP request
   ↓
middleware (helmet, compression, cors, no-cache, rate-limit)
   ↓
route (HTTP shape only)
   ↓
validator (schema → typed value)
   ↓
service (business logic)
   ↓
db (atomic JSON writes) / fs / external lib
```

Routes hech qachon DB'ga to'g'ridan-to'g'ri tegmaydi.

---

## 🛡️ Xavfsizlik

| Mexanizm | Joylashuv |
|---|---|
| Helmet HTTP headers | `src/app.js` |
| Rate limit (upload/api/login/play/private) | `src/middleware/rate-limits.js` |
| ZIP slip + traversal himoya | `src/lib/zip.js` |
| Path traversal himoya (storage delete) | `src/lib/files.js#resolveSafe` |
| HMAC-signed admin tokenlar (timing-safe) | `src/services/token.service.js` |
| Token denylist (real logout) | `data/.token-denylist.json` |
| Persistent ADMIN_SECRET (mode 0600) | `data/.admin-secret` |
| Default `admin/admin` production'da rad etiladi | `src/config/index.js` |
| HTML escape XSS oldini olish | `src/lib/escape.js` + `public/js/lib/escape.js` |
| Multer fayl turi/hajm cheklovlari | `src/middleware/multer.js` |
| `iframe sandbox` o'yin sahifasida | `public/play.html` |

---

## ⚙️ Environment variables

| Key | Default | Eslatma |
|---|---|---|
| `PORT` | `8080` | |
| `NODE_ENV` | `development` | `production` da default credentials rad etiladi |
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | trace/debug/info/warn/error/fatal |
| `ADMIN_USERNAME` | `admin` | production'da MAJBURIY o'zgartirish |
| `ADMIN_PASSWORD` | `admin` | production'da MAJBURIY o'zgartirish |
| `ADMIN_SECRET` | (auto-generated) | persistent fayl bilan saqlanadi |
| `ADMIN_TOKEN_TTL_MS` | `28800000` (8 soat) | |
| `DATA_DIR` | `./data` | Railway Volume uchun: `/app/data` |
| `PUBLIC_BASE_URL` | (auto from request) | reverse proxy ortidagi turli host |
| `MAX_UPLOAD_SIZE_BYTES` | `104857600` (100MB) | |
| `MAX_THUMBNAIL_SIZE_BYTES` | `5242880` (5MB) | |

---

## 📡 API

### Public

- `GET /api/health` — health check (Railway uchun)
- `GET /api/games` — public o'yinlar ro'yxati (admin tokeni + `?all=true` bilan barchasini ko'radi)
- `GET /api/games/private/:token` — maxfiy o'yinga kirish
- `POST /api/games/:id/play` — o'ynash hisoblash (rate-limited)
- `GET /api/games/:id/qr?size=300&format=png|svg` — QR kod

### Admin (`x-admin-token` header)

- `POST /api/admin/login` — `{ username, password }` → `{ token, expiresIn }`
- `POST /api/admin/logout` — tokenni denylist qiladi
- `GET /api/admin/stats`
- `GET /api/admin/games` — barcha o'yinlar (private bilan)
- `DELETE /api/admin/games` — BARCHA o'yinni o'chirish
- `DELETE /api/admin/games/:id`
- `PATCH /api/admin/games/:id` — `{ isPrivate: bool }`
- `GET /api/admin/storage` — fayl tizimi tree
- `DELETE /api/admin/storage` — `{ target }` (faqat data/ ichida)
- `POST /api/upload` — multipart `{ gameFile, thumbnail?, gameName_*, gameDesc_*, category, version, isPrivate }`
- `GET /api/games/:id/download` — ZIP yuklab olish

---

## 🚂 Railway deploy

1. GitHub'ga push qiling.
2. [Railway.app](https://railway.app) → New Project → GitHub repo.
3. **Volume qo'shing**: Settings → Volumes → mount `/app/data`
4. **Env qo'shing**:
   - `NODE_ENV=production`
   - `DATA_DIR=/app/data`
   - `ADMIN_USERNAME=<your-user>`
   - `ADMIN_PASSWORD=<strong-password>`
   - (ixtiyoriy) `ADMIN_SECRET=<random-64-hex>`
5. Avtomatik deploy. Health check: `GET /api/health`.

---

## 🧪 Test

```bash
npm run check        # node --check syntax tekshiruvi
npm run test:smoke   # health + auth gates
```

---

## 🔄 Migration (v2 → v3)

Birinchi `npm start` ishga tushirilganda `src/migrations/legacy.js` quyidagilarni avtomatik bajaradi:

1. Eski `./games/*` papkalarni `data/games/` ga ko'chiradi (idempotent)
2. Eski `js/games-config.js` ichidagi o'yinlarni `data/games-db.json` ga import qiladi (faqat DB bo'sh bo'lsa)

Eski strukturasi yo'qotilmaydi.
