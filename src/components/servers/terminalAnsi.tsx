import React from 'react';

/**
 * ANSI Color and Style Map for Terminal Emulation
 */
interface AnsiStyle {
  color?: string;
  bgColor?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const FG_COLOR_MAP: Record<number, string> = {
  30: 'text-slate-900 dark:text-slate-950', // Black
  31: 'text-rose-400', // Red
  32: 'text-emerald-400', // Green
  33: 'text-amber-400', // Yellow / Amber
  34: 'text-sky-400', // Blue
  35: 'text-purple-400', // Magenta
  36: 'text-cyan-400', // Cyan
  37: 'text-slate-100', // White
  90: 'text-slate-400', // Bright Black / Gray
  91: 'text-rose-300', // Bright Red
  92: 'text-emerald-300', // Bright Green
  93: 'text-yellow-300', // Bright Yellow
  94: 'text-sky-300', // Bright Blue
  95: 'text-fuchsia-300', // Bright Magenta
  96: 'text-cyan-300', // Bright Cyan
  97: 'text-white', // Bright White
};

const BG_COLOR_MAP: Record<number, string> = {
  40: 'bg-black/80 px-1 rounded',
  41: 'bg-rose-950/80 px-1 rounded',
  42: 'bg-emerald-950/80 px-1 rounded',
  43: 'bg-amber-950/80 px-1 rounded',
  44: 'bg-sky-950/80 px-1 rounded',
  45: 'bg-purple-950/80 px-1 rounded',
  46: 'bg-cyan-950/80 px-1 rounded',
  47: 'bg-slate-200 text-slate-900 px-1 rounded',
  100: 'bg-slate-800 px-1 rounded',
};

/**
 * Strips all ANSI escape codes, VT100 control sequences, and stray raw leaked codes
 */
export function stripAnsi(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\r\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Standard ANSI escape sequences
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    // OSC titles and strings: ESC ] ... (BEL | ESC \)
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    // Stray unescaped color codes like [33m, [0m, [90m
    .replace(/(?:^|\s)\[([0-9]{1,3}(?:;[0-9]{1,3})*)m/g, ' ')
    // Stray bracketed paste markers like [?2004h, [?2004l
    .replace(/\[\?[0-9;]*[a-zA-Z]/g, '')
    // Stray line clear markers like [2K, [1A, [H
    .replace(/\[[0-9;]*[A-Za-z]/g, '')
    // Stray garbled artifacts like 0[33m or @[0m
    .replace(/[0-9@]\[[0-9;]*m/g, '');
}

/**
 * Sanitizes and parses text containing ANSI escape codes into styled React spans.
 * Also catches unescaped stray codes like `[33m[SSH Notice][0m` and formats them cleanly!
 */
export function renderAnsiFormattedText(rawText: string, keyPrefix: string = 'ansi'): React.ReactNode {
  if (!rawText) return null;

  // Normalize line endings
  let normalized = rawText
    .replace(/\r\r\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Strip non-color VT100 control sequences (cursor position, clear screen, OSC, bracketed paste)
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[\?[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1B\[[0-9;]*[A-LN-Za-ln-z]/g, '') // Keep 'm' which is SGR color
    .replace(/\[\?[0-9;]*[a-zA-Z]/g, ''); // Unescaped bracketed paste

  // If there are leaked raw unescaped codes like `[33m`, prepend \x1b so the parser handles them uniformly
  normalized = normalized
    .replace(/(^|[^\x1B])(\[([0-9]{1,3}(?:;[0-9]{1,3})*)m)/g, '$1\x1b$2')
    // Clean weird corruptions like 0\x1b[33m or @\x1b[0m
    .replace(/[0-9@]\x1b\[/g, '\x1b[');

  // Regex to split by SGR sequence: \x1b[...m
  const sgrRegex = /\x1B\[([0-9;]*)m/g;
  const parts: { text: string; style: AnsiStyle }[] = [];

  let lastIndex = 0;
  let currentStyle: AnsiStyle = {};
  let match: RegExpExecArray | null;

  while ((match = sgrRegex.exec(normalized)) !== null) {
    const textChunk = normalized.substring(lastIndex, match.index);
    if (textChunk) {
      parts.push({ text: textChunk, style: { ...currentStyle } });
    }

    const codeStr = match[1] || '0';
    const codes = codeStr.split(';').map((c) => parseInt(c, 10) || 0);

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) {
        // Reset
        currentStyle = {};
      } else if (code === 1) {
        currentStyle.bold = true;
      } else if (code === 2) {
        currentStyle.dim = true;
      } else if (code === 3) {
        currentStyle.italic = true;
      } else if (code === 4) {
        currentStyle.underline = true;
      } else if (code === 22) {
        currentStyle.bold = false;
        currentStyle.dim = false;
      } else if (code === 23) {
        currentStyle.italic = false;
      } else if (code === 24) {
        currentStyle.underline = false;
      } else if (code >= 30 && code <= 37) {
        currentStyle.color = FG_COLOR_MAP[code];
      } else if (code === 39) {
        delete currentStyle.color;
      } else if (code >= 40 && code <= 47) {
        currentStyle.bgColor = BG_COLOR_MAP[code];
      } else if (code === 49) {
        delete currentStyle.bgColor;
      } else if (code >= 90 && code <= 97) {
        currentStyle.color = FG_COLOR_MAP[code];
      } else if (code >= 100 && code <= 107) {
        currentStyle.bgColor = BG_COLOR_MAP[code];
      } else if (code === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        // 256-color foreground
        const color256 = codes[i + 2];
        i += 2;
        currentStyle.color = get256ColorClass(color256);
      }
    }

    lastIndex = sgrRegex.lastIndex;
  }

  // Trailing text
  const trailing = normalized.substring(lastIndex);
  if (trailing) {
    parts.push({ text: trailing, style: { ...currentStyle } });
  }

  // If no parts were found, return the plain string
  if (parts.length === 0) {
    return <span key={`${keyPrefix}-plain`}>{stripAnsi(rawText)}</span>;
  }

  return (
    <>
      {parts.map((p, idx) => {
        const classes: string[] = [];
        if (p.style.color) classes.push(p.style.color);
        else classes.push('text-slate-200');
        if (p.style.bgColor) classes.push(p.style.bgColor);
        if (p.style.bold) classes.push('font-bold');
        if (p.style.dim) classes.push('opacity-60');
        if (p.style.italic) classes.push('italic');
        if (p.style.underline) classes.push('underline');

        return (
          <span key={`${keyPrefix}-${idx}`} className={classes.join(' ')}>
            {p.text}
          </span>
        );
      })}
    </>
  );
}

function get256ColorClass(code: number): string {
  if (code >= 0 && code <= 7) {
    return FG_COLOR_MAP[30 + code] || 'text-slate-200';
  }
  if (code >= 8 && code <= 15) {
    return FG_COLOR_MAP[90 + (code - 8)] || 'text-slate-200';
  }
  if (code === 208 || code === 214) return 'text-amber-400 font-semibold';
  if (code === 196 || code === 160) return 'text-rose-400';
  if (code === 46 || code === 82) return 'text-emerald-400';
  if (code === 33 || code === 39) return 'text-sky-400';
  if (code === 226) return 'text-yellow-300';
  if (code >= 232 && code <= 255) return 'text-slate-400';
  return 'text-slate-200';
}
