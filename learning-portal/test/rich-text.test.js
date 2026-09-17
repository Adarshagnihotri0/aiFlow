import test from 'node:test';
import assert from 'node:assert/strict';
import { richText } from '../public/rich-text.js';

// Intentionally tiny DOM adapter: no parser, attributes, HTML sinks or browser
// dependency. Unexpected element creation or non-node appends fail immediately.
class TestNode {
  constructor(tagName, data = '') { this.tagName = tagName; this.data = data; this.childNodes = []; }
  appendChild(node) { assert.ok(node instanceof TestNode); this.childNodes.push(node); return node; }
  get textContent() { return this.tagName === '#text' ? this.data : this.childNodes.map((node) => node.textContent).join(''); }
  set innerHTML(_value) { assert.fail('HTML parsing is forbidden'); }
  set textContent(_value) { assert.fail('Content must use explicit text nodes'); }
}
const allowed = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'pre', 'code', 'strong', 'em']);
function withDocument(run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement(tag) { assert.ok(allowed.has(tag), `Unexpected element: ${tag}`); return new TestNode(tag); },
    createTextNode(value) { assert.equal(typeof value, 'string'); return new TestNode('#text', value); },
  } });
  try { return run(); } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  }
}
const elements = (node) => node.childNodes.filter((child) => child.tagName !== '#text');
const tags = (node) => elements(node).map((child) => child.tagName);

test('richText returns a fresh detached div and validates its string contract', () => withDocument(() => {
  const empty = richText(' \n\t');
  assert.equal(empty.tagName, 'div'); assert.equal(empty.className, 'rich-text');
  assert.deepEqual(empty.childNodes, []);
  assert.notEqual(richText('same'), richText('same'));
  for (const value of [undefined, null, 42, {}, ['text']]) assert.throws(() => richText(value), TypeError);
}));

test('headings, paragraphs, flat lists and inline formatting use semantic elements', () => withDocument(() => {
  const root = richText('# Goal\r\n\r\nDefine **ownership** with *care* and `owner()` [S1].\r\nNext line.\r\n\r\n- One\r\n+ Two\r\n* Three\r\n1. Check\r\n2. Observe\r\n## Result');
  assert.deepEqual(tags(root), ['h1', 'p', 'ul', 'ol', 'h2']);
  const paragraph = root.childNodes[1];
  assert.deepEqual(tags(paragraph), ['strong', 'em', 'code']);
  assert.equal(paragraph.textContent, 'Define ownership with care and owner() [S1].\nNext line.');
  assert.deepEqual(tags(root.childNodes[2]), ['li', 'li', 'li']);
  assert.deepEqual(root.childNodes[2].childNodes.map((node) => node.textContent), ['One', 'Two', 'Three']);
  assert.deepEqual(tags(root.childNodes[3]), ['li', 'li']);
  assert.deepEqual(tags(richText('# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six')), ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
}));

test('fenced code is literal, ignores info strings and respects fence length', () => withDocument(() => {
  const source = '````js onclick=alert(1)\n<script>bad()</script>\n**literal**\n```\n  indented\n````\nAfter';
  const root = richText(source);
  assert.deepEqual(tags(root), ['pre', 'p']);
  const pre = root.childNodes[0];
  assert.deepEqual(tags(pre), ['code']);
  assert.deepEqual(tags(pre.childNodes[0]), []);
  assert.equal(pre.textContent, '<script>bad()</script>\n**literal**\n```\n  indented');
  assert.equal(root.childNodes[1].textContent, 'After');
  assert.equal(richText('```\n```').childNodes[0].textContent, '');
}));

test('truncated fences and unmatched inline markers remain readable without inventing content', () => withDocument(() => {
  const root = richText('Before\n\n```kotlin\nval x = "<tag>"\n\n# still code');
  assert.deepEqual(tags(root), ['p', 'pre']);
  assert.equal(root.childNodes[1].textContent, 'val x = "<tag>"\n\n# still code');
  for (const value of ['`unfinished', '**unfinished', '*unfinished']) assert.equal(richText(value).textContent, value);
  const inline = richText('`**not bold** <img>`');
  assert.deepEqual(tags(inline.childNodes[0]), ['code']);
  assert.equal(inline.textContent, '**not bold** <img>');
}));

test('HTML, entities, links, images and script URLs never create active DOM', () => withDocument(() => {
  const payloads = [
    '<script>alert(1)</script><img src=x onerror=alert(2)>',
    '<svg onload=alert(1)><a href="javascript:alert(2)">x</a></svg>',
    '[click](javascript:alert(1)) ![image](https://example.invalid/track)',
    '<https://example.invalid> &lt;script&gt; &#60;img&#62;',
    '####### not a heading\n> not a quote\n  - not a nested list\n_under_score_',
  ];
  for (const payload of payloads) {
    const root = richText(payload);
    assert.deepEqual(tags(root), ['p']); assert.equal(root.textContent, payload);
    assert.deepEqual(tags(root.childNodes[0]), []);
  }
  const styled = richText('**<img src=x onerror=alert(1)>**');
  const strong = elements(styled.childNodes[0])[0];
  assert.equal(strong.tagName, 'strong'); assert.deepEqual(tags(strong), []);
  assert.equal(strong.textContent, '<img src=x onerror=alert(1)>');
}));

test('long delimiter-heavy content remains literal without recursion', () => withDocument(() => {
  const payload = '*'.repeat(16000);
  assert.equal(richText(payload).textContent, payload);
}));