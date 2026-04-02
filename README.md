# 🎮 Game Host — Playable Ads Hosting Platform

Cocos Creator va boshqa Playable Ad HTML fayllarini yuklash, boshqarish va test qilish uchun professional platforma.

## 🚀 Tezkor Ishga Tushirish

```bash
npm install
npm start
```

Brauzerda → `http://localhost:8080`

## ✨ Imkoniyatlar

- 📤 **HTML Playable Ads yuklash** — Drag & Drop interfeys
- 🎮 **Aspect Ratio tester** — 16:9, 9:16, 4:3, 1:1 va boshqalar
- 🌐 **3 til** — O'zbekcha, Ruscha, Inglizcha
- 🛡️ **Xavfsiz iframe sandbox** — Reklama redirect'larini bloklash
- 📱 **To'liq responsive** — Telefon, planshet, noutbuk
- ⚡ **Gzip compression** — Og'ir HTML fayllar tez yuklanadi
- 🔒 **Rate Limiting** — DDOS/spam himoyasi

## 🚂 Railway'ga Deploy

1. GitHub'ga push qiling
2. [Railway.app](https://railway.app) da yangi loyiha yarating
3. GitHub reponi ulang
4. **Volume qo'shing:**
   - Railway Dashboard → Service → Settings → Volumes
   - Mount path: `/app/data`
5. **Environment variables:**
   - `NODE_ENV` = `production`
   - `DATA_DIR` = `/app/data`
6. Deploy avtomatik boshlanadi!

## 📁 Loyiha Tuzilmasi

```
hosting/
├── css/style.css          # Dizayn tizimi (dark glassmorphism)
├── js/
│   ├── app.js             # Katalog sahifasi logikasi
│   ├── games-config.js    # O'yinlar konfiguratsiyasi (auto-generated)
│   └── i18n.js            # Ko'p tilli tizim (UZ/RU/EN)
├── data/
│   ├── games/             # Yuklangan o'yin fayllari
│   └── games-db.json      # JSON ma'lumotlar bazasi
├── index.html             # Asosiy katalog sahifasi
├── play.html              # O'yin player sahifasi
├── upload.html            # Yuklash va boshqarish paneli
├── server.js              # Express.js backend
├── railway.json           # Railway deploy konfiguratsiyasi
├── Procfile               # Process manager
└── package.json           # Node.js dependencies
```

## 🛡️ Xavfsizlik

- **Helmet** — HTTP headers himoyasi
- **Rate Limit** — 5 daqiqada 10 upload cheklovi
- **Sandbox** — iFrame'da `allow-top-navigation` taqiqlangan
- **Multer** — Faqat `.html` fayllar, max 100MB

## ⚙️ Environment Variables

| O'zgaruvchi | Default | Tavsif |
|---|---|---|
| `PORT` | `8080` | Server port (Railway avtomatik beradi) |
| `NODE_ENV` | `development` | `production` da kesh yoqiladi |
| `DATA_DIR` | `./data` | O'yinlar va DB saqlash papkasi |
