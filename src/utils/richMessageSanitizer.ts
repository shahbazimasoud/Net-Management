export type RichTextDir = 'auto' | 'rtl' | 'ltr';
export type RichTextAlign = 'auto' | 'left' | 'right' | 'center' | 'justify';

export interface RichAstTextNode {
  kind: 'text';
  text: string;
}

export interface RichAstElementNode {
  kind: 'element';
  tag: string;
  dir?: 'rtl' | 'ltr' | 'auto';
  align?: 'left' | 'right' | 'center' | 'justify';
  color?: string;
  backgroundColor?: string;
  href?: string;
  children: RichAstNode[];
}

export type RichAstNode = RichAstTextNode | RichAstElementNode;

const ALLOWED_TAGS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'pre',
  'ul',
  'ol',
  'li',
  'hr',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'span',
  'font',
  'code',
  'a',
  'sub',
  'sup',
]);

const VOID_TAGS = new Set(['br', 'hr']);

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'pre',
  'ul',
  'ol',
  'li',
  'hr',
]);

const STRIP_CONTENT_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'form',
  'textarea',
  'select',
  'option',
  'noscript',
  'template',
]);

const SAFE_NAMED_COLORS = new Set([
  'black',
  'white',
  'red',
  'crimson',
  'rose',
  'orange',
  'amber',
  'gold',
  'yellow',
  'green',
  'emerald',
  'teal',
  'cyan',
  'blue',
  'sky',
  'indigo',
  'violet',
  'purple',
  'pink',
  'gray',
  'grey',
  'slate',
  'silver',
  'maroon',
  'navy',
  'olive',
  'lime',
  'aqua',
  'fuchsia',
  'transparent',
  'inherit',
]);

export function normalizeRichDirection(val: unknown, fallback: RichTextDir = 'auto'): RichTextDir {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'rtl' || s === 'ltr' || s === 'auto') return s;
  return fallback;
}

export function normalizeRichAlign(val: unknown, fallback: RichTextAlign = 'auto'): RichTextAlign {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'left' || s === 'right' || s === 'center' || s === 'justify' || s === 'auto') {
    return s;
  }
  return fallback;
}

export function sanitizeCssColor(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 48) return undefined;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed) || /^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{8}$/.test(trimmed)) {
    return trimmed;
  }
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i
  );
  if (rgbMatch) {
    const r = Math.min(255, Number(rgbMatch[1]));
    const g = Math.min(255, Number(rgbMatch[2]));
    const b = Math.min(255, Number(rgbMatch[3]));
    if (rgbMatch[4] !== undefined) {
      const a = Math.max(0, Math.min(1, Number(rgbMatch[4])));
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }
  const lower = trimmed.toLowerCase();
  if (SAFE_NAMED_COLORS.has(lower)) {
    return lower;
  }
  return undefined;
}

export function normalizeSafeLinkUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  let candidate = rawUrl.trim().replace(/[\u0000-\u001F\u007F]/g, '');
  if (!candidate) return null;

  // Reject dangerous or non-web protocols explicitly
  if (/^(javascript|vbscript|data|file|blob|about):/i.test(candidate)) {
    return null;
  }

  // Allow bare domains like portal.company.local/docs -> https://portal.company.local/docs
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    if (/^mailto:/i.test(candidate)) {
      // handled above
    } else if (/^www\./i.test(candidate) || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:[/:?#]|$)/.test(candidate)) {
      candidate = `https://${candidate}`;
    } else if (candidate.startsWith('/')) {
      return candidate;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(candidate);
    const proto = parsed.protocol.toLowerCase();
    if (proto === 'http:' || proto === 'https:' || proto === 'mailto:') {
      return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

export function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '';
      try {
        return String.fromCodePoint(code);
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '';
      try {
        return String.fromCodePoint(code);
      } catch {
        return '';
      }
    });
}

export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeHtmlAttr(text: string): string {
  return escapeHtmlText(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalizeTagName(rawTag: string): string {
  const t = rawTag.toLowerCase();
  if (t === 'b') return 'strong';
  if (t === 'i') return 'em';
  if (t === 'strike' || t === 'del') return 's';
  if (t === 'font') return 'span';
  if (t === 'h1') return 'h2';
  if (t === 'h4') return 'h3';
  return t;
}

function parseAttributes(attrSource: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrSource)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = decodeBasicHtmlEntities(val);
  }
  return attrs;
}

function parseSafeStyleString(styleStr?: string): {
  align?: 'left' | 'right' | 'center' | 'justify';
  color?: string;
  backgroundColor?: string;
  direction?: 'rtl' | 'ltr';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
} {
  const result: {
    align?: 'left' | 'right' | 'center' | 'justify';
    color?: string;
    backgroundColor?: string;
    direction?: 'rtl' | 'ltr';
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
  } = {};
  if (!styleStr) return result;
  if (/url\s*\(|expression\s*\(|javascript:/i.test(styleStr)) return result;

  const decls = styleStr.split(';');
  for (const decl of decls) {
    const idx = decl.indexOf(':');
    if (idx <= 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!val) continue;

    if (prop === 'text-align') {
      const a = val.toLowerCase();
      if (a === 'left' || a === 'right' || a === 'center' || a === 'justify') {
        result.align = a;
      } else if (a === 'start') {
        // leave to direction
      } else if (a === 'end') {
        // leave to direction
      }
    } else if (prop === 'color') {
      const c = sanitizeCssColor(val);
      if (c) result.color = c;
    } else if (prop === 'background-color' || prop === 'background') {
      const bg = sanitizeCssColor(val);
      if (bg && bg !== 'transparent') result.backgroundColor = bg;
    } else if (prop === 'direction') {
      const d = val.toLowerCase();
      if (d === 'rtl' || d === 'ltr') result.direction = d;
    } else if (prop === 'font-weight') {
      const w = val.toLowerCase();
      if (w === 'bold' || w === '600' || w === '700' || w === '800') result.bold = true;
    } else if (prop === 'font-style') {
      if (val.toLowerCase() === 'italic') result.italic = true;
    } else if (prop === 'text-decoration' || prop === 'text-decoration-line') {
      const td = val.toLowerCase();
      if (td.includes('underline')) result.underline = true;
      if (td.includes('line-through')) result.strike = true;
    }
  }
  return result;
}

export function parseSanitizedRichNodes(rawHtml?: string | null): RichAstNode[] {
  if (!rawHtml || typeof rawHtml !== 'string') return [];
  const bounded = rawHtml.slice(0, 64_000);

  const root: RichAstElementNode = {
    kind: 'element',
    tag: 'root',
    children: [],
  };

  const stack: Array<{ node: RichAstElementNode; rawTag: string }> = [
    { node: root, rawTag: 'root' },
  ];
  let suppressedDepth = 0;
  let suppressedTag = '';

  const tokenRegex = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(bounded)) !== null) {
    const isClosing = match[1] === '/';
    const rawTagName = match[2];
    const attrSource = match[3] || '';
    const textChunk = match[4];

    if (textChunk !== undefined) {
      if (suppressedDepth > 0) continue;
      const decoded = decodeBasicHtmlEntities(textChunk);
      if (!decoded) continue;
      const parent = stack[stack.length - 1].node;
      const last = parent.children[parent.children.length - 1];
      if (last && last.kind === 'text') {
        last.text += decoded;
      } else {
        parent.children.push({ kind: 'text', text: decoded });
      }
      continue;
    }

    if (!rawTagName) continue;
    const rawLower = rawTagName.toLowerCase();

    if (STRIP_CONTENT_TAGS.has(rawLower)) {
      if (!isClosing && !attrSource.trim().endsWith('/')) {
        if (suppressedDepth === 0) suppressedTag = rawLower;
        if (suppressedTag === rawLower) suppressedDepth++;
      } else if (isClosing && suppressedDepth > 0 && suppressedTag === rawLower) {
        suppressedDepth--;
        if (suppressedDepth === 0) suppressedTag = '';
      }
      continue;
    }

    if (suppressedDepth > 0) continue;

    if (!ALLOWED_TAGS.has(rawLower)) {
      // Unwrap disallowed benign tags while keeping their text/children
      continue;
    }

    const normalizedTag = normalizeTagName(rawLower);

    if (isClosing) {
      if (VOID_TAGS.has(normalizedTag)) continue;
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].node.tag === normalizedTag || stack[i].rawTag === rawLower) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const attrs = parseAttributes(attrSource);
    const parsedStyle = parseSafeStyleString(attrs.style);
    const parent = stack[stack.length - 1].node;

    const el: RichAstElementNode = {
      kind: 'element',
      tag: normalizedTag,
      children: [],
    };

    const dirAttr = (attrs.dir || parsedStyle.direction || '').toLowerCase();
    if (dirAttr === 'rtl' || dirAttr === 'ltr' || dirAttr === 'auto') {
      el.dir = dirAttr;
    }

    const alignAttr = (attrs.align || parsedStyle.align || '').toLowerCase();
    if (
      alignAttr === 'left' ||
      alignAttr === 'right' ||
      alignAttr === 'center' ||
      alignAttr === 'justify'
    ) {
      el.align = alignAttr;
    }

    const color = parsedStyle.color || sanitizeCssColor(attrs.color);
    if (color) el.color = color;

    if (parsedStyle.backgroundColor) {
      el.backgroundColor = parsedStyle.backgroundColor;
    }

    if (normalizedTag === 'a') {
      const safeHref = normalizeSafeLinkUrl(attrs.href);
      if (safeHref) {
        el.href = safeHref;
      } else {
        // Invalid/unsafe href -> downgrade to plain span
        el.tag = 'span';
      }
    }

    // Check inline style wrappers on span (from Chrome/Edge execCommand)
    let targetContainer: RichAstElementNode = el;
    if (normalizedTag === 'span') {
      if (parsedStyle.bold) {
        const w: RichAstElementNode = { kind: 'element', tag: 'strong', children: [] };
        targetContainer.children.push(w);
        targetContainer = w;
      }
      if (parsedStyle.italic) {
        const w: RichAstElementNode = { kind: 'element', tag: 'em', children: [] };
        targetContainer.children.push(w);
        targetContainer = w;
      }
      if (parsedStyle.underline) {
        const w: RichAstElementNode = { kind: 'element', tag: 'u', children: [] };
        targetContainer.children.push(w);
        targetContainer = w;
      }
      if (parsedStyle.strike) {
        const w: RichAstElementNode = { kind: 'element', tag: 's', children: [] };
        targetContainer.children.push(w);
        targetContainer = w;
      }
    }

    parent.children.push(el);
    const isSelfClosing = VOID_TAGS.has(normalizedTag) || attrSource.trim().endsWith('/');
    if (!isSelfClosing) {
      stack.push({ node: targetContainer, rawTag: rawLower });
    }
  }

  return root.children;
}

function serializeRichNode(node: RichAstNode): string {
  if (node.kind === 'text') {
    return escapeHtmlText(node.text);
  }
  if (VOID_TAGS.has(node.tag)) {
    return `<${node.tag}>`;
  }

  const attrs: string[] = [];
  if (node.dir) {
    attrs.push(`dir="${node.dir}"`);
  }
  if (node.tag === 'a' && node.href) {
    attrs.push(`href="${escapeHtmlAttr(node.href)}"`);
    attrs.push('target="_blank"');
    attrs.push('rel="noopener noreferrer"');
  }

  const styles: string[] = [];
  if (node.align) styles.push(`text-align:${node.align}`);
  if (node.color) styles.push(`color:${node.color}`);
  if (node.backgroundColor) styles.push(`background-color:${node.backgroundColor}`);
  if (styles.length > 0) {
    attrs.push(`style="${escapeHtmlAttr(styles.join(';'))}"`);
  }

  const openTag = attrs.length > 0 ? `<${node.tag} ${attrs.join(' ')}>` : `<${node.tag}>`;
  const inner = node.children.map(serializeRichNode).join('');

  // Drop completely empty non-void spans with no attributes
  if (node.tag === 'span' && attrs.length === 0 && !inner) {
    return '';
  }

  return `${openTag}${inner}</${node.tag}>`;
}

export function sanitizeRichMessageHtml(rawHtml?: string | null): string {
  const nodes = parseSanitizedRichNodes(rawHtml);
  return nodes.map(serializeRichNode).join('').trim();
}

function collectPlainText(nodes: RichAstNode[], chunks: string[]): void {
  for (const node of nodes) {
    if (node.kind === 'text') {
      chunks.push(node.text);
      continue;
    }
    if (node.tag === 'br') {
      chunks.push('\n');
      continue;
    }
    if (node.tag === 'hr') {
      chunks.push('\n---\n');
      continue;
    }
    const isBlock = BLOCK_TAGS.has(node.tag);
    if (node.tag === 'li') {
      chunks.push('• ');
    }
    collectPlainText(node.children, chunks);
    if (isBlock) {
      chunks.push('\n');
    }
  }
}

export function extractPlainTextFromRichHtml(rawHtml?: string | null): string {
  const nodes = parseSanitizedRichNodes(rawHtml);
  const chunks: string[] = [];
  collectPlainText(nodes, chunks);
  return chunks
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
