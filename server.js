/* ============================================
   🎮 GAME HOST — NODE.JS SERVER (PLAYABLE ADS)
   Railway-ready, persistent data architecture
   ============================================ */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── Data Paths ───
// Railway Volume yoki lokal papka
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const GAMES_DIR = path.join(DATA_DIR, 'games');
const DB_FILE = path.join(DATA_DIR, 'games-db.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Legacy config (frontend uchun)
const LEGACY_CONFIG = path.join(__dirname, 'js', 'games-config.js');

// Ensure directories exist
[GAMES_DIR, UPLOADS_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── JSON Database ───
class GamesDB {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('DB yuklash xatosi:', err.message);
    }
    return { games: [], meta: { createdAt: new Date().toISOString(), version: '2.0' } };
  }

  _save() {
    this.data.meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    this._syncLegacyConfig();
  }

  // Frontend js/games-config.js — faqat PUBLIC o'yinlarni yozadi
  _syncLegacyConfig() {
    const publicGames = this.data.games.filter(g => !g.isPrivate);
    const configStr = JSON.stringify(publicGames, null, 2)
      .replace(/"(\w+)":/g, '$1:')
      .replace(/"/g, "'");

    const content = `/* ============================================
   🎮 GAMES CONFIGURATION (auto-generated)
   Bu fayl server tomonidan avtomatik boshqariladi
   ============================================ */

const GAMES_CONFIG = ${configStr};

const GAME_CATEGORIES = ['all', 'arcade', 'action', 'puzzle', 'casual', 'strategy'];
`;
    try {
      fs.writeFileSync(LEGACY_CONFIG, content, 'utf8');
    } catch (err) {
      console.error('Legacy config sync xatosi:', err.message);
    }
  }

  getAll() {
    return this.data.games;
  }

  getPublic() {
    return this.data.games.filter(g => !g.isPrivate);
  }

  getById(id) {
    return this.data.games.find(g => g.id === id);
  }

  getByToken(token) {
    return this.data.games.find(g => g.privateToken === token);
  }

  add(game) {
    this.data.games = this.data.games.filter(g => g.id !== game.id);
    game.createdAt = new Date().toISOString();
    this.data.games.push(game);
    this._save();
    return game;
  }

  remove(id) {
    const game = this.getById(id);
    if (!game) return null;
    this.data.games = this.data.games.filter(g => g.id !== id);
    this._save();
    return game;
  }

  count() {
    return this.data.games.length;
  }

  countPublic() {
    return this.data.games.filter(g => !g.isPrivate).length;
  }
}

const db = new GamesDB(DB_FILE);

// ─── Migrate: eski games/ va games-config.js dan data/ ga ko'chirish ───
function migrateOldGames() {
  // 1. Eski games/ papkadan fayllarni ko'chirish
  const oldGamesDir = path.join(__dirname, 'games');
  if (fs.existsSync(oldGamesDir)) {
    const entries = fs.readdirSync(oldGamesDir, { withFileTypes: true });
    let migrated = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const src = path.join(oldGamesDir, entry.name);
      const dest = path.join(GAMES_DIR, entry.name);
      if (!fs.existsSync(dest)) {
        fs.cpSync(src, dest, { recursive: true });
        migrated++;
      }
    }

    if (migrated > 0) {
      console.log(`  📦  ${migrated} ta eski o'yin fayllari data/games/ ga ko'chirildi`);
    }
  }

  // 2. Eski games-config.js dan DB ga import qilish (faqat DB bo'sh bo'lsa)
  if (db.count() === 0 && fs.existsSync(LEGACY_CONFIG)) {
    try {
      const content = fs.readFileSync(LEGACY_CONFIG, 'utf8');
      const match = content.match(/const GAMES_CONFIG = (\[[\s\S]*?\]);/);
      if (match) {
        const oldGames = new Function(`return ${match[1]}`)();
        if (Array.isArray(oldGames) && oldGames.length > 0) {
          for (const game of oldGames) {
            db.add(game);
          }
          console.log(`  📋  ${oldGames.length} ta o'yin bazaga import qilindi`);
        }
      }
    } catch (err) {
      console.error('  ⚠️  Legacy config import xatosi:', err.message);
    }
  }
}

migrateOldGames();

// ─── Middleware ───

// Trust proxy (Railway reverse proxy uchun)
app.set('trust proxy', 1);

// Compression (Gzip for heavy HTML files)
app.use(compression());

// Security (Helmet) - Playable ads uchun moslashtirilgan
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Body parsers
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Static: O'yin fayllari (data/games/ dan)
app.use('/games', express.static(GAMES_DIR, {
  maxAge: NODE_ENV === 'production' ? '7d' : '0',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control',
        NODE_ENV === 'production'
          ? 'public, max-age=604800'
          : 'no-cache'
      );
    }
  }
}));

// Static: Platform UI fayllari
app.use(express.static(__dirname, {
  maxAge: NODE_ENV === 'production' ? '1d' : '0'
}));

// ─── Rate Limiters ───
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Juda ko\'p fayl yukladingiz. Iltimos 5 daqiqa kuting.' }
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

// ─── Multer config ───
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/html' || file.originalname.endsWith('.html')) {
      cb(null, true);
    } else {
      cb(new Error('Faqat HTML fayllar qabul qilinadi! (Playable Ads)'), false);
    }
  }
});

// ─── Health Check (Railway monitoring) ───
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    games: db.count(),
    env: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// ─── API: Upload Game ───
app.post('/api/upload', uploadLimiter, upload.single('gameFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Fayl yuklanmadi' });
    }

    const { gameName_uz, gameName_ru, gameName_en,
            gameDesc_uz, gameDesc_ru, gameDesc_en,
            category, version, isPrivate } = req.body;

    const folderName = (gameName_en || gameName_uz || 'game')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `game-${Date.now()}`;

    const gameDir = path.join(GAMES_DIR, folderName);

    if (fs.existsSync(gameDir)) {
      fs.rmSync(gameDir, { recursive: true, force: true });
    }

    fs.mkdirSync(gameDir, { recursive: true });

    // Move uploaded HTML → games folder as index.html
    const indexPath = path.join(gameDir, 'index.html');
    fs.copyFileSync(req.file.path, indexPath);
    fs.unlinkSync(req.file.path);

    // Generate private token if private mode
    const privateMode = isPrivate === 'true' || isPrivate === '1' || isPrivate === 'on';
    const privateToken = privateMode ? crypto.randomBytes(16).toString('hex') : null;

    // Save to database
    const gameConfig = {
      id: folderName,
      folder: folderName,
      thumbnail: null,
      category: category || 'arcade',
      version: version || '1.0',
      isPrivate: privateMode,
      privateToken: privateToken,
      name: {
        uz: gameName_uz || folderName,
        ru: gameName_ru || gameName_uz || folderName,
        en: gameName_en || gameName_uz || folderName
      },
      description: {
        uz: gameDesc_uz || '',
        ru: gameDesc_ru || gameDesc_uz || '',
        en: gameDesc_en || gameDesc_uz || ''
      }
    };

    db.add(gameConfig);

    console.log(`  ✅  O'yin yuklandi: ${folderName}${privateMode ? ' (🔒 PRIVATE)' : ''}`);

    res.json({
      success: true,
      message: `"${gameConfig.name.uz}" muvaffaqiyatli yuklandi!`,
      game: gameConfig,
      privateLink: privateMode
        ? `/play.html?token=${privateToken}`
        : null
    });

  } catch (err) {
    console.error('Upload xatosi:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// ─── API: List Games (faqat PUBLIC) ───
app.get('/api/games', apiLimiter, (req, res) => {
  try {
    if (req.query.all === 'true') {
      // Admin uchun — tokenlarni sanitize qilib jo'natish
      const all = db.getAll().map(g => ({
        ...g,
        privateToken: g.isPrivate ? g.privateToken : undefined
      }));
      res.json(all);
    } else {
      // Public katalog — private o'yinlarni yashirish + tokenni olib tashlash
      res.json(db.getPublic().map(({ privateToken, ...rest }) => rest));
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Private Game Access (token orqali) ───
app.get('/api/games/private/:token', (req, res) => {
  try {
    const game = db.getByToken(req.params.token);
    if (!game) {
      return res.status(404).json({ error: 'Maxfiy o\'yin topilmadi yoki token noto\'g\'ri' });
    }
    // Token va ichki ma'lumotlarni yashirish
    const { privateToken, ...safeGame } = game;
    res.json(safeGame);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Delete Game ───
app.delete('/api/games/:id', (req, res) => {
  try {
    const gameId = req.params.id;
    const game = db.getById(gameId);

    if (!game) {
      return res.status(404).json({ error: "O'yin topilmadi" });
    }

    // Delete game folder from disk
    const gameDir = path.join(GAMES_DIR, game.folder);
    if (fs.existsSync(gameDir)) {
      fs.rmSync(gameDir, { recursive: true, force: true });
    }

    // Remove from database
    db.remove(gameId);

    console.log(`  🗑️  O'yin o'chirildi: ${gameId}`);

    res.json({ success: true, message: `"${game.id}" o'chirildi` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Global Error Handler ───
app.use((err, req, res, next) => {
  console.error('Server xatosi:', err);
  res.status(err.status || 500).json({
    error: NODE_ENV === 'production'
      ? 'Serverda xatolik yuz berdi'
      : err.message
  });
});

// 404 handler
app.use((req, res) => {
  if (req.accepts('html')) {
    res.status(404).redirect('/');
  } else {
    res.status(404).json({ error: 'Sahifa topilmadi' });
  }
});

// ─── Start Server ───
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  🚀 ══════════════════════════════════════');
  console.log('  🚀  GAME HOST v2.0 (Railway-Ready)');
  console.log('  🚀 ══════════════════════════════════════');
  console.log(`  🌐  Port: ${PORT}`);
  console.log(`  🔧  Env:  ${NODE_ENV}`);
  console.log(`  📂  Data: ${DATA_DIR}`);
  console.log(`  🎮  Games: ${db.count()}`);
  console.log('  🛡️   Compression + Helmet + RateLimit');
  console.log('  🚀 ══════════════════════════════════════');
  console.log('');
});
