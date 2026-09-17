/**
 * Render a deliberately minimal Markdown subset into a detached HTMLDivElement.
 * Named browser export: richText(content: string). Uses the current document.
 * Supports unindented # through ###### headings, flat -/+/* or 1. lists,
 * backtick fences (3+ ticks; optional info ignored), and non-nested `code`,
 * **bold**, *emphasis*. Blank lines separate paragraphs; soft breaks stay text.
 * Lists restart at 1. No nested lists, escapes, underscore markup, tables,
 * links, images, HTML parsing or syntax highlighting. Unsupported syntax stays
 * text; unmatched inline markers stay literal; an unclosed fence runs to EOF.
 * All content, including code and HTML-looking input, enters via text nodes.
 */
export function richText(content) {
  if (typeof content !== 'string') throw new TypeError('richText content must be a string.');
  const root = document.createElement('div');
  root.className = 'rich-text';
  const text = (parent, value) => parent.appendChild(document.createTextNode(value));
  function inline(parent, value) {
    const tokens = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
    let end = 0;
    for (const match of value.matchAll(tokens)) {
      text(parent, value.slice(end, match.index));
      const node = document.createElement(match[1] !== undefined ? 'code' : match[2] !== undefined ? 'strong' : 'em');
      text(node, match[1] ?? match[2] ?? match[3]);
      parent.appendChild(node);
      end = match.index + match[0].length;
    }
    text(parent, value.slice(end));
  }
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const heading = (line) => /^(#{1,6})[ \t]+(.+)$/.exec(line);
  const item = (line) => /^([-+*]|\d+\.)[ \t]+(.+)$/.exec(line);
  const fence = (line) => /^(`{3,})([^`]*)$/.exec(line);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const opening = fence(line);
    if (opening) {
      index++;
      const codeLines = [];
      const closes = (value) => /^`{3,}[ \t]*$/.test(value) && value.trim().length >= opening[1].length;
      while (index < lines.length && !closes(lines[index])) codeLines.push(lines[index++]);
      if (index < lines.length) index++;
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      text(code, codeLines.join('\n')); pre.appendChild(code); root.appendChild(pre);
      continue;
    }
    const title = heading(line);
    if (title) {
      const node = document.createElement(`h${title[1].length}`);
      inline(node, title[2]); root.appendChild(node); index++;
      continue;
    }
    const first = item(line);
    if (first) {
      const ordered = first[1].endsWith('.');
      const list = document.createElement(ordered ? 'ol' : 'ul');
      while (index < lines.length) {
        const next = item(lines[index]);
        if (!next || next[1].endsWith('.') !== ordered) break;
        const node = document.createElement('li');
        inline(node, next[2]); list.appendChild(node); index++;
      }
      root.appendChild(list);
      continue;
    }
    const paragraph = [line]; index++;
    while (index < lines.length && lines[index].trim() && !fence(lines[index]) && !heading(lines[index]) && !item(lines[index])) paragraph.push(lines[index++]);
    const node = document.createElement('p');
    inline(node, paragraph.join('\n')); root.appendChild(node);
  }
  return root;
}