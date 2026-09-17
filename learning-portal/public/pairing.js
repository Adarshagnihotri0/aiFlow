// Fragments are not sent in HTTP requests. Remove this bearer code from the
// current history entry before making any request or rendering the notebook.
export function consumePairingLink(location, history) {
  if (!location.hash.startsWith('#pair=')) return null;
  const code = location.hash.slice(6);
  history.replaceState(null, '', `${location.pathname}${location.search}#today`);
  return { code: /^[A-Za-z0-9_-]{12}$/.test(code) ? code : '' };
}

export function pairingQr(matrix) {
  const { size, data } = matrix || {};
  if (!Number.isInteger(size) || size < 21 || size > 177 || !Array.isArray(data)
    || data.length !== size * size || data.some(value => value !== 0 && value !== 1)) {
    throw new Error('QR code unavailable. Use manual connection below.');
  }
  const canvas = document.createElement('canvas');
  const scale = 5;
  canvas.width = canvas.height = (size + 8) * scale;
  canvas.className = 'pair-qr';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Scan with your phone camera to connect to your private notebook');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('QR code unavailable. Use manual connection below.');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (data[row * size + col]) context.fillRect((col + 4) * scale, (row + 4) * scale, scale, scale);
    }
  }
  return canvas;
}