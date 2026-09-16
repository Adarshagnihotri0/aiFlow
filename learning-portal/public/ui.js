/** All strings, including API content, pass through textContent; never HTML parsing. */
export function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (['checked', 'disabled', 'hidden', 'required', 'multiple'].includes(key)) node[key] = Boolean(value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    if (child instanceof Node) node.append(child);
    else { const text = document.createTextNode(''); text.textContent = String(child); node.append(text); }
  }
  return node;
}

export const text = (value) => typeof value === 'string' ? value : '';
export const list = (value) => Array.isArray(value) ? value : [];
export const paragraph = (value, className = 'body-text') => el('p', { class: className, text: text(value) });
export const pill = (value, tone = '') => el('span', { class: `pill ${tone}`, text: value });
export const button = (label, action, className = '', attrs = {}) => el('button', { type: 'button', class: `button ${className}`, onclick: action, ...attrs }, label);
export const link = (label, href, className = '') => el('a', { href, class: `button ${className}` }, label);
export const chips = (values) => el('div', { class: 'chips' }, list(values).map((value) => pill(text(value))));
export const heading = (title, subtitle, eyebrow) => el('div', { class: 'page-intro' }, el('div', {}, eyebrow && el('span', { class: 'eyebrow', text: eyebrow }), el('h1', { text: title }), subtitle && paragraph(subtitle)));
export const empty = (title, message, action) => el('section', { class: 'card empty' }, el('div', { class: 'empty-symbol', 'aria-hidden': 'true' }, icon('book')), el('h2', { text: title }), paragraph(message), action);
export const field = (label, input, help) => el('div', { class: 'form-field' }, el('label', { for: input.id, text: label }), input, help && paragraph(help, 'muted small'));
export function errorBox(message, retry) {
  return el('div', { class: 'error', role: 'alert' }, paragraph(message), retry && button('Try again', retry, 'secondary'));
}

export function select(id, options, value) {
  const node = el('select', { id, name: id }, options.map(([key, label]) => el('option', { value: key, text: label })));
  node.value = String(value);
  return node;
}

// Only constant, locally authored SVG path data is used here.
export function icon(name) {
  const paths = {
    today: ['M3 10 12 3l9 7', 'M5 9v12h14V9', 'M9 21v-7h6v7'],
    ask: ['M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z', 'M8 10h8M8 14h5'],
    practice: ['M8 3h12v15H8z', 'M4 7v15h12', 'M11 8h6M11 12h4'],
    career: ['M9 6V3h6v3', 'M3 6h18v15H3z', 'M3 11c6 4 12 4 18 0', 'M12 11v4'],
    profile: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M4 21v-2a8 8 0 0 1 16 0v2'],
    book: ['M3 4h6c2 0 3 1 3 3v14c0-2-1-3-3-3H3z', 'M21 4h-6c-2 0-3 1-3 3v14c0-2 1-3 3-3h6z'],
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'nav-icon' })) svg.setAttribute(key, value);
  for (const data of paths[name] || paths.book) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', data);
    svg.append(path);
  }
  return svg;
}