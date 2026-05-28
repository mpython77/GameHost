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

    // ─── Admin Panel ───
    'admin.title': { uz: 'Admin Panel', ru: 'Админ Панель', en: 'Admin Panel' },
    'admin.subtitle': { uz: 'GameHost boshqaruv tizimi', ru: 'Система управления GameHost', en: 'GameHost management system' },
    'admin.login': { uz: 'Login', ru: 'Логин', en: 'Username' },
    'admin.password': { uz: 'Parol', ru: 'Пароль', en: 'Password' },
    'admin.loginBtn': { uz: 'Kirish', ru: 'Войти', en: 'Sign in' },
    'admin.checking': { uz: 'Tekshirilmoqda...', ru: 'Проверка...', en: 'Checking...' },
    'admin.backToHome': { uz: '← Asosiy sahifaga qaytish', ru: '← Вернуться на главную', en: '← Back to home' },
    'admin.site': { uz: '🏠 Sayt', ru: '🏠 Сайт', en: '🏠 Site' },
    'admin.uploadNav': { uz: '📤 Yuklash', ru: '📤 Загрузка', en: '📤 Upload' },
    'admin.logout': { uz: '🚪 Chiqish', ru: '🚪 Выйти', en: '🚪 Logout' },
    'admin.statsTotal': { uz: "Jami o'yinlar", ru: 'Всего игр', en: 'Total games' },
    'admin.statsPublic': { uz: 'Public', ru: 'Публичные', en: 'Public' },
    'admin.statsPrivate': { uz: 'Private', ru: 'Приватные', en: 'Private' },
    'admin.statsPlays': { uz: "Jami o'ynashlar", ru: 'Всего запусков', en: 'Total plays' },
    'admin.allGames': { uz: "🎮 Barcha o'yinlar", ru: '🎮 Все игры', en: '🎮 All games' },
    'admin.deleteAll': { uz: "🗑️ Hammasini o'chir", ru: '🗑️ Удалить все', en: '🗑️ Delete all' },
    'admin.search': { uz: 'Qidirish...', ru: 'Поиск...', en: 'Search...' },
    'admin.filterAll': { uz: 'Barchasi', ru: 'Все', en: 'All' },
    'admin.filterPublic': { uz: 'Public', ru: 'Публичные', en: 'Public' },
    'admin.filterPrivate': { uz: 'Private', ru: 'Приватные', en: 'Private' },
    'admin.storage': { uz: '💾 Storage Manager', ru: '💾 Менеджер хранилища', en: '💾 Storage Manager' },
    'admin.refresh': { uz: '🔄 Yangilash', ru: '🔄 Обновить', en: '🔄 Refresh' },
    'admin.confirmTitle': { uz: "O'yinni o'chirish", ru: 'Удаление игры', en: 'Delete game' },
    'admin.confirmText': { uz: "Rostdan ham bu o'yinni o'chirishni xohlaysizmi?", ru: 'Вы действительно хотите удалить эту игру?', en: 'Are you sure you want to delete this game?' },
    'admin.confirmCancel': { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },
    'admin.confirmDelete': { uz: "O'chirish", ru: 'Удалить', en: 'Delete' },
    'admin.loading': { uz: 'Yuklanmoqda...', ru: 'Загрузка...', en: 'Loading...' },
    'admin.tableName': { uz: 'Nomi', ru: 'Название', en: 'Name' },
    'admin.tableStatus': { uz: 'Status', ru: 'Статус', en: 'Status' },
    'admin.tablePlays': { uz: "O'ynash", ru: 'Запусков', en: 'Plays' },
    'admin.tableDate': { uz: 'Sana', ru: 'Дата', en: 'Date' },
    'admin.tableActions': { uz: 'Amallar', ru: 'Действия', en: 'Actions' },
    'admin.tablePlay': { uz: "▶ O'ynash", ru: '▶ Играть', en: '▶ Play' },
    'admin.gameNotFound': { uz: "O'yin topilmadi", ru: 'Игра не найдена', en: 'No games found' },
    'admin.publicLabel': { uz: '🌐 Public', ru: '🌐 Публичная', en: '🌐 Public' },
    'admin.privateLabel': { uz: '🔒 Private', ru: '🔒 Приватная', en: '🔒 Private' },
    'admin.makePublic': { uz: '🌐 Public qilish', ru: '🌐 Сделать публичной', en: '🌐 Make public' },
    'admin.makePrivate': { uz: '🔒 Private qilish', ru: '🔒 Сделать приватной', en: '🔒 Make private' },
    'admin.topGames': { uz: "🏆 Eng ko'p o'ynalgan", ru: '🏆 Топ по запускам', en: '🏆 Most played' },
    'admin.quickStats': { uz: '📊 Tezkor statistika', ru: '📊 Быстрая статистика', en: '📊 Quick stats' },
    'admin.noData': { uz: "Ma'lumot yo'q", ru: 'Нет данных', en: 'No data' },
    'admin.avgPlays': { uz: "O'rtacha o'ynashlar", ru: 'Среднее запусков', en: 'Average plays' },
    'admin.publicShare': { uz: 'Public ulushi', ru: 'Доля публичных', en: 'Public share' },
    'admin.privateShare': { uz: 'Private ulushi', ru: 'Доля приватных', en: 'Private share' },
    'admin.toastLoggedOut': { uz: 'Chiqildi', ru: 'Вы вышли', en: 'Logged out' },
    'admin.toastDeleted': { uz: "O'yin o'chirildi", ru: 'Игра удалена', en: 'Game deleted' },
    'admin.toastMadePublic': { uz: 'Public qilindi', ru: 'Сделано публичной', en: 'Made public' },
    'admin.toastMadePrivate': { uz: 'Private qilindi', ru: 'Сделано приватной', en: 'Made private' },
    'admin.deleteAllConfirm1': { uz: "⚠️ BARCHA {n} ta o'yinni o'chirasizmi? Bu amalni qaytarib bo'lmaydi!", ru: '⚠️ Удалить ВСЕ {n} игр? Это действие необратимо!', en: '⚠️ Delete ALL {n} games? This cannot be undone!' },
    'admin.deleteAllConfirm2': { uz: "🔴 Tasdiqlang: {n} ta o'yin va barcha fayllar O'CHIRILADI!", ru: '🔴 Подтвердите: {n} игр и все файлы будут УДАЛЕНЫ!', en: '🔴 Confirm: {n} games and all files will be DELETED!' },
    'admin.deleteAllSuccess': { uz: "✅ {n} ta o'yin o'chirildi", ru: '✅ Удалено {n} игр', en: '✅ {n} games deleted' },
    'admin.deleteAllNoGames': { uz: "O'yinlar yo'q", ru: 'Нет игр', en: 'No games' },
    'admin.deleteSpecConfirm': { uz: "\"{name}\" o'yinini o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi.", ru: 'Удалить игру "{name}"? Это действие необратимо.', en: 'Delete the game "{name}"? This cannot be undone.' },
    'admin.empty': { uz: "Bo'sh", ru: 'Пусто', en: 'Empty' },
    'admin.errorPrefix': { uz: 'Xatolik', ru: 'Ошибка', en: 'Error' },
    'admin.deleteFile': { uz: "🗑️ O'chir", ru: '🗑️ Удалить', en: '🗑️ Delete' },
    'admin.confirmDeleteFile': { uz: '"{name}" ni o\'chirishni xohlaysizmi?', ru: 'Удалить "{name}"?', en: 'Delete "{name}"?' },
    'admin.toastDeletedFile': { uz: '"{name}" o\'chirildi', ru: '"{name}" удалён', en: '"{name}" deleted' },
    'admin.wrongCredentials': { uz: "Login yoki parol noto'g'ri", ru: 'Неверный логин или пароль', en: 'Wrong username or password' },
    'admin.persistentLogin': {
      uz: 'Bu qurilmada 30 kun eslab qolinadi',
      ru: 'Запомнить на этом устройстве на 30 дней',
      en: 'Remembered on this device for 30 days'
    },

    // ─── Analytics dashboard ───
    'analytics.title':         { uz: '📈 Analitika', ru: '📈 Аналитика', en: '📈 Analytics' },
    'analytics.range7d':       { uz: '7 kun', ru: '7 дней', en: '7 days' },
    'analytics.range30d':      { uz: '30 kun', ru: '30 дней', en: '30 days' },
    'analytics.range90d':      { uz: '90 kun', ru: '90 дней', en: '90 days' },
    'analytics.rangePlays':    { uz: "Davr o'ynashlari", ru: 'Запусков за период', en: 'Plays in range' },
    'analytics.rangeUploads':  { uz: "Davr yuklashlari", ru: 'Загрузок за период', en: 'Uploads in range' },
    'analytics.allTimePlays':  { uz: "Hammavaqt o'ynashlari", ru: 'Всего запусков', en: 'All-time plays' },
    'analytics.connection':    { uz: 'Live ulanish', ru: 'Live соединение', en: 'Live connection' },
    'analytics.sseConnected':  { uz: 'Ulangan', ru: 'Подключено', en: 'Connected' },
    'analytics.sseDisconnected': { uz: "Uzilgan — qayta urinilyapti", ru: 'Отключено — переподключаемся', en: 'Disconnected — retrying' },
    'analytics.sseConnecting': { uz: 'Ulanmoqda...', ru: 'Подключение...', en: 'Connecting...' },
    'analytics.activityChart': { uz: "Faollik (har kunlik)", ru: 'Активность (по дням)', en: 'Activity (daily)' },
    'analytics.privacyChart':  { uz: 'Public / Private', ru: 'Публичные / Приватные', en: 'Public / Private' },
    'analytics.categoryChart': { uz: 'Kategoriyalar', ru: 'Категории', en: 'Categories' },
    'analytics.topGamesChart': { uz: "Top o'yinlar", ru: 'Топ игр', en: 'Top games' },
    'analytics.plays':         { uz: "O'ynashlar", ru: 'Запуски', en: 'Plays' },
    'analytics.uploads':       { uz: 'Yuklashlar', ru: 'Загрузки', en: 'Uploads' },
    'analytics.toastUploaded': { uz: '🆕 Yangi o\'yin yuklandi: {name}', ru: '🆕 Новая игра загружена: {name}', en: '🆕 New game uploaded: {name}' },
    'analytics.toastDeleted':  { uz: '🗑️ O\'yin o\'chirildi: {name}', ru: '🗑️ Игра удалена: {name}', en: '🗑️ Game deleted: {name}' },

    // ─── Home page extras ───
    'home.login': { uz: '🔑 Kirish', ru: '🔑 Войти', en: '🔑 Sign in' },
    'home.adminBtn': { uz: '⚙️ Admin', ru: '⚙️ Админ', en: '⚙️ Admin' },
    'home.logoutBtn': { uz: '🚪 Chiqish', ru: '🚪 Выйти', en: '🚪 Logout' },
    'home.linkCopied': { uz: '🔗 Havola nusxalandi!', ru: '🔗 Ссылка скопирована!', en: '🔗 Link copied!' },
    'home.copyPrompt': { uz: 'Havolani nusxalang:', ru: 'Скопируйте ссылку:', en: 'Copy the link:' },

    // ─── Upload extras ───
    'upload.thumbnailMaxSize': { uz: "Rasm 5MB dan katta bo'lmasligi kerak", ru: 'Изображение не должно быть больше 5МБ', en: 'Image must be smaller than 5MB' },
  };

  // ─── State ───
  let currentLang = DEFAULT_LANG;
  let onChangeCallbacks = [];

  // ─── Public API ───

  /** Initialize i18n — load saved language */
  function init() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* private mode */ }
    if (saved && SUPPORTED_LANGS.includes(saved)) {
      currentLang = saved;
    } else {
      // Auto-detect from browser
      const browserLang = (navigator.language || 'uz').slice(0, 2).toLowerCase();
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
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
    applyTranslations();
    onChangeCallbacks.forEach(cb => cb(lang));
  }

  /**
   * Get translation by key with optional `{name}` placeholder substitution.
   *   I18N.t('admin.deleteAllConfirm1', { n: 5 }) → "⚠️ BARCHA 5 ta..."
   */
  function t(key, vars) {
    const entry = translations[key];
    let str = entry ? (entry[currentLang] || entry[DEFAULT_LANG] || key) : key;
    if (vars && typeof vars === 'object') {
      str = str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
    }
    return str;
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
    // Strict — replaces full text/value (default)
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translation;
      } else {
        el.textContent = translation;
      }
    });

    // Soft — text-only (for elements with neighbouring icons/emojis preserved
    // in surrounding text nodes). Treat data-i18n-text exactly like
    // data-i18n but reserved for inner <span> textContent.
    document.querySelectorAll('[data-i18n-text]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n-text'));
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
