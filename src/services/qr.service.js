'use strict';

const QRCode = require('qrcode');

class QRService {
  /**
   * Render QR code for a URL.
   * @returns {Promise<{ contentType, body }>}
   */
  async render(url, { size = 300, format = 'png' } = {}) {
    if (format === 'svg') {
      const svg = await QRCode.toString(url, { type: 'svg', width: size, margin: 1 });
      return { contentType: 'image/svg+xml', body: svg };
    }
    const png = await QRCode.toBuffer(url, {
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#00000000' },
      errorCorrectionLevel: 'M',
    });
    return { contentType: 'image/png', body: png };
  }
}

module.exports = { QRService };
