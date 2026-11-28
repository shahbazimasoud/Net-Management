import React, { useMemo } from 'react';
import {
  parseSanitizedRichNodes,
  RichAstNode,
  RichTextAlign,
  RichTextDir,
  normalizeRichAlign,
  normalizeRichDirection,
} from '../../utils/richMessageSanitizer';

export interface SafeRichMessageContentProps {
  html: string;
  dir?: RichTextDir | string | null;
  align?: RichTextAlign | string | null;
  isLightMode?: boolean;
  className?: string;
}

function renderAstNode(
  node: RichAstNode,
  key: string,
  isLightMode: boolean
): React.ReactNode {
  if (node.kind === 'text') {
    return node.text;
  }

  const children = node.children.map((child, idx) =>
    renderAstNode(child, `${key}-${idx}`, isLightMode)
  );

  if (node.tag === 'br') {
    return <br key={key} />;
  }
  if (node.tag === 'hr') {
    return (
      <hr
        key={key}
        className={`my-2.5 border-0 border-t ${
          isLightMode ? 'border-slate-200' : 'border-white/15'
        }`}
      />
    );
  }

  const style: React.CSSProperties = {};
  if (node.align) style.textAlign = node.align;
  if (node.color) style.color = node.color;
  if (node.backgroundColor) style.backgroundColor = node.backgroundColor;

  const commonProps: {
    key: string;
    dir?: 'rtl' | 'ltr' | 'auto';
    style?: React.CSSProperties;
  } = {
    key,
    ...(node.dir ? { dir: node.dir } : {}),
    ...(Object.keys(style).length > 0 ? { style } : {}),
  };

  switch (node.tag) {
    case 'h2':
      return (
        <h2
          {...commonProps}
          className={`text-base sm:text-lg font-bold mt-2.5 mb-1.5 leading-snug ${
            isLightMode ? 'text-slate-900' : 'text-white'
          }`}
        >
          {children}
        </h2>
      );
    case 'h3':
      return (
        <h3
          {...commonProps}
          className={`text-sm sm:text-base font-bold mt-2 mb-1 leading-snug ${
            isLightMode ? 'text-slate-800' : 'text-slate-100'
          }`}
        >
          {children}
        </h3>
      );
    case 'p':
    case 'div':
      return (
        <p {...commonProps} className="my-1 leading-relaxed break-words">
          {children.length > 0 ? children : <br />}
        </p>
      );
    case 'ul':
      return (
        <ul {...commonProps} className="list-disc list-inside my-1.5 space-y-1 ps-2">
          {children}
        </ul>
      );
    case 'ol':
      return (
        <ol {...commonProps} className="list-decimal list-inside my-1.5 space-y-1 ps-2">
          {children}
        </ol>
      );
    case 'li':
      return (
        <li {...commonProps} className="leading-relaxed break-words">
          {children}
        </li>
      );
    case 'blockquote':
      return (
        <blockquote
          {...commonProps}
          className={`my-2 px-3 py-1.5 border-s-4 rounded-e-lg italic ${
            isLightMode
              ? 'border-indigo-400 bg-indigo-50/70 text-slate-700'
              : 'border-indigo-400 bg-indigo-500/10 text-slate-200'
          }`}
        >
          {children}
        </blockquote>
      );
    case 'pre':
      return (
        <pre
          key={key}
          dir="ltr"
          style={Object.keys(style).length > 0 ? style : undefined}
          className={`my-2 p-3 rounded-lg border font-mono text-[11px] sm:text-xs overflow-x-auto leading-relaxed ${
            isLightMode
              ? 'bg-slate-900 border-slate-700 text-slate-100'
              : 'bg-black/60 border-white/10 text-cyan-200'
          }`}
        >
          {children}
        </pre>
      );
    case 'code':
      return (
        <code
          {...commonProps}
          dir="ltr"
          className={`px-1.5 py-0.5 rounded font-mono text-[0.9em] ${
            isLightMode
              ? 'bg-slate-200/80 text-indigo-800'
              : 'bg-white/10 text-cyan-300'
          }`}
        >
          {children}
        </code>
      );
    case 'a':
      return (
        <a
          {...commonProps}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 font-medium break-all transition hover:opacity-80 ${
            isLightMode ? 'text-indigo-600' : 'text-cyan-400'
          }`}
        >
          {children}
        </a>
      );
    case 'strong':
      return (
        <strong {...commonProps} className="font-bold">
          {children}
        </strong>
      );
    case 'em':
      return (
        <em {...commonProps} className="italic">
          {children}
        </em>
      );
    case 'u':
      return (
        <u {...commonProps} className="underline underline-offset-2">
          {children}
        </u>
      );
    case 's':
      return (
        <s {...commonProps} className="line-through opacity-80">
          {children}
        </s>
      );
    case 'sub':
      return <sub {...commonProps}>{children}</sub>;
    case 'sup':
      return <sup {...commonProps}>{children}</sup>;
    case 'span':
    default:
      return (
        <span
          {...commonProps}
          className={node.backgroundColor ? 'px-1 py-0.5 rounded' : undefined}
        >
          {children}
        </span>
      );
  }
}

export const SafeRichMessageContent: React.FC<SafeRichMessageContentProps> = ({
  html,
  dir,
  align,
  isLightMode = false,
  className = '',
}) => {
  const nodes = useMemo(() => parseSanitizedRichNodes(html), [html]);
  const resolvedDir = normalizeRichDirection(dir, 'auto');
  const resolvedAlign = normalizeRichAlign(align, 'auto');

  const alignClass =
    resolvedAlign === 'right'
      ? 'text-right'
      : resolvedAlign === 'left'
      ? 'text-left'
      : resolvedAlign === 'center'
      ? 'text-center'
      : resolvedAlign === 'justify'
      ? 'text-justify'
      : resolvedDir === 'rtl'
      ? 'text-right'
      : resolvedDir === 'ltr'
      ? 'text-left'
      : '';

  return (
    <div
      dir={resolvedDir}
      className={`text-xs sm:text-sm leading-relaxed break-words ${alignClass} ${className}`}
    >
      {nodes.map((node, idx) => renderAstNode(node, `rich-${idx}`, isLightMode))}
    </div>
  );
};
