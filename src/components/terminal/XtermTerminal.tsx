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
  getCursorCoordinates: () => {
    cursorX: number;
    cursorY: number;
    cellWidth: number;
    cellHeight: number;
    isAlternate: boolean;
  } | null;
}

export interface XtermTerminalProps {
  /** Optional callback invoked whenever data/keystrokes are entered into the terminal */
  onData?: (data: string) => void;
  /** Optional callback invoked when the terminal is resized (cols, rows) */
  onResize?: (cols: number, rows: number) => void;
  /** Optional external write function or ref passed by parent */
  onWriteRef?: (writeFn: (data: string | Uint8Array) => void) => void;
  /** Optional custom key event handler to intercept keys before xterm handles them. Return false to consume the event. */
  customKeyEventHandler?: (event: KeyboardEvent) => boolean | undefined;
  /** Optional callback invoked when a paste action occurs */
  onPaste?: () => void;
  /** Optional callback invoked when the terminal cursor moves */
  onCursorMove?: (coords: { cursorX: number; cursorY: number }) => void;
  /** Optional callback invoked when the terminal buffer switches between normal and alternate (vi, nano, top) */
  onBufferTypeChange?: (type: 'normal' | 'alternate') => void;
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
      customKeyEventHandler,
      onPaste,
      onCursorMove,
      onBufferTypeChange,
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

    const customKeyEventHandlerRef = useRef(customKeyEventHandler);
    customKeyEventHandlerRef.current = customKeyEventHandler;

    const onPasteRef = useRef(onPaste);
    onPasteRef.current = onPaste;

    const onCursorMoveRef = useRef(onCursorMove);
    onCursorMoveRef.current = onCursorMove;

    const onBufferTypeChangeRef = useRef(onBufferTypeChange);
    onBufferTypeChangeRef.current = onBufferTypeChange;

    // Track last fitted dimensions to avoid redundant resize callbacks
    const lastDimsRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });

    const performFit = () => {
      if (!containerRef.current || !fitAddonRef.current || !terminalRef.current) return;
      try {
        fitAddonRef.current.fit();
        const currentCols = terminalRef.current.cols;
        const currentRows = terminalRef.current.rows;
        if (
          currentCols > 0 &&
          currentRows > 0 &&
          (currentCols !== lastDimsRef.current.cols || currentRows !== lastDimsRef.current.rows)
        ) {
          lastDimsRef.current = { cols: currentCols, rows: currentRows };
          onResizeRef.current?.(currentCols, currentRows);
        }
      } catch {}
    };

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
          performFit();
        },
        focus: () => {
          terminalRef.current?.focus();
        },
        getTerminal: () => terminalRef.current,
        getFitAddon: () => fitAddonRef.current,
        getCursorCoordinates: () => {
          if (!terminalRef.current || !containerRef.current) return null;
          const term = terminalRef.current;
          const container = containerRef.current;
          const cellWidth =
            (term as any)._core?._renderService?.dimensions?.actualCellWidth ||
            container.clientWidth / Math.max(1, term.cols);
          const cellHeight =
            (term as any)._core?._renderService?.dimensions?.actualCellHeight ||
            container.clientHeight / Math.max(1, term.rows);
          return {
            cursorX: term.buffer.active.cursorX,
            cursorY: term.buffer.active.cursorY,
            cellWidth,
            cellHeight,
            isAlternate: term.buffer.active.type === 'alternate',
          };
        },
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
      const container = containerRef.current;
      if (!container) return;

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
      term.open(container);

      // Initial fit & focus
      performFit();

      if (autoFocus) {
        setTimeout(() => {
          term.focus();
        }, 50);
      }

      // 4. Attach input listener: stream every keystroke immediately
      const dataDisposable = term.onData((data) => {
        onDataRef.current?.(data);
      });

      // 5. Attach resize listener
      const resizeDisposable = term.onResize(({ cols, rows }) => {
        if (cols !== lastDimsRef.current.cols || rows !== lastDimsRef.current.rows) {
          lastDimsRef.current = { cols, rows };
          onResizeRef.current?.(cols, rows);
        }
      });

      // 5b. Attach cursor move listener
      const cursorDisposable = term.onCursorMove(() => {
        onCursorMoveRef.current?.({
          cursorX: term.buffer.active.cursorX,
          cursorY: term.buffer.active.cursorY,
        });
      });

      // 5c. Attach buffer change listener (detect normal vs alternate buffer for vi/nano/top)
      const bufferDisposable = term.buffer.onBufferChange((buffer) => {
        onBufferTypeChangeRef.current?.(buffer.type);
      });

      // 6. Custom Key Event Handler:
      // Prevent browser from stealing Tab, Ctrl+C, Ctrl+Z, Ctrl+D, arrow keys, Home/End
      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.type === 'keydown') {
          // Allow parent to intercept keys first (e.g. intellisense popup consuming Up/Down/Enter/Tab/Esc)
          if (customKeyEventHandlerRef.current) {
            const customHandled = customKeyEventHandlerRef.current(event);
            if (customHandled === false) {
              return false;
            }
          }

          // Tab key: Cisco command autocomplete. Prevent browser focus jump!
          if (event.key === 'Tab') {
            event.preventDefault();
            // Let xterm send '\t'
            return true;
          }

          // Ctrl+C / Cmd+C handling:
          if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'C')) {
            if (event.shiftKey) {
              // Ctrl+Shift+C: Explicit copy of current selection
              event.preventDefault();
              const sel = term.getSelection();
              if (sel) {
                try {
                  navigator.clipboard.writeText(sel);
                } catch {}
              }
              return false;
            }

            // Standard Ctrl+C:
            // "Ctrl+C with a selection copies, without a selection it sends the interrupt to the device."
            if (term.hasSelection()) {
              event.preventDefault();
              const sel = term.getSelection();
              if (sel) {
                try {
                  navigator.clipboard.writeText(sel);
                } catch {}
              }
              return false;
            } else {
              // Without selection: send interrupt (\x03) to target device
              event.preventDefault();
              onDataRef.current?.('\x03');
              return false;
            }
          }

          // Ctrl+Shift+V: Paste from clipboard
          if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'v' || event.key === 'V')) {
            event.preventDefault();
            onPasteRef.current?.();
            try {
              navigator.clipboard.readText().then((clipText) => {
                if (clipText) {
                  onDataRef.current?.(clipText);
                }
              });
            } catch {}
            return false;
          }

          // Ctrl+Z: Cisco IOS exit from config mode or suspend job. Prevent browser undo!
          if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
            event.preventDefault();
            onDataRef.current?.('\x1a');
            return false;
          }

          // Ctrl+D: EOF / Logout. Prevent browser bookmark popup!
          if ((event.ctrlKey || event.metaKey) && (event.key === 'd' || event.key === 'D')) {
            event.preventDefault();
            onDataRef.current?.('\x04');
            return false;
          }

          // Ctrl+W: Word erase in bash/readline/vi/nano. Prevent browser close tab!
          if ((event.ctrlKey || event.metaKey) && (event.key === 'w' || event.key === 'W')) {
            event.preventDefault();
            onDataRef.current?.('\x17');
            return false;
          }

          // Ctrl+R: Reverse search in bash / redo in nano. Prevent browser page reload!
          if ((event.ctrlKey || event.metaKey) && (event.key === 'r' || event.key === 'R')) {
            event.preventDefault();
            onDataRef.current?.('\x12');
            return false;
          }

          // Escape: vi / nano / bash command mode
          if (event.key === 'Escape') {
            return true;
          }

          // Arrow keys, Home, End, PageUp, PageDown: let xterm handle escape codes
          if (
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(
              event.key
            )
          ) {
            return true;
          }

          // Enter, Backspace, Space, Q: let xterm process directly
          if (['Enter', 'Backspace', ' ', 'q', 'Q'].includes(event.key)) {
            return true;
          }
        }

        return true;
      });

      // 7. Copy/Paste Handling:
      // (a) Mouse selection copies:
      const selectionDisposable = term.onSelectionChange(() => {
        if (term.hasSelection()) {
          const sel = term.getSelection();
          if (sel && sel.length > 0) {
            try {
              navigator.clipboard.writeText(sel);
            } catch {}
          }
        }
      });

      // (b) Mouseup check for selection copy:
      const handleMouseUp = () => {
        if (term.hasSelection()) {
          const sel = term.getSelection();
          if (sel && sel.length > 0) {
            try {
              navigator.clipboard.writeText(sel);
            } catch {}
          }
        }
      };
      container.addEventListener('mouseup', handleMouseUp);

      // (c) Right-click paste (PuTTY / Linux terminal behavior):
      const handleContextMenu = async (e: MouseEvent) => {
        e.preventDefault();
        if (term.hasSelection()) {
          // If text is selected on right-click, copy it
          const sel = term.getSelection();
          if (sel) {
            try {
              await navigator.clipboard.writeText(sel);
            } catch {}
          }
        } else {
          // Without selection, right-click pastes text from clipboard into socket
          try {
            onPasteRef.current?.();
            const clipText = await navigator.clipboard.readText();
            if (clipText) {
              onDataRef.current?.(clipText);
            }
          } catch (err) {
            console.warn('Right-click clipboard paste failed:', err);
          }
        }
      };
      container.addEventListener('contextmenu', handleContextMenu);

      // (d) Native browser paste listener on container:
      const handlePaste = (e: ClipboardEvent) => {
        e.preventDefault();
        onPasteRef.current?.();
        const text = e.clipboardData?.getData('text');
        if (text) {
          onDataRef.current?.(text);
        }
      };
      container.addEventListener('paste', handlePaste);

      // (e) Click to focus terminal:
      const handleClick = () => {
        term.focus();
      };
      container.addEventListener('click', handleClick);

      // 8. Handle container dimension changes via ResizeObserver & window resize
      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            performFit();
          });
        });
        resizeObserver.observe(container);
      }

      const handleWindowResize = () => {
        performFit();
      };
      window.addEventListener('resize', handleWindowResize);

      // 9. Cleanup and dispose on unmount
      return () => {
        window.removeEventListener('resize', handleWindowResize);
        container.removeEventListener('mouseup', handleMouseUp);
        container.removeEventListener('contextmenu', handleContextMenu);
        container.removeEventListener('paste', handlePaste);
        container.removeEventListener('click', handleClick);

        if (resizeObserver) {
          resizeObserver.disconnect();
        }

        selectionDisposable.dispose();
        dataDisposable.dispose();
        resizeDisposable.dispose();
        cursorDisposable.dispose();
        bufferDisposable.dispose();

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
