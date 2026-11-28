import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Palette,
  Quote,
  Redo2,
  RemoveFormatting,
  Smile,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
  Check,
  X,
} from 'lucide-react';
import {
  RichAstNode,
  RichTextAlign,
  RichTextDir,
  extractPlainTextFromRichHtml,
  normalizeSafeLinkUrl,
  parseSanitizedRichNodes,
  sanitizeRichMessageHtml,
} from '../../utils/richMessageSanitizer';

export interface RichMessageEditorProps {
  valueHtml: string;
  bodyDir: RichTextDir;
  bodyAlign: RichTextAlign;
  onChange: (next: { html: string; plainText: string }) => void;
  onBodyDirChange: (dir: RichTextDir) => void;
  onBodyAlignChange: (align: RichTextAlign) => void;
  placeholder?: string;
  isEn: boolean;
  isLightMode: boolean;
  minHeightClass?: string;
}

const TEXT_COLORS = [
  { labelEn: 'Red', labelFa: 'قرمز', value: '#ef4444' },
  { labelEn: 'Orange', labelFa: 'نارنجی', value: '#f97316' },
  { labelEn: 'Amber', labelFa: 'زرد تیره', value: '#f59e0b' },
  { labelEn: 'Emerald', labelFa: 'سبز', value: '#10b981' },
  { labelEn: 'Cyan', labelFa: 'فیروزه‌ای', value: '#06b6d4' },
  { labelEn: 'Blue', labelFa: 'آبی', value: '#3b82f6' },
  { labelEn: 'Indigo', labelFa: 'نیلی', value: '#6366f1' },
  { labelEn: 'Purple', labelFa: 'بنفش', value: '#a855f7' },
  { labelEn: 'Pink', labelFa: 'صورتی', value: '#ec4899' },
  { labelEn: 'Slate', labelFa: 'خاکستری', value: '#64748b' },
  { labelEn: 'White', labelFa: 'سفید', value: '#ffffff' },
  { labelEn: 'Black', labelFa: 'مشکی', value: '#0f172a' },
];

const HIGHLIGHT_COLORS = [
  { labelEn: 'Yellow', labelFa: 'زرد', value: '#fef08a' },
  { labelEn: 'Amber', labelFa: 'نارنجی ملایم', value: '#fed7aa' },
  { labelEn: 'Rose', labelFa: 'قرمز ملایم', value: '#fecdd3' },
  { labelEn: 'Mint', labelFa: 'سبز ملایم', value: '#bbf7d0' },
  { labelEn: 'Sky', labelFa: 'آبی ملایم', value: '#bae6fd' },
  { labelEn: 'Lavender', labelFa: 'بنفش ملایم', value: '#ddd6fe' },
  { labelEn: 'Dark Amber', labelFa: 'کهربایی تیره', value: '#78350f' },
  { labelEn: 'Dark Indigo', labelFa: 'نیلی تیره', value: '#312e81' },
];

export const EMOJI_CATEGORIES = [
  {
    id: 'smileys',
    labelEn: 'Smileys',
    labelFa: 'لبخند و واکنش',
    emojis: [
      '😀', '😃', '😄', '😊', '🙂', '😉', '😍', '😎',
      '🤔', '😐', '😮', '😅', '😂', '🙏', '👏', '👍',
      '👎', '👌', '🤝', '💪', '🎉', '🙌', '❤️', '⭐',
    ],
  },
  {
    id: 'ops',
    labelEn: 'IT & Alerts',
    labelFa: 'عملیاتی و هشدار',
    emojis: [
      '✅', '✔️', '❌', '⛔', '⚠️', '🚨', '🔔', '📢',
      '📌', '📍', '🔒', '🔓', '🔑', '🛡️', '🔧', '🛠️',
      '⚙️', '🖥️', '💻', '🌐', '📡', '🔌', '🚀', '⚡',
      '🔥', '💡', '📊', '📋', '📁', '🕒', '📅', '✉️',
    ],
  },
];

function appendAstNodesToDomElement(nodes: RichAstNode[], container: HTMLElement): void {
  const doc = container.ownerDocument;
  for (const node of nodes) {
    if (node.kind === 'text') {
      container.appendChild(doc.createTextNode(node.text));
      continue;
    }
    const el = doc.createElement(node.tag);
    if (node.dir) el.setAttribute('dir', node.dir);
    if (node.align) el.style.textAlign = node.align;
    if (node.color) el.style.color = node.color;
    if (node.backgroundColor) el.style.backgroundColor = node.backgroundColor;
    if (node.tag === 'a' && node.href) {
      el.setAttribute('href', node.href);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
    appendAstNodesToDomElement(node.children, el);
    container.appendChild(el);
  }
}

export const RichMessageEditor: React.FC<RichMessageEditorProps> = ({
  valueHtml,
  bodyDir,
  bodyAlign,
  onChange,
  onBodyDirChange,
  onBodyAlignChange,
  placeholder,
  isEn,
  isLightMode,
  minHeightClass = 'min-h-[170px]',
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const toolbarContainerRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedHtmlRef = useRef<string>('');
  const savedRangeRef = useRef<Range | null>(null);

  const [isEmpty, setIsEmpty] = useState<boolean>(() => !extractPlainTextFromRichHtml(valueHtml));
  const [activePopover, setActivePopover] = useState<'color' | 'highlight' | 'link' | 'emoji' | null>(null);
  const [emojiTab, setEmojiTab] = useState<'smileys' | 'ops'>('smileys');
  const [customColor, setCustomColor] = useState<string>('#6366f1');

  const [linkText, setLinkText] = useState<string>('');
  const [linkUrl, setLinkUrl] = useState<string>('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const [fmtState, setFmtState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    ul: false,
    ol: false,
    align: '' as '' | 'left' | 'right' | 'center' | 'justify',
    dir: '' as '' | 'rtl' | 'ltr',
    inLink: false,
  });

  // Sync external valueHtml resets/restores cleanly using sanitized AST DOM nodes (no raw innerHTML injection)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const sanitizedIncoming = sanitizeRichMessageHtml(valueHtml);
    if (sanitizedIncoming === lastEmittedHtmlRef.current) {
      return;
    }
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
    if (sanitizedIncoming) {
      const nodes = parseSanitizedRichNodes(sanitizedIncoming);
      appendAstNodesToDomElement(nodes, el);
    }
    lastEmittedHtmlRef.current = sanitizedIncoming;
    setIsEmpty(!extractPlainTextFromRichHtml(sanitizedIncoming));
  }, [valueHtml]);

  // Close popovers on outside click
  useEffect(() => {
    if (!activePopover) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        toolbarContainerRef.current &&
        !toolbarContainerRef.current.contains(e.target as Node)
      ) {
        setActivePopover(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [activePopover]);

  const saveSelection = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (el.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (savedRangeRef.current && el.contains(savedRangeRef.current.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    } else if (sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  const findNearestBlock = useCallback((node: Node | null): HTMLElement | null => {
    const root = editorRef.current;
    if (!root || !node) return null;
    let cur: Node | null = node;
    const blockTags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE', 'PRE']);
    while (cur && cur !== root) {
      if (cur instanceof HTMLElement && blockTags.has(cur.tagName)) {
        return cur;
      }
      cur = cur.parentNode;
    }
    return null;
  }, []);

  const refreshFormatState = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    const inside = Boolean(sel && sel.anchorNode && el.contains(sel.anchorNode));
    if (!inside) return;

    try {
      const bold = document.queryCommandState('bold');
      const italic = document.queryCommandState('italic');
      const underline = document.queryCommandState('underline');
      const strike = document.queryCommandState('strikeThrough');
      const ul = document.queryCommandState('insertUnorderedList');
      const ol = document.queryCommandState('insertOrderedList');

      let align: '' | 'left' | 'right' | 'center' | 'justify' = '';
      if (document.queryCommandState('justifyRight')) align = 'right';
      else if (document.queryCommandState('justifyCenter')) align = 'center';
      else if (document.queryCommandState('justifyLeft')) align = 'left';
      else if (document.queryCommandState('justifyFull')) align = 'justify';

      const block = findNearestBlock(sel?.anchorNode || null);
      const blockDir = (block?.getAttribute('dir') || '').toLowerCase();
      const dir: '' | 'rtl' | 'ltr' =
        blockDir === 'rtl' || blockDir === 'ltr' ? (blockDir as 'rtl' | 'ltr') : '';

      let curNode: Node | null = sel?.anchorNode || null;
      let inLink = false;
      while (curNode && curNode !== el) {
        if (curNode instanceof HTMLAnchorElement) {
          inLink = true;
          break;
        }
        curNode = curNode.parentNode;
      }

      setFmtState({ bold, italic, underline, strike, ul, ol, align, dir, inLink });
    } catch {
      // ignore queryCommandState edge cases
    }
  }, [findNearestBlock]);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const sanitized = sanitizeRichMessageHtml(el.innerHTML);
    const plain = extractPlainTextFromRichHtml(sanitized);
    lastEmittedHtmlRef.current = sanitized;
    setIsEmpty(!plain);
    onChange({ html: sanitized, plainText: plain });
    refreshFormatState();
  }, [onChange, refreshFormatState]);

  const execEditorCommand = (command: string, value?: string) => {
    restoreSelection();
    try {
      if (command === 'foreColor' || command === 'hiliteColor') {
        document.execCommand('styleWithCSS', false, 'true');
      }
      document.execCommand(command, false, value);
    } catch {
      // fallback silently
    }
    emitChange();
    saveSelection();
  };

  const applyParagraphDirection = (targetDir: 'rtl' | 'ltr') => {
    restoreSelection();
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    const plainText = (el.innerText || '').trim();

    // Update base editor direction if empty, single block, or whole editor selected
    const topBlocks = Array.from(el.children).filter(
      (c) => c instanceof HTMLElement && ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'BLOCKQUOTE', 'PRE'].includes(c.tagName)
    );
    const selectedStr = (sel?.toString() || '').trim();
    const shouldUpdateBase =
      !plainText || topBlocks.length <= 1 || (selectedStr.length > 0 && selectedStr === plainText);

    if (shouldUpdateBase) {
      onBodyDirChange(targetDir);
      if (bodyAlign === 'left' && targetDir === 'rtl') {
        onBodyAlignChange('right');
      } else if (bodyAlign === 'right' && targetDir === 'ltr') {
        onBodyAlignChange('left');
      }
    }

    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const startBlock = findNearestBlock(range.startContainer);
      const endBlock = findNearestBlock(range.endContainer);

      if (startBlock && endBlock) {
        const blocksToUpdate = new Set<HTMLElement>([startBlock, endBlock]);
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
        let cur = walker.nextNode();
        let inRange = false;
        while (cur) {
          if (cur === startBlock) inRange = true;
          if (
            inRange &&
            cur instanceof HTMLElement &&
            ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE', 'PRE'].includes(cur.tagName)
          ) {
            blocksToUpdate.add(cur);
          }
          if (cur === endBlock) break;
          cur = walker.nextNode();
        }
        blocksToUpdate.forEach((b) => {
          b.setAttribute('dir', targetDir);
          if (!b.style.textAlign || b.style.textAlign === 'left' || b.style.textAlign === 'right') {
            b.style.textAlign = targetDir === 'rtl' ? 'right' : 'left';
          }
        });
      } else if (plainText) {
        // Wrap root text/inline content into a directed block so per-line RTL/LTR persists in HTML
        document.execCommand('formatBlock', false, 'P');
        const selAfter = window.getSelection();
        const blockAfter = findNearestBlock(selAfter?.anchorNode || null);
        if (blockAfter) {
          blockAfter.setAttribute('dir', targetDir);
          blockAfter.style.textAlign = targetDir === 'rtl' ? 'right' : 'left';
        }
      }
    }

    emitChange();
    saveSelection();
  };

  const applyAlignment = (align: 'right' | 'center' | 'left' | 'justify') => {
    const cmdMap = {
      right: 'justifyRight',
      center: 'justifyCenter',
      left: 'justifyLeft',
      justify: 'justifyFull',
    } as const;
    const el = editorRef.current;
    if (el && !(el.innerText || '').trim()) {
      onBodyAlignChange(align);
    }
    execEditorCommand(cmdMap[align]);
  };

  const toggleInlineCode = () => {
    restoreSelection();
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;

    // If already inside <code>, unwrap it
    let cur: Node | null = sel.anchorNode;
    while (cur && cur !== el) {
      if (cur instanceof HTMLElement && cur.tagName === 'CODE') {
        const parent = cur.parentNode;
        if (parent) {
          while (cur.firstChild) parent.insertBefore(cur.firstChild, cur);
          parent.removeChild(cur);
          emitChange();
          saveSelection();
        }
        return;
      }
      cur = cur.parentNode;
    }

    const selectedText = range.toString();
    const codeEl = document.createElement('code');
    codeEl.textContent = selectedText || (isEn ? 'code' : 'کد');
    range.deleteContents();
    range.insertNode(codeEl);

    const afterRange = document.createRange();
    afterRange.setStartAfter(codeEl);
    afterRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(afterRange);
    emitChange();
    saveSelection();
  };

  const insertEmojiAtCursor = (emoji: string) => {
    restoreSelection();
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    const textNode = document.createTextNode(emoji);
    range.insertNode(textNode);
    const nextRange = document.createRange();
    nextRange.setStartAfter(textNode);
    nextRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nextRange);
    emitChange();
    saveSelection();
  };

  const openLinkPopover = () => {
    saveSelection();
    const sel = window.getSelection();
    const selectedText = sel ? sel.toString().trim() : '';
    let existingHref = '';
    if (sel && sel.anchorNode && editorRef.current) {
      let cur: Node | null = sel.anchorNode;
      while (cur && cur !== editorRef.current) {
        if (cur instanceof HTMLAnchorElement) {
          existingHref = cur.getAttribute('href') || '';
          break;
        }
        cur = cur.parentNode;
      }
    }
    setLinkText(selectedText);
    setLinkUrl(existingHref || 'https://');
    setLinkError(null);
    setActivePopover((prev) => (prev === 'link' ? null : 'link'));
  };

  const handleInsertLink = () => {
    const safeUrl = normalizeSafeLinkUrl(linkUrl);
    if (!safeUrl) {
      setLinkError(
        isEn
          ? 'Enter a valid http://, https://, or mailto: URL.'
          : 'یک آدرس معتبر با شروع https:// یا http:// یا mailto: وارد کنید.'
      );
      return;
    }

    restoreSelection();
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;

    const label = linkText.trim() || safeUrl;
    const anchor = document.createElement('a');
    anchor.setAttribute('href', safeUrl);
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
    anchor.textContent = label;

    range.deleteContents();
    range.insertNode(anchor);

    // Insert trailing space and position cursor after link
    const space = document.createTextNode(' ');
    anchor.after(space);
    const nextRange = document.createRange();
    nextRange.setStartAfter(space);
    nextRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nextRange);

    setActivePopover(null);
    setLinkError(null);
    emitChange();
    saveSelection();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const htmlData = e.clipboardData.getData('text/html');
    const plainData = e.clipboardData.getData('text/plain');
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();

    if (htmlData && htmlData.trim()) {
      const cleanHtml = sanitizeRichMessageHtml(htmlData);
      const astNodes = parseSanitizedRichNodes(cleanHtml);
      const frag = document.createDocumentFragment();
      const tempHolder = document.createElement('div');
      appendAstNodesToDomElement(astNodes, tempHolder);
      while (tempHolder.firstChild) {
        frag.appendChild(tempHolder.firstChild);
      }
      const lastInserted = frag.lastChild;
      range.insertNode(frag);
      if (lastInserted) {
        const nextRange = document.createRange();
        nextRange.setStartAfter(lastInserted);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
      }
    } else if (plainData) {
      const lines = plainData.replace(/\r\n/g, '\n').split('\n');
      const frag = document.createDocumentFragment();
      let lastNode: Node | null = null;
      lines.forEach((line, idx) => {
        if (idx > 0) {
          const br = document.createElement('br');
          frag.appendChild(br);
          lastNode = br;
        }
        if (line) {
          const tn = document.createTextNode(line);
          frag.appendChild(tn);
          lastNode = tn;
        }
      });
      range.insertNode(frag);
      if (lastNode) {
        const nextRange = document.createRange();
        nextRange.setStartAfter(lastNode);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
      }
    }

    emitChange();
    saveSelection();
  };

  const toolBtnClass = (active = false) =>
    `inline-flex items-center justify-center h-7 min-w-[28px] px-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
      active
        ? isLightMode
          ? 'bg-indigo-600 text-white shadow-xs'
          : 'bg-indigo-500 text-white shadow-xs'
        : isLightMode
        ? 'text-slate-700 hover:bg-slate-200/80'
        : 'text-slate-300 hover:bg-white/10 hover:text-white'
    }`;

  const dividerClass = `w-px h-4 mx-0.5 shrink-0 ${
    isLightMode ? 'bg-slate-300' : 'bg-white/15'
  }`;

  const effectiveDir: 'rtl' | 'ltr' | 'auto' =
    bodyDir === 'rtl' || bodyDir === 'ltr' ? bodyDir : 'auto';
  const editorAlignClass =
    bodyAlign === 'right'
      ? 'text-right'
      : bodyAlign === 'left'
      ? 'text-left'
      : bodyAlign === 'center'
      ? 'text-center'
      : bodyAlign === 'justify'
      ? 'text-justify'
      : effectiveDir === 'rtl'
      ? 'text-right'
      : effectiveDir === 'ltr'
      ? 'text-left'
      : '';

  return (
    <div
      ref={toolbarContainerRef}
      className={`rounded-xl border overflow-visible relative ${
        isLightMode
          ? 'bg-white border-slate-300'
          : 'bg-slate-950 border-slate-700'
      }`}
    >
      {/* Formatting Toolbar */}
      <div
        className={`flex flex-wrap items-center gap-1 px-2 py-1.5 border-b rounded-t-xl ${
          isLightMode
            ? 'bg-slate-50 border-slate-200'
            : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        {/* Direction Controls: RTL & LTR */}
        <div
          className={`flex items-center gap-0.5 p-0.5 rounded-lg border ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-950/70 border-white/10'
          }`}
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyParagraphDirection('rtl')}
            title={
              isEn
                ? 'Right-to-Left (RTL) — sets active paragraph or message to RTL'
                : 'راست‌به‌چپ (RTL) — تنظیم پاراگراف جاری یا کل پیام به راست‌به‌چپ'
            }
            className={`px-2 h-6 rounded text-[11px] font-bold transition cursor-pointer ${
              fmtState.dir === 'rtl' || (!fmtState.dir && bodyDir === 'rtl')
                ? 'bg-indigo-600 text-white'
                : isLightMode
                ? 'text-slate-700 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            RTL
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyParagraphDirection('ltr')}
            title={
              isEn
                ? 'Left-to-Right (LTR) — sets active paragraph or message to LTR'
                : 'چپ‌به‌چپ (LTR) — تنظیم پاراگراف جاری یا کل پیام به چپ‌به‌چپ'
            }
            className={`px-2 h-6 rounded text-[11px] font-bold transition cursor-pointer ${
              fmtState.dir === 'ltr' || (!fmtState.dir && bodyDir === 'ltr')
                ? 'bg-indigo-600 text-white'
                : isLightMode
                ? 'text-slate-700 hover:bg-slate-100'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            LTR
          </button>
        </div>

        <span className={dividerClass} />

        {/* Alignment Controls */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyAlignment('right')}
          title={isEn ? 'Align Right' : 'راست‌چین'}
          className={toolBtnClass(fmtState.align === 'right')}
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyAlignment('center')}
          title={isEn ? 'Align Center' : 'وسط‌چین'}
          className={toolBtnClass(fmtState.align === 'center')}
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyAlignment('left')}
          title={isEn ? 'Align Left' : 'چپ‌چین'}
          className={toolBtnClass(fmtState.align === 'left')}
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyAlignment('justify')}
          title={isEn ? 'Justify' : 'تراز کامل'}
          className={toolBtnClass(fmtState.align === 'justify')}
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </button>

        <span className={dividerClass} />

        {/* Block Format Selector */}
        <select
          aria-label={isEn ? 'Block Style' : 'سبک پاراگراف'}
          defaultValue="P"
          onMouseDown={saveSelection}
          onChange={(e) => {
            const tag = e.target.value;
            execEditorCommand('formatBlock', tag);
            e.target.value = 'P';
          }}
          className={`h-7 px-1.5 rounded-md border text-[11px] font-medium outline-none cursor-pointer ${
            isLightMode
              ? 'bg-white border-slate-300 text-slate-800'
              : 'bg-slate-950 border-white/15 text-slate-200'
          }`}
        >
          <option value="P">{isEn ? 'Paragraph' : 'متن عادی'}</option>
          <option value="H2">{isEn ? 'Heading (H2)' : 'تیتر بزرگ'}</option>
          <option value="H3">{isEn ? 'Subheading (H3)' : 'تیتر کوچک'}</option>
          <option value="BLOCKQUOTE">{isEn ? 'Quote Block' : 'نقل‌قول'}</option>
          <option value="PRE">{isEn ? 'Code Block' : 'بلوک کد'}</option>
        </select>

        <span className={dividerClass} />

        {/* Inline Typography */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execEditorCommand('bold')}
          title={isEn ? 'Bold (Ctrl+B)' : 'ضخیم / Bold (Ctrl+B)'}
          className={toolBtnClass(fmtState.bold)}
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execEditorCommand('italic')}
          title={isEn ? 'Italic (Ctrl+I)' : 'کج / Italic (Ctrl+I)'}
          className={toolBtnClass(fmtState.italic)}
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execEditorCommand('underline')}
          title={isEn ? 'Underline (Ctrl+U)' : 'زیرخط / Underline (Ctrl+U)'}
          className={toolBtnClass(fmtState.underline)}
        >
          <Underline className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execEditorCommand('strikeThrough')}
          title={isEn ? 'Strikethrough' : 'خط‌خورده'}
          className={toolBtnClass(fmtState.strike)}
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleInlineCode}
          title={isEn ? 'Inline Code' : 'کد خطی'}
          className={toolBtnClass(false)}
        >
          <Code className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execEditorCommand('formatBlock', 'BLOCKQUOTE')}
          title={isEn ? 'Quote' : 'نقل‌قول'}
          className={toolBtnClass(false)}
        >
          <Quote className="w-3.5 h-3.5" />
        </button>

        <span className={dividerClass} />

        {/* Lists */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execEditorCommand('insertUnorderedList')}
          title={isEn ? 'Bullet List' : 'فهرست نقطه‌ای'}
          className={toolBtnClass(fmtState.ul)}
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execEditorCommand('insertOrderedList')}
          title={isEn ? 'Numbered List' : 'فهرست شماره‌دار'}
          className={toolBtnClass(fmtState.ol)}
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>

        <span className={dividerClass} />

        {/* Text Color */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => setActivePopover((p) => (p === 'color' ? null : 'color'))}
          title={isEn ? 'Text Color' : 'رنگ متن'}
          className={toolBtnClass(activePopover === 'color')}
        >
          <Palette className="w-3.5 h-3.5" />
        </button>

        {/* Highlight Color */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => setActivePopover((p) => (p === 'highlight' ? null : 'highlight'))}
          title={isEn ? 'Highlight Color' : 'هایلایت / پس‌زمینه متن'}
          className={toolBtnClass(activePopover === 'highlight')}
        >
          <Highlighter className="w-3.5 h-3.5" />
        </button>

        {/* Link */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLinkPopover}
          title={isEn ? 'Insert Link' : 'افزودن لینک'}
          className={toolBtnClass(activePopover === 'link' || fmtState.inLink)}
        >
          <Link2 className="w-3.5 h-3.5" />
        </button>
        {fmtState.inLink && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execEditorCommand('unlink')}
            title={isEn ? 'Remove Link' : 'حذف لینک'}
            className={toolBtnClass(false)}
          >
            <Unlink className="w-3.5 h-3.5 text-rose-500" />
          </button>
        )}

        {/* Emoji / Smiley */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => setActivePopover((p) => (p === 'emoji' ? null : 'emoji'))}
          title={isEn ? 'Insert Smiley / Emoji' : 'افزودن ایموجی و اسمایل'}
          className={toolBtnClass(activePopover === 'emoji')}
        >
          <Smile className="w-3.5 h-3.5" />
        </button>

        <span className={dividerClass} />

        {/* Divider, Clear Format, Undo, Redo */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execEditorCommand('insertHorizontalRule')}
          title={isEn ? 'Insert Horizontal Divider' : 'درج خط جداکننده'}
          className={toolBtnClass(false)}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execEditorCommand('removeFormat')}
          title={isEn ? 'Clear Formatting' : 'پاک کردن فرمت متن'}
          className={toolBtnClass(false)}
        >
          <RemoveFormatting className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execEditorCommand('undo')}
          title={isEn ? 'Undo' : 'بازگشت (Undo)'}
          className={toolBtnClass(false)}
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execEditorCommand('redo')}
          title={isEn ? 'Redo' : 'انجام مجدد (Redo)'}
          className={toolBtnClass(false)}
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Popover: Text Color Picker */}
      {activePopover === 'color' && (
        <div
          className={`p-3 border-b flex flex-col gap-2.5 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span>{isEn ? 'Select Text Color' : 'انتخاب رنگ متن'}</span>
            <button
              type="button"
              onClick={() => {
                execEditorCommand('foreColor', isLightMode ? '#0f172a' : '#f1f5f9');
                setActivePopover(null);
              }}
              className="text-indigo-500 hover:underline cursor-pointer"
            >
              {isEn ? 'Reset Default' : 'بازگردانی رنگ پیش‌فرض'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  execEditorCommand('foreColor', c.value);
                  setActivePopover(null);
                }}
                title={isEn ? c.labelEn : c.labelFa}
                style={{ backgroundColor: c.value }}
                className={`w-6 h-6 rounded-md border cursor-pointer transition hover:scale-110 ${
                  isLightMode ? 'border-slate-300' : 'border-white/25'
                }`}
              />
            ))}
            <label
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700'
                  : 'bg-slate-950 border-white/15 text-slate-300'
              }`}
            >
              <input
                type="color"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  execEditorCommand('foreColor', e.target.value);
                }}
                className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
              />
              <span>{isEn ? 'Custom' : 'دلخواه'}</span>
            </label>
          </div>
        </div>
      )}

      {/* Popover: Highlight Color Picker */}
      {activePopover === 'highlight' && (
        <div
          className={`p-3 border-b flex flex-col gap-2 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span>{isEn ? 'Text Highlight Background' : 'رنگ هایلایت پس‌زمینه متن'}</span>
            <button
              type="button"
              onClick={() => {
                execEditorCommand('hiliteColor', 'transparent');
                setActivePopover(null);
              }}
              className="text-rose-500 hover:underline cursor-pointer"
            >
              {isEn ? 'Remove Highlight' : 'حذف هایلایت'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  execEditorCommand('hiliteColor', c.value);
                  setActivePopover(null);
                }}
                title={isEn ? c.labelEn : c.labelFa}
                style={{ backgroundColor: c.value }}
                className={`w-6 h-6 rounded-md border cursor-pointer transition hover:scale-110 ${
                  isLightMode ? 'border-slate-300' : 'border-white/25'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Popover: Safe Link Builder */}
      {activePopover === 'link' && (
        <div
          className={`p-3 border-b flex flex-col gap-2.5 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span>{isEn ? 'Insert Hyperlink' : 'افزودن لینک به متن'}</span>
            <button
              type="button"
              onClick={() => setActivePopover(null)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder={isEn ? 'Display text (optional)' : 'متن نمایشی لینک (اختیاری)'}
              className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-900'
                  : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
            <input
              type="text"
              dir="ltr"
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                if (linkError) setLinkError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleInsertLink();
                }
              }}
              placeholder="https://docs.example.com"
              className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none font-mono ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-900'
                  : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
          </div>
          {linkError && <p className="text-[11px] text-rose-500 font-medium">{linkError}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setActivePopover(null)}
              className={`px-2.5 py-1 rounded-md border text-[11px] cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700'
                  : 'bg-white/5 border-white/15 text-slate-300'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="button"
              onClick={handleInsertLink}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold cursor-pointer"
            >
              <Check className="w-3 h-3" />
              <span>{isEn ? 'Insert Link' : 'ثبت لینک'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Popover: Smiley & Operational Emoji Picker */}
      {activePopover === 'emoji' && (
        <div
          className={`p-3 border-b flex flex-col gap-2 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {EMOJI_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setEmojiTab(cat.id as 'smileys' | 'ops')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition ${
                    emojiTab === cat.id
                      ? 'bg-indigo-600 text-white'
                      : isLightMode
                      ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {isEn ? cat.labelEn : cat.labelFa}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setActivePopover(null)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-8 sm:grid-cols-12 gap-1">
            {(EMOJI_CATEGORIES.find((c) => c.id === emojiTab)?.emojis || []).map((emoji) => (
              <button
                key={emoji}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  insertEmojiAtCursor(emoji);
                  setActivePopover(null);
                }}
                className={`h-8 rounded-md text-base flex items-center justify-center cursor-pointer transition hover:scale-110 ${
                  isLightMode ? 'hover:bg-slate-200/80' : 'hover:bg-white/10'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editable Rich Text Canvas */}
      <div className="relative">
        {isEmpty && placeholder && (
          <div
            dir={effectiveDir}
            className={`pointer-events-none absolute inset-x-3 top-2.5 text-xs ${editorAlignClass} ${
              isLightMode ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          dir={effectiveDir}
          onInput={emitChange}
          onKeyUp={() => {
            saveSelection();
            refreshFormatState();
          }}
          onMouseUp={() => {
            saveSelection();
            refreshFormatState();
          }}
          onBlur={saveSelection}
          onPaste={handlePaste}
          className={`w-full px-3 py-2.5 text-xs sm:text-sm leading-relaxed outline-none overflow-y-auto custom-scrollbar max-h-72 ${minHeightClass} ${editorAlignClass} ${
            isLightMode ? 'text-slate-900' : 'text-slate-100'
          } [&_ul]:list-disc [&_ul]:list-inside [&_ul]:ps-2 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:ps-2 [&_blockquote]:border-s-4 [&_blockquote]:border-indigo-400 [&_blockquote]:ps-3 [&_blockquote]:py-1 [&_blockquote]:my-1.5 [&_blockquote]:italic [&_h2]:text-base [&_h2]:font-bold [&_h2]:my-1.5 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:my-1 [&_a]:text-indigo-500 [&_a]:underline [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-indigo-500/15 [&_code]:font-mono [&_pre]:p-2.5 [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:text-cyan-200 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:overflow-x-auto [&_hr]:my-2 [&_hr]:border-slate-300 dark:[&_hr]:border-white/15`}
        />
      </div>
    </div>
  );
};
