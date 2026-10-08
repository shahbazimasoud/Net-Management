import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal, ITerminalOptions, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface XtermTerminalHandle {
  write: (data: string | Uint8Array) => void;
  writeln: (data: string) => void;
  clear: () => void;
  fit: () => void;
  focus: () => void;
  getTerminal: () => Terminal | null;
  getFitAddon: () => FitAddon | null;
}

export interface XtermTerminalProps {
  /** Optional callback invoked whenever data/keystrokes are entered into the terminal */
  onData?: (data: string) => void;
  /** Optional callback invoked when the terminal is resized (cols, rows) */
  onResize?: (cols: number, rows: number) => void;
  /** Optional external write function or ref passed by parent */
  onWriteRef?: (writeFn: (data: string | Uint8Array) => void) => void;
  /** Additional CSS class names for the terminal container */
  className?: string;
  /** Inline style overrides for the terminal container */
  style?: React.CSSProperties;
  /** Theme overrides to merge with dark theme colors */
  theme?: ITheme;
  /** Font size in pixels (default: 13) */
  fontSize?: number;
  /** Monospace font family override */
  fontFamily?: string;
  /** Whether the terminal should auto-focus upon mounting (default: true) */
  autoFocus?: boolean;
}

const DEFAULT_DARK_THEME: ITheme = {
  background: '#020617', // slate-950
  foreground: '#f1f5f9', // slate-100
  cursor: '#38bdf8', // sky-400
  cursorAccent: '#020617',
  selectionBackground: 'rgba(56, 189, 248, 0.3)',
  black: '#0f172a',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#f1f5f9',
  brightBlack: '#64748b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#fde047',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
};

export const XtermTerminal = forwardRef<XtermTerminalHandle, XtermTerminalProps>(
  (
    {
      onData,
      onResize,
      onWriteRef,
      className = '',
      style,
      theme,
      fontSize = 13,
      fontFamily = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
      autoFocus = true,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    // Keep callback refs up to date without triggering re-runs or duplicate listeners
    const onDataRef = useRef(onData);
    onDataRef.current = onData;

    const onResizeRef = useRef(onResize);
    onResizeRef.current = onResize;

    // Expose imperative handle methods to parent components via ref
    useImperativeHandle(
      ref,
      () => ({
        write: (data: string | Uint8Array) => {
          terminalRef.current?.write(data);
        },
        writeln: (data: string) => {
          terminalRef.current?.writeln(data);
        },
        clear: () => {
          terminalRef.current?.clear();
        },
        fit: () => {
          try {
            fitAddonRef.current?.fit();
          } catch {}
        },
        focus: () => {
          terminalRef.current?.focus();
        },
        getTerminal: () => terminalRef.current,
        getFitAddon: () => fitAddonRef.current,
      }),
      []
    );

    // Provide write function callback if parent specified onWriteRef prop
    useEffect(() => {
      if (onWriteRef) {
        onWriteRef((data: string | Uint8Array) => {
          terminalRef.current?.write(data);
        });
      }
    }, [onWriteRef]);

    useEffect(() => {
      if (!containerRef.current) return;

      // 1. Create ONE Terminal instance with specified properties
      const termOptions: ITerminalOptions = {
        cursorBlink: true,
        scrollback: 10000,
        fontFamily,
        fontSize,
        convertEol: false,
        theme: {
          ...DEFAULT_DARK_THEME,
          ...theme,
        },
        allowTransparency: false,
      };

      const term = new Terminal(termOptions);
      terminalRef.current = term;

      // 2. Load FitAddon
      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;
      term.loadAddon(fitAddon);

      // 3. Open terminal in container DOM node
      term.open(containerRef.current);

      // Initial fit & focus
      try {
        fitAddon.fit();
        if (term.cols && term.rows) {
          onResizeRef.current?.(term.cols, term.rows);
        }
      } catch {}

      if (autoFocus) {
        setTimeout(() => {
          term.focus();
        }, 50);
      }

      // 4. Attach input listener (no duplicate listeners on re-render)
      const dataDisposable = term.onData((data) => {
        onDataRef.current?.(data);
      });

      // 5. Attach resize listener
      const resizeDisposable = term.onResize(({ cols, rows }) => {
        onResizeRef.current?.(cols, rows);
      });

      // 6. Handle container dimension changes via ResizeObserver & window resize
      const handleResize = () => {
        if (!containerRef.current || !fitAddonRef.current || !terminalRef.current) return;
        try {
          fitAddonRef.current.fit();
          const currentCols = terminalRef.current.cols;
          const currentRows = terminalRef.current.rows;
          if (currentCols && currentRows) {
            onResizeRef.current?.(currentCols, currentRows);
          }
        } catch {}
      };

      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(handleResize);
        });
        resizeObserver.observe(containerRef.current);
      }

      window.addEventListener('resize', handleResize);

      // 7. Cleanup and dispose on unmount
      return () => {
        window.removeEventListener('resize', handleResize);
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        dataDisposable.dispose();
        resizeDisposable.dispose();

        try {
          fitAddon.dispose();
        } catch {}

        try {
          term.dispose();
        } catch {}

        terminalRef.current = null;
        fitAddonRef.current = null;
      };
    }, []); // Empty dependency array: exactly ONE Terminal instance per mount

    return (
      <div
        ref={containerRef}
        className={`xterm-terminal-container w-full h-full overflow-hidden select-text ${className}`}
        style={{
          backgroundColor: theme?.background || DEFAULT_DARK_THEME.background,
          ...style,
        }}
      />
    );
  }
);

XtermTerminal.displayName = 'XtermTerminal';
export default XtermTerminal;
