/**
 * Upload page — drag&drop, thumbnail, multipart upload via XHR (progress),
 * games manager (list, QR, download, delete).
 */

(function () {
  const { $, $$, escapeHTML, formatSize, Auth, api, toast } = window.GH;

  const Upload = {
    selectedFile: null,
    selectedThumbnail: null,
    uploadedGameId: null,

    async init() {
      I18N.init();
      I18N.applyTranslations();

      // Auth gate
      if (!(await Auth.check())) {
        try { sessionStorage.setItem('gamehost_redirect', 'upload.html'); } catch {}
        window.location.href = 'admin.html';
        return;
      }

      $$('.lang-btn').forEach((b) => {
        b.addEventListener('click', () => I18N.setLang(b.dataset.lang));
      });
      I18N.onChange(() => this.loadGamesList());

      this.setupDropZone();
      this.setupThumbnail();
      this.setupForm();
      this.setupManagerListEvents();
      this.loadGamesList();
    },

    // ─── File selection ───
    setupDropZone() {
      const zone = $('#drop-zone');
      const input = $('#file-input');
      const browseBtn = $('#browse-btn');
      browseBtn.addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
      zone.addEventListener('click', () => input.click());
      input.addEventListener('change', () => input.files[0] && this.selectFile(input.files[0]));
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragging'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragging');
        e.dataTransfer.files[0] && this.selectFile(e.dataTransfer.files[0]);
      });
      $('#file-remove').addEventListener('click', () => this.clearFile());
    },

    selectFile(file) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext !== 'html' && ext !== 'zip') {
        alert(I18N.t('upload.fileOnly'));
        return;
      }
      this.selectedFile = file;
      const icon = ext === 'zip' ? '📦' : '📄';
      $('#file-name').textContent = `${icon} ${file.name}`;
      $('#file-size').textContent = formatSize(file.size);
      $('#file-info').classList.add('visible');
      $('#drop-zone').style.display = 'none';
      $('#form-section').classList.add('visible');
      $('#submit-section').classList.add('visible');
      const baseName = file.name.replace(/\.(html|zip)$/i, '').replace(/[-_]/g, ' ');
      $('#gameName_uz').value = baseName;
      $('#gameName_en').value = baseName;
    },

    clearFile() {
      this.selectedFile = null;
      $('#file-input').value = '';
      $('#file-info').classList.remove('visible');
      $('#drop-zone').style.display = '';
      $('#form-section').classList.remove('visible');
      $('#submit-section').classList.remove('visible');
    },

    // ─── Thumbnail ───
    setupThumbnail() {
      const area = $('#thumb-upload-area');
      const input = $('#thumb-input');
      const preview = $('#thumb-preview');
      const clearBtn = $('#thumb-clear-btn');
      area.addEventListener('click', (e) => { if (e.target !== clearBtn) input.click(); });
      input.addEventListener('change', () => input.files[0] && this.selectThumb(input.files[0]));
      area.addEventListener('dragover', (e) => { e.preventDefault(); area.style.borderColor = 'var(--accent-primary)'; });
      area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
      area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.style.borderColor = '';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) this.selectThumb(file);
      });
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedThumbnail = null;
        input.value = '';
        preview.innerHTML = '🖼️';
        clearBtn.classList.remove('visible');
      });
    },

    selectThumb(file) {
      if (file.size > 5 * 1024 * 1024) { alert("Rasm 5MB dan katta bo'lmasligi kerak"); return; }
      this.selectedThumbnail = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        $('#thumb-preview').innerHTML = `<img src="${e.target.result}" alt="thumb">`;
        $('#thumb-clear-btn').classList.add('visible');
      };
      reader.readAsDataURL(file);
    },

    // ─── Form ───
    setupForm() {
      $('#submit-btn').addEventListener('click', () => this.submit());
      $('#result-another').addEventListener('click', () => this.resetForm());
      $('#result-play').addEventListener('click', () => {
        if (this.uploadedGameId) {
          window.location.href = 'play.html?game=' + this.uploadedGameId;
        }
      });
    },

    async submit() {
      if (!this.selectedFile) return;
      const btn = $('#submit-btn');
      const progress = $('#upload-progress');
      const fill = $('#progress-fill');
      const text = $('#progress-text');

      btn.classList.add('loading');
      btn.disabled = true;
      progress.classList.add('visible');

      const fd = new FormData();
      fd.append('gameFile', this.selectedFile);
      ['gameName_uz','gameName_en','gameName_ru','gameDesc_uz','gameDesc_en','gameDesc_ru']
        .forEach((id) => fd.append(id, $('#' + id).value));
      fd.append('category', $('#category').value);
      fd.append('version', '1.0');
      fd.append('isPrivate', $('#isPrivate').checked ? 'true' : 'false');
      if (this.selectedThumbnail) fd.append('thumbnail', this.selectedThumbnail);

      try {
        const result = await api.upload('/api/upload', fd, {
          onProgress: (pct) => {
            fill.style.width = pct + '%';
            text.textContent = pct < 100
              ? `${I18N.t('upload.uploading')} ${pct}%`
              : I18N.t('upload.installing');
          },
        });
        this.uploadedGameId = result.game.id;
        this.showResult(true, result.message, result.privateLink);
        this.loadGamesList();
      } catch (err) {
        this.showResult(false, err.message);
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        progress.classList.remove('visible');
      }
    },

    showResult(success, message, privateLink) {
      $('#upload-form').style.display = 'none';
      $('#upload-result').classList.add('visible');
      $('#result-icon').textContent = success ? '✅' : '❌';
      $('#result-title').textContent = I18N.t(success ? 'upload.success' : 'upload.error');
      $('#result-text').textContent = message;
      $('#result-text').className = 'result-text' + (success ? '' : ' result-error');

      if (success && privateLink) {
        $('#result-play').onclick = () => { window.location.href = privateLink; };
        $('#result-play').style.display = '';
        const fullLink = window.location.origin + privateLink;
        $('#result-text').innerHTML = escapeHTML(message) +
          `<div class="private-link-box" style="margin-top:12px;">
             🔒 <a href="${escapeHTML(privateLink)}">${escapeHTML(fullLink)}</a>
             <button class="copy-btn" data-copy="${escapeHTML(fullLink)}">${escapeHTML(I18N.t('upload.copyBtn'))}</button>
           </div>`;
      } else if (success) {
        $('#result-play').style.display = '';
        $('#result-play').onclick = () => { window.location.href = 'play.html?game=' + this.uploadedGameId; };
      } else {
        $('#result-play').style.display = 'none';
      }
    },

    resetForm() {
      $('#upload-form').style.display = '';
      $('#upload-result').classList.remove('visible');
      this.clearFile();
      $$('.form-input, .form-textarea').forEach((el) => { el.value = ''; });
      $('#progress-fill').style.width = '0%';
      $('#isPrivate').checked = false;
      this.selectedThumbnail = null;
      $('#thumb-input').value = '';
      $('#thumb-preview').innerHTML = '🖼️';
      $('#thumb-clear-btn').classList.remove('visible');
    },

    // ─── Manager list ───
    setupManagerListEvents() {
      const list = $('#manager-list');
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (btn) {
          const { action, id, name } = btn.dataset;
          if (action === 'qr') this.showQR(id, name);
          else if (action === 'download') this.downloadGame(id);
          else if (action === 'delete') this.deleteGame(id, name);
          return;
        }
        const copyBtn = e.target.closest('[data-copy]');
        if (copyBtn) {
          navigator.clipboard.writeText(copyBtn.dataset.copy)
            .then(() => { copyBtn.textContent = I18N.t('upload.copiedBtn'); });
        }
      });
    },

    async loadGamesList() {
      let games = [];
      try { games = await api.get('/api/admin/games'); } catch { /* ignore */ }
      this.renderGamesList(games);
    },

    renderGamesList(games) {
      const list = $('#manager-list');
      if (games.length === 0) {
        list.innerHTML = `<div class="manager-empty">${I18N.t('upload.noGames')}</div>`;
        return;
      }
      list.innerHTML = games.map((g) => this.renderGameItem(g)).join('');
    },

    renderGameItem(g) {
      const name = I18N.localize(g.name) || g.id;
      const cat = g.category || 'casual';
      const thumb = g.thumbnail
        ? `<img src="games/${escapeHTML(g.folder)}/${escapeHTML(g.thumbnail)}" alt="${escapeHTML(name)}">`
        : '🎮';
      const badge = g.isPrivate
        ? '<span class="manager-badge private">🔒 PRIVATE</span>'
        : '<span class="manager-badge public">🌐 PUBLIC</span>';
      const playLink = g.isPrivate && g.privateToken
        ? `play.html?token=${escapeHTML(g.privateToken)}`
        : `play.html?game=${escapeHTML(g.id)}`;
      const fullLink = `${window.location.origin}/${playLink}`;
      const privateBox = g.isPrivate && g.privateToken
        ? `<div class="private-link-box">
             🔒 <a href="${playLink}" target="_blank">${escapeHTML(fullLink)}</a>
             <button class="copy-btn" data-copy="${escapeHTML(fullLink)}">${escapeHTML(I18N.t('upload.copyBtn'))}</button>
           </div>`
        : '';
      return `
        <div class="manager-item" data-id="${escapeHTML(g.id)}">
          <div class="manager-item-thumb">${thumb}</div>
          <div class="manager-item-info">
            <div class="manager-item-name">${escapeHTML(name)} ${badge}</div>
            <div class="manager-item-meta">
              <span>${escapeHTML(cat)}</span>
              <span>v${escapeHTML(g.version || '1.0')}</span>
              <span>${escapeHTML(g.folder)}/</span>
            </div>
            <div class="manager-item-stats">
              <span>▶️ ${g.playCount || 0} ${escapeHTML(I18N.t('manager.plays'))}</span>
              <span>📅 ${g.createdAt ? new Date(g.createdAt).toLocaleDateString() : '—'}</span>
            </div>
            ${privateBox}
          </div>
          <div class="manager-item-actions">
            <a href="${playLink}" class="manager-btn play">${escapeHTML(I18N.t('manager.play'))}</a>
            <button class="manager-btn qr" data-action="qr" data-id="${escapeHTML(g.id)}" data-name="${escapeHTML(name)}">📱 QR</button>
            <button class="manager-btn download" data-action="download" data-id="${escapeHTML(g.id)}">${escapeHTML(I18N.t('manager.download'))}</button>
            <button class="manager-btn delete" data-action="delete" data-id="${escapeHTML(g.id)}" data-name="${escapeHTML(name)}">${escapeHTML(I18N.t('manager.delete'))}</button>
          </div>
        </div>`;
    },

    async deleteGame(id, name) {
      if (!confirm(`"${name}" ${I18N.t('upload.deleteConfirm')}`)) return;
      try {
        await api.delete('/api/games/' + id);
        this.loadGamesList();
        toast(I18N.t('manager.delete'), 'success');
      } catch (err) {
        alert(I18N.t('upload.deleteError') + ': ' + err.message);
      }
    },

    async downloadGame(id) {
      try {
        const blob = await api.fetchBlob('/api/games/' + id + '/download');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = id + '.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        alert(I18N.t('upload.downloadError') + ': ' + err.message);
      }
    },

    async showQR(id, name) {
      const overlay = $('#qr-modal-overlay');
      const img = $('#qr-modal-img');
      $('#qr-modal-title').textContent = '📱 ' + name;
      try {
        const blob = await api.fetchBlob('/api/games/' + id + '/qr?size=300&t=' + Date.now());
        img.src = URL.createObjectURL(blob);
        $('#qr-modal-url').textContent = `${window.location.origin}/play.html?game=${id}`;
        overlay.classList.add('visible');
        $('#qr-download-btn').onclick = async () => {
          try {
            const big = await api.fetchBlob('/api/games/' + id + '/qr?size=600');
            const u = URL.createObjectURL(big);
            const a = document.createElement('a');
            a.href = u;
            a.download = id + '-qr.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(u);
          } catch (err) { alert(err.message); }
        };
      } catch (err) {
        $('#qr-modal-url').textContent = I18N.t('qr.error') + ': ' + err.message;
        overlay.classList.add('visible');
      }
    },

    closeQR() {
      const overlay = $('#qr-modal-overlay');
      overlay.classList.remove('visible');
      const img = $('#qr-modal-img');
      if (img.src && img.src.startsWith('blob:')) {
        URL.revokeObjectURL(img.src);
        img.src = '';
      }
    },
  };

  // Modal click-outside (reusing global handler)
  document.addEventListener('click', (e) => {
    const overlay = $('#qr-modal-overlay');
    if (!overlay) return;
    if (e.target === overlay || e.target.classList.contains('qr-close')) {
      Upload.closeQR();
    }
  });

  // Expose minimal API for inline onclick fallbacks
  window.Upload = Upload;
  document.addEventListener('DOMContentLoaded', () => Upload.init());
})();
