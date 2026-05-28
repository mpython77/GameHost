/* ============================================
   🌐 INTERNATIONALIZATION (i18n) MODULE
   Supports: UZ (O'zbek), RU (Русский), EN (English)
   ============================================ */

const I18N = (() => {
  const STORAGE_KEY = 'gamehost_lang';
  const DEFAULT_LANG = 'uz';
  const SUPPORTED_LANGS = ['uz', 'ru', 'en'];

  // ─── Translation Dictionary ───
  const translations = {
    // Header
    'search.placeholder': {
      uz: "O'yinlarni qidirish...",
      ru: 'Поиск игр...',
      en: 'Search games...'
    },

    // Hero
    'hero.badge': {
      uz: '🎮 O\'yin Platformasi',
      ru: '🎮 Игровая Платформа',
      en: '🎮 Game Platform'
    },
    'hero.title.line1': {
      uz: "O'yinlarni",
      ru: 'Играйте в',
      en: 'Play Games'
    },
    'hero.title.line2': {
      uz: "O'ynang & Test Qiling",
      ru: 'Игры & Тестируйте',
      en: '& Test Instantly'
    },
    'hero.subtitle': {
      uz: "Cocos Creator'da yaratilgan o'yinlarni brauzeringizda to'g'ridan-to'g'ri o'ynang. Hech narsa o'rnatish shart emas.",
      ru: 'Играйте в игры, созданные на Cocos Creator, прямо в браузере. Никаких установок.',
      en: 'Play games built with Cocos Creator directly in your browser. No installation required.'
    },
    'hero.stat.games': {
      uz: "O'yinlar",
      ru: 'Игры',
      en: 'Games'
    },
    'hero.stat.free': {
      uz: 'Bepul',
      ru: 'Бесплатно',
      en: 'Free'
    },
    'hero.stat.browser': {
      uz: 'Brauzerda',
      ru: 'В браузере',
      en: 'In Browser'
    },

    // Section
    'section.catalog': {
      uz: "O'yinlar Katalogi",
      ru: 'Каталог Игр',
      en: 'Game Catalog'
    },

    // Filters
    'filter.all': {
      uz: 'Barchasi',
      ru: 'Все',
      en: 'All'
    },
    'filter.arcade': {
      uz: 'Arcade',
      ru: 'Аркада',
      en: 'Arcade'
    },
    'filter.puzzle': {
      uz: 'Puzzle',
      ru: 'Головоломка',
      en: 'Puzzle'
    },
    'filter.action': {
      uz: 'Action',
      ru: 'Экшн',
      en: 'Action'
    },
    'filter.casual': {
      uz: 'Casual',
      ru: 'Казуальные',
      en: 'Casual'
    },
    'filter.strategy': {
      uz: 'Strategiya',
      ru: 'Стратегия',
      en: 'Strategy'
    },

    // Game Card
    'card.play': {
      uz: "O'ynash",
      ru: 'Играть',
      en: 'Play'
    },
    'card.version': {
      uz: 'Versiya',
      ru: 'Версия',
      en: 'Version'
    },

    // Empty State
    'empty.title': {
      uz: "O'yin topilmadi",
      ru: 'Игры не найдены',
      en: 'No games found'
    },
    'empty.text': {
      uz: "Qidiruv so'zini o'zgartiring yoki boshqa kategoriyani tanlang",
      ru: 'Попробуйте изменить поиск или выберите другую категорию',
      en: 'Try changing your search or selecting a different category'
    },

    // Footer
    'footer.powered': {
      uz: 'Cocos Creator asosida',
      ru: 'На базе Cocos Creator',
      en: 'Powered by Cocos Creator'
    },
    'footer.rights': {
      uz: 'Barcha huquqlar himoyalangan',
      ru: 'Все права защищены',
      en: 'All rights reserved'
    },

    // Player Page
    'player.back': {
      uz: 'Orqaga',
      ru: 'Назад',
      en: 'Back'
    },
    'player.loading': {
      uz: "O'yin yuklanmoqda...",
      ru: 'Загрузка игры...',
      en: 'Loading game...'
    },
    'player.fullscreen': {
      uz: "To'liq ekran",
      ru: 'Полный экран',
      en: 'Fullscreen'
    },
    'player.reload': {
      uz: 'Qayta yuklash',
      ru: 'Перезагрузить',
      en: 'Reload'
    },

    // Categories (for game cards)
    'category.arcade': {
      uz: 'Arcade',
      ru: 'Аркада',
      en: 'Arcade'
    },
    'category.puzzle': {
      uz: 'Puzzle',
      ru: 'Головоломка',
      en: 'Puzzle'
    },
    'category.action': {
      uz: 'Action',
      ru: 'Экшн',
      en: 'Action'
    },
    'category.casual': {
      uz: 'Casual',
      ru: 'Казуальные',
      en: 'Casual'
    },
    'category.strategy': {
      uz: 'Strategiya',
      ru: 'Стратегия',
      en: 'Strategy'
    },

    // Navigation
    'nav.upload': {
      uz: 'Yuklash',
      ru: 'Загрузить',
      en: 'Upload'
    },
    'nav.backToCatalog': {
      uz: 'Katalogga',
      ru: 'Каталог',
      en: 'Catalog'
    },

    // Upload Page
    'upload.title': {
      uz: "O'yin Yuklash",
      ru: 'Загрузка Игры',
      en: 'Upload Game'
    },
    'upload.subtitle': {
      uz: "Cocos Creator Playable ad HTML faylini yuklang — avtomatik o'rnatiladi",
      ru: 'Загрузите HTML файл Playable ad Cocos Creator — установится автоматически',
      en: 'Upload a Cocos Creator Playable ad HTML file — it will be installed automatically'
    },
    'upload.dropText': {
      uz: 'HTML faylini shu yerga tashlang',
      ru: 'Перетащите HTML файл сюда',
      en: 'Drop HTML file here'
    },
    'upload.dropHint': {
      uz: 'yoki tugmani bosib tanlang (max 100MB)',
      ru: 'или нажмите кнопку для выбора (макс 100МБ)',
      en: 'or click to browse (max 100MB)'
    },
    'upload.browseBtn': {
      uz: 'Faylni tanlash',
      ru: 'Выбрать файл',
      en: 'Browse files'
    },
    'upload.details': {
      uz: "O'yin ma'lumotlari",
      ru: 'Данные игры',
      en: 'Game details'
    },
    'upload.gameName': {
      uz: "O'yin nomi",
      ru: 'Название игры',
      en: 'Game name'
    },
    'upload.category': {
      uz: 'Kategoriya',
      ru: 'Категория',
      en: 'Category'
    },
    'upload.description': {
      uz: 'Tavsif',
      ru: 'Описание',
      en: 'Description'
    },
    'upload.submitBtn': {
      uz: 'Yuklash',
      ru: 'Загрузить',
      en: 'Upload'
    },
    'upload.manager': {
      uz: "Yuklangan o'yinlar",
      ru: 'Загруженные игры',
      en: 'Uploaded games'
    },
    'upload.privateMode': {
      uz: '🔒 Maxfiy rejim',
      ru: '🔒 Приватный режим',
      en: '🔒 Private Mode'
    },
    'upload.privateHint': {
      uz: "Katalogda ko'rinmaydi. Faqat maxfiy link orqali kirish mumkin.",
      ru: 'Не отображается в каталоге. Доступ только по приватной ссылке.',
      en: 'Not visible in catalog. Access only via private link.'
    },
    'upload.uploading': {
      uz: 'Yuklanmoqda...',
      ru: 'Загрузка...',
      en: 'Uploading...'
    },
    'upload.installing': {
      uz: "O'rnatilmoqda...",
      ru: 'Установка...',
      en: 'Installing...'
    },
    'upload.success': {
      uz: 'Muvaffaqiyatli yuklandi!',
      ru: 'Успешно загружено!',
      en: 'Successfully uploaded!'
    },
    'upload.error': {
      uz: 'Xatolik yuz berdi',
      ru: 'Произошла ошибка',
      en: 'Error occurred'
    },
    'upload.playBtn': {
      uz: "🎮 O'ynash",
      ru: '🎮 Играть',
      en: '🎮 Play'
    },
    'upload.anotherBtn': {
      uz: '📤 Yana yuklash',
      ru: '📤 Загрузить ещё',
      en: '📤 Upload another'
    },
    'upload.toCatalog': {
      uz: '📋 Katalogga',
      ru: '📋 Каталог',
      en: '📋 Catalog'
    },
    'upload.thumbnail': {
      uz: '🖼️ Muqova rasmi (ixtiyoriy)',
      ru: '🖼️ Обложка (необязательно)',
      en: '🖼️ Cover image (optional)'
    },
    'upload.thumbnailLabel': {
      uz: 'Rasm tanlash yoki tashlang',
      ru: 'Выберите или перетащите изображение',
      en: 'Click to choose or drop image'
    },
    'upload.thumbnailHint': {
      uz: 'JPG, PNG, WebP · max 5MB · ideal o\'lcham: 480×300px',
      ru: 'JPG, PNG, WebP · макс 5МБ · идеальный размер: 480×300px',
      en: 'JPG, PNG, WebP · max 5MB · ideal size: 480×300px'
    },
    'upload.thumbnailClear': {
      uz: "✕ O'chirish",
      ru: '✕ Удалить',
      en: '✕ Remove'
    },
    'upload.noGames': {
      uz: "Hech qanday o'yin yuklanmagan",
      ru: 'Игры не загружены',
      en: 'No games uploaded'
    },
    'upload.copyBtn': {
      uz: 'Nusxalash',
      ru: 'Копировать',
      en: 'Copy'
    },
    'upload.copiedBtn': {
      uz: '✓ Nusxalandi',
      ru: '✓ Скопировано',
      en: '✓ Copied'
    },
    'upload.playCount': {
      uz: "o'ynash",
      ru: 'игр',
      en: 'plays'
    },
    'upload.fileOnly': {
      uz: 'Faqat HTML yoki ZIP fayllar qabul qilinadi!',
      ru: 'Принимаются только HTML или ZIP файлы!',
      en: 'Only HTML or ZIP files are accepted!'
    },
    'upload.deleteConfirm': {
      uz: "o'yinini o'chirishni xohlaysizmi?",
      ru: 'игру удалить?',
      en: 'delete this game?'
    },
    'upload.deleteError': {
      uz: "O'chirishda xatolik",
      ru: 'Ошибка удаления',
      en: 'Delete error'
    },
    'upload.networkError': {
      uz: "Server bilan bog'lanib bo'lmadi",
      ru: 'Не удалось подключиться к серверу',
      en: 'Could not connect to server'
    },
    'upload.downloadError': {
      uz: "Yuklab bo'lmadi",
      ru: 'Не удалось скачать',
      en: 'Could not download'
    },

    // QR Modal
    'qr.scan': {
      uz: "Telefondan skanlab o'yinni oching",
      ru: 'Отсканируйте телефоном, чтобы открыть игру',
      en: 'Scan with phone to open the game'
    },
    'qr.close': {
      uz: 'Yopish',
      ru: 'Закрыть',
      en: 'Close'
    },
    'qr.download': {
      uz: '📥 QR yuklab olish',
      ru: '📥 Скачать QR',
      en: '📥 Download QR'
    },
    'qr.error': {
      uz: 'QR olishda xatolik',
      ru: 'Ошибка получения QR',
      en: 'Error fetching QR'
    },

    // Manager buttons
    'manager.play': {
      uz: "▶ O'ynash",
      ru: '▶ Играть',
      en: '▶ Play'
    },
    'manager.delete': {
      uz: "🗑️ O'chirish",
      ru: '🗑️ Удалить',
      en: '🗑️ Delete'
    },
    'manager.download': {
      uz: '📥 Yuklab olish',
      ru: '📥 Скачать',
      en: '📥 Download'
    },
    'manager.plays': {
      uz: "o'ynash",
      ru: 'игр',
      en: 'plays'
    },

    // Player error messages
    'player.notFound': {
      uz: "🔒 Maxfiy o'yin topilmadi yoki token noto'g'ri",
      ru: '🔒 Приватная игра не найдена или токен неверен',
      en: '🔒 Private game not found or token is invalid'
    },
    'player.networkError': {
      uz: "Server bilan bog'lanib bo'lmadi",
      ru: 'Не удалось подключиться к серверу',
      en: 'Could not connect to server'
    },
    'player.loadSlow': {
      uz: "O'yin yuklanishi sekin... Dastur qotgan bo'lishi mumkin.",
      ru: 'Загрузка идёт медленно... Приложение может зависнуть.',
      en: 'Game is loading slowly... The app may be frozen.'
    },
    'player.gameError': {
      uz: "Xatolik: O'yin topilmadi!",
      ru: 'Ошибка: Игра не найдена!',
      en: 'Error: Game not found!'
    },
  };

  // ─── State ───
  let currentLang = DEFAULT_LANG;
  let onChangeCallbacks = [];

  // ─── Public API ───

  /** Initialize i18n — load saved language */
  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LANGS.includes(saved)) {
      currentLang = saved;
    } else {
      // Auto-detect from browser
      const browserLang = navigator.language.slice(0, 2).toLowerCase();
      if (SUPPORTED_LANGS.includes(browserLang)) {
        currentLang = browserLang;
      }
    }
    return currentLang;
  }

  /** Get current language */
  function getLang() {
    return currentLang;
  }

  /** Set language and notify listeners */
  function setLang(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    applyTranslations();
    onChangeCallbacks.forEach(cb => cb(lang));
  }

  /** Get translation by key */
  function t(key) {
    const entry = translations[key];
    if (!entry) return key;
    return entry[currentLang] || entry[DEFAULT_LANG] || key;
  }

  /** Get localized field from an object { uz, ru, en } */
  function localize(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[currentLang] || obj[DEFAULT_LANG] || Object.values(obj)[0] || '';
  }

  /** Register a callback for language changes */
  function onChange(callback) {
    onChangeCallbacks.push(callback);
  }

  /** Apply translations to all elements with data-i18n attribute */
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translation;
      } else {
        el.textContent = translation;
      }
    });

    // Update HTML lang attribute
    document.documentElement.lang = currentLang;

    // Update active lang button
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
  }

  return {
    init,
    getLang,
    setLang,
    t,
    localize,
    onChange,
    applyTranslations,
    SUPPORTED_LANGS
  };
})();
