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
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const QRCode = require('qrcode');
const AdmZip = require('adm-zip');

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

  // Frontend js/games-config.js — faqat PUBLIC o'yinlarni yozadi (tokenlar chiqariladi)
  _syncLegacyConfig() {
    const publicGames = this.data.games
      .filter(g => !g.isPrivate)
      .map(({ ownerToken, privateToken, ...safe }) => safe);

    const content = `/* ============================================
   GAMES CONFIGURATION (auto-generated)
   Bu fayl server tomonidan avtomatik boshqariladi
   ============================================ */

const GAMES_CONFIG = ${JSON.stringify(publicGames, null, 2)};

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

  getByOwner(ownerToken) {
    if (!ownerToken) return [];
    return this.data.games.filter(g => g.ownerToken === ownerToken || !g.ownerToken);
  }

  getUnclaimed() {
    return this.data.games.filter(g => !g.ownerToken);
  }

  claimGame(gameId, ownerToken) {
    const game = this.getById(gameId);
    if (!game) return null;
    if (game.ownerToken) return null; // allaqachon egalangan
    game.ownerToken = ownerToken;
    return game; // caller _save() ni chaqiradi
  }

  claimAll(ownerToken) {
    const unclaimed = this.getUnclaimed();
    if (unclaimed.length === 0) return 0;
    unclaimed.forEach(game => { game.ownerToken = ownerToken; });
    this._save(); // bitta disk yozish
    return unclaimed.length;
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
        // JSON.parse ishlatiladi — new Function() xavfli
        let oldGames;
        try {
          oldGames = JSON.parse(match[1]);
        } catch {
          console.error('  ⚠️  Legacy config JSON.parse xatosi, import o\'tkazib yuborildi');
          oldGames = null;
        }
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-owner-token, x-admin-token');
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

// Static: Platform UI fayllari (faqat kerakli papkalar)
const staticOpts = { maxAge: NODE_ENV === 'production' ? '1d' : '0' };
app.use('/css', express.static(path.join(__dirname, 'css'), staticOpts));
app.use('/js', express.static(path.join(__dirname, 'js'), staticOpts));
app.use('/images', express.static(path.join(__dirname, 'images'), staticOpts));
// HTML sahifalar
['index.html', 'upload.html', 'play.html', 'admin.html'].forEach(page => {
  app.get(`/${page}`, (req, res) => res.sendFile(path.join(__dirname, page)));
});
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

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

// ─── Multer config (HTML + ZIP + thumbnail) ───
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'thumbnail') {
      const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
      if (allowed.includes(ext) || file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Thumbnail uchun faqat rasm fayllari (JPG, PNG, WebP)'), false);
      }
    } else {
      const allowed = ['.html', '.zip'];
      if (allowed.includes(ext) || file.mimetype === 'text/html' || file.mimetype === 'application/zip') {
        cb(null, true);
      } else {
        cb(new Error('Faqat HTML yoki ZIP fayllar qabul qilinadi!'), false);
      }
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

// ─── API: Upload Game (admin only) ───
app.post('/api/upload', uploadLimiter, adminAuth, upload.fields([
  { name: 'gameFile', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), (req, res) => {
  try {
    const gameFile = req.files && req.files['gameFile'] && req.files['gameFile'][0];
    const thumbnailFile = req.files && req.files['thumbnail'] && req.files['thumbnail'][0];

    if (!gameFile) {
      return res.status(400).json({ error: 'Fayl yuklanmadi' });
    }

    // req.file alias for compatibility below
    req.file = gameFile;

    const { gameName_uz, gameName_ru, gameName_en,
            gameDesc_uz, gameDesc_ru, gameDesc_en,
            category, version, isPrivate } = req.body;

    // Category validatsiya
    const ALLOWED_CATEGORIES = ['arcade', 'action', 'puzzle', 'casual', 'strategy'];
    const safeCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'arcade';

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

    // ─── Fayl turini aniqlash va extract qilish ───
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.zip') {
      // ZIP faylni ochish
      try {
        const zip = new AdmZip(req.file.path);

        // ZIP Slip himoyasi — barcha entry yo'llarini tekshirish
        const zipEntries = zip.getEntries();
        for (const entry of zipEntries) {
          const entryName = entry.entryName;
          // Absolute path, parent traversal yoki null byte tekshiruv
          if (path.isAbsolute(entryName) ||
              entryName.includes('..') ||
              entryName.includes('\0') ||
              /^[a-zA-Z]:[\\/]/.test(entryName)) {
            fs.rmSync(gameDir, { recursive: true, force: true });
            try { fs.unlinkSync(req.file.path); } catch {}
            return res.status(400).json({ error: 'ZIP fayl xavfsiz emas (path traversal aniqlandi)' });
          }
        }

        zip.extractAllTo(gameDir, true);

        // index.html borligini tekshirish (ichki papkada ham qidirish)
        let indexFound = false;
        if (fs.existsSync(path.join(gameDir, 'index.html'))) {
          indexFound = true;
        } else {
          // Bitta ichki papka bo'lsa, undagi fayllarni ko'tarish
          const entries = fs.readdirSync(gameDir);
          if (entries.length === 1) {
            const subDir = path.join(gameDir, entries[0]);
            if (fs.statSync(subDir).isDirectory() && fs.existsSync(path.join(subDir, 'index.html'))) {
              // Ichki papkadan tashqariga ko'chirish
              const subEntries = fs.readdirSync(subDir);
              subEntries.forEach(f => {
                fs.renameSync(path.join(subDir, f), path.join(gameDir, f));
              });
              fs.rmdirSync(subDir);
              indexFound = true;
            }
          }
        }

        if (!indexFound) {
          fs.rmSync(gameDir, { recursive: true, force: true });
          try { fs.unlinkSync(req.file.path); } catch {}
          return res.status(400).json({ error: 'ZIP ichida index.html fayli topilmadi!' });
        }
      } catch (zipErr) {
        fs.rmSync(gameDir, { recursive: true, force: true });
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'ZIP faylni ochishda xatolik: ' + zipErr.message });
      }
    } else {
      // HTML faylni to'g'ridan-to'g'ri ko'chirish
      const indexPath = path.join(gameDir, 'index.html');
      fs.copyFileSync(req.file.path, indexPath);
    }

    // Uploaded faylni tozalash
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    // ─── Thumbnail saqlash ───
    let thumbnailName = null;
    if (thumbnailFile) {
      const thumbExt = path.extname(thumbnailFile.originalname).toLowerCase() || '.jpg';
      thumbnailName = `thumbnail${thumbExt}`;
      const thumbDest = path.join(gameDir, thumbnailName);
      fs.copyFileSync(thumbnailFile.path, thumbDest);
      try { fs.unlinkSync(thumbnailFile.path); } catch {}
    }

    // Generate private token if private mode
    const privateMode = isPrivate === 'true' || isPrivate === '1' || isPrivate === 'on';
    const privateToken = privateMode ? crypto.randomBytes(16).toString('hex') : null;

    // Save to database
    const gameConfig = {
      id: folderName,
      folder: folderName,
      thumbnail: thumbnailName,
      category: safeCategory,
      version: version || '1.0',
      isPrivate: privateMode,
      privateToken: privateToken,
      playCount: 0,
      lastPlayedAt: null,
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

    // Response dan maxfiy maydonlarni olib tashlash
    const { privateToken: _pt, ...safeConfig } = gameConfig;

    res.json({
      success: true,
      message: `"${gameConfig.name.uz}" muvaffaqiyatli yuklandi!`,
      game: safeConfig,
      privateLink: privateMode
        ? `/play.html?token=${privateToken}`
        : null
    });

  } catch (err) {
    console.error('Upload xatosi:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    const thumbFile = req.files && req.files['thumbnail'] && req.files['thumbnail'][0];
    if (thumbFile && fs.existsSync(thumbFile.path)) {
      try { fs.unlinkSync(thumbFile.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: err.message || 'Server xatosi' });
  }
});

// ─── API: Track Play (o'yin o'ynalganda) ───
const playLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => `${ipKeyGenerator(req)}-${req.params.id}`
});

app.post('/api/games/:id/play', playLimiter, (req, res) => {
  try {
    const game = db.getById(req.params.id);
    if (!game) return res.status(404).json({ error: "O'yin topilmadi" });

    game.playCount = (game.playCount || 0) + 1;
    game.lastPlayedAt = new Date().toISOString();
    db._save();

    res.json({ success: true, playCount: game.playCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: QR Code generatsiya ───
app.get('/api/games/:id/qr', async (req, res) => {
  try {
    const game = db.getById(req.params.id);
    if (!game) return res.status(404).json({ error: "O'yin topilmadi" });

    // Private o'yin QR — faqat admin
    if (game.isPrivate && !verifyAdminToken(req.headers['x-admin-token'])) {
      return res.status(401).json({ error: "Maxfiy o'yin QR kodi uchun admin login kerak" });
    }

    // O'yin URL'ini aniqlash
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let gameUrl;
    if (game.isPrivate && game.privateToken) {
      gameUrl = `${baseUrl}/play.html?token=${game.privateToken}`;
    } else {
      gameUrl = `${baseUrl}/play.html?game=${game.id}`;
    }

    const size = parseInt(req.query.size) || 300;
    const format = req.query.format || 'png';

    if (format === 'svg') {
      const svg = await QRCode.toString(gameUrl, { type: 'svg', width: size, margin: 1 });
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(svg);
    } else {
      const png = await QRCode.toBuffer(gameUrl, {
        width: size,
        margin: 1,
        color: { dark: '#000000', light: '#00000000' },
        errorCorrectionLevel: 'M'
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(png);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: List Games ───
app.get('/api/games', apiLimiter, (req, res) => {
  try {
    // Admin login bilan barcha o'yinlar (private + public)
    if (req.query.all === 'true' && verifyAdminToken(req.headers['x-admin-token'])) {
      return res.json(db.getAll().map(({ ownerToken, ...rest }) => rest));
    }
    // Public katalog — faqat public o'yinlar, tokenlarsiz
    res.json(db.getPublic().map(({ privateToken, ownerToken, ...rest }) => rest));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Private token brute-force himoya
const privateTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Juda ko\'p urinish. Iltimos keyinroq qayta urinib ko\'ring.' }
});

// ─── API: Private Game Access (token orqali) ───
app.get('/api/games/private/:token', privateTokenLimiter, (req, res) => {
  try {
    const game = db.getByToken(req.params.token);
    if (!game) {
      return res.status(404).json({ error: 'Maxfiy o\'yin topilmadi yoki token noto\'g\'ri' });
    }
    // Token va ownerToken ni yashirish
    const { privateToken, ownerToken, ...safeGame } = game;
    res.json(safeGame);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Download Game (admin only) ───
app.get('/api/games/:id/download', adminAuth, (req, res) => {
  try {
    const gameId = req.params.id;
    const game = db.getById(gameId);

    if (!game) {
      return res.status(404).json({ error: "O'yin topilmadi" });
    }

    const gameDir = path.join(GAMES_DIR, game.folder);
    if (!fs.existsSync(gameDir)) {
      return res.status(404).json({ error: "O'yin fayli topilmadi" });
    }

    // Barcha fayllarni ZIP qilib yuborish
    const zip = new AdmZip();
    zip.addLocalFolder(gameDir);
    const zipBuffer = zip.toBuffer();

    const fileName = `${game.folder}.zip`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Delete Game (admin only) ───
app.delete('/api/games/:id', adminAuth, (req, res) => {
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

// ─── Admin Auth ───
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const ADMIN_SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_HASH = crypto.createHash('sha256').update(ADMIN_PASSWORD + '_gh_salt').digest('hex');
const ADMIN_USER_HASH = crypto.createHash('sha256').update(ADMIN_USERNAME + '_gh_salt').digest('hex');

function createAdminToken() {
  const payload = { role: 'admin', iat: Date.now(), exp: Date.now() + 8 * 60 * 60 * 1000 };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyAdminToken(token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(data).digest('base64url');
  try {
    if (sig.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'base64url'), Buffer.from(expected, 'base64url'))) return false;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    return payload.role === 'admin' && payload.exp > Date.now();
  } catch { return false; }
}

function adminAuth(req, res, next) {
  if (!verifyAdminToken(req.headers['x-admin-token'])) {
    return res.status(401).json({ error: 'Admin autentifikatsiyasi kerak' });
  }
  next();
}

const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const { username, password } = req.body;
  const userHash = crypto.createHash('sha256').update((username || '') + '_gh_salt').digest('hex');
  const passHash = crypto.createHash('sha256').update((password || '') + '_gh_salt').digest('hex');

  const userOk = crypto.timingSafeEqual(Buffer.from(userHash), Buffer.from(ADMIN_USER_HASH));
  const passOk = crypto.timingSafeEqual(Buffer.from(passHash), Buffer.from(ADMIN_HASH));

  if (!userOk || !passOk) {
    return res.status(401).json({ error: 'Login yoki parol noto\'g\'ri' });
  }
  res.json({ token: createAdminToken() });
});

app.get('/api/admin/stats', adminAuth, (req, res) => {
  const games = db.getAll();
  res.json({
    total: games.length,
    public: games.filter(g => !g.isPrivate).length,
    private: games.filter(g => g.isPrivate).length,
    totalPlays: games.reduce((sum, g) => sum + (g.playCount || 0), 0),
    topGames: [...games].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 5)
      .map(({ ownerToken, privateToken, ...g }) => g)
  });
});

app.get('/api/admin/games', adminAuth, (req, res) => {
  const games = db.getAll().map(({ ownerToken, ...g }) => g);
  res.json(games);
});

// ─── API: Storage info ───
app.get('/api/admin/storage', adminAuth, (req, res) => {
  function getDirSize(dirPath) {
    if (!fs.existsSync(dirPath)) return 0;
    let total = 0;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) total += getDirSize(full);
      else total += fs.statSync(full).size;
    }
    return total;
  }

  function listDir(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath, { withFileTypes: true }).map(entry => {
      const full = path.join(dirPath, entry.name);
      const size = entry.isDirectory() ? getDirSize(full) : fs.statSync(full).size;
      return {
        name: entry.name,
        type: entry.isDirectory() ? 'dir' : 'file',
        size,
        sizeHuman: size < 1024 ? size + ' B'
          : size < 1024 * 1024 ? (size / 1024).toFixed(1) + ' KB'
          : (size / (1024 * 1024)).toFixed(1) + ' MB',
        ...(entry.isDirectory() && { children: listDir(full) })
      };
    });
  }

  const totalSize = getDirSize(DATA_DIR);
  res.json({
    dataDir: DATA_DIR,
    totalSize,
    totalSizeHuman: totalSize < 1024 * 1024 ? (totalSize / 1024).toFixed(1) + ' KB'
      : (totalSize / (1024 * 1024)).toFixed(1) + ' MB',
    tree: listDir(DATA_DIR)
  });
});

// ─── API: Delete any file/folder from storage ───
app.delete('/api/admin/storage', adminAuth, (req, res) => {
  const { target } = req.body;
  if (!target) return res.status(400).json({ error: 'target kerak' });

  const fullPath = path.resolve(target);
  // Faqat DATA_DIR ichidagi narsalarni o'chirish mumkin
  if (!fullPath.startsWith(path.resolve(DATA_DIR))) {
    return res.status(403).json({ error: "Faqat data papkasi ichidagi fayllarni o'chirish mumkin" });
  }
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Topilmadi' });

  fs.rmSync(fullPath, { recursive: true, force: true });
  console.log(`  🛡️  Admin: storage o'chirildi: ${fullPath}`);
  res.json({ success: true });
});

app.delete('/api/admin/games/:id', adminAuth, (req, res) => {
  const game = db.getById(req.params.id);
  if (!game) return res.status(404).json({ error: "O'yin topilmadi" });
  const gameDir = path.join(GAMES_DIR, game.folder);
  if (fs.existsSync(gameDir)) fs.rmSync(gameDir, { recursive: true, force: true });
  db.remove(req.params.id);
  console.log(`  🛡️  Admin: o'yin o'chirildi: ${req.params.id}`);
  res.json({ success: true });
});

app.patch('/api/admin/games/:id', adminAuth, (req, res) => {
  const game = db.getById(req.params.id);
  if (!game) return res.status(404).json({ error: "O'yin topilmadi" });
  const { isPrivate } = req.body;
  if (typeof isPrivate === 'boolean') {
    game.isPrivate = isPrivate;
    if (!isPrivate) game.privateToken = null;
    else if (!game.privateToken) game.privateToken = crypto.randomBytes(16).toString('hex');
    db._save();
  }
  const { ownerToken, ...safe } = game;
  res.json(safe);
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
