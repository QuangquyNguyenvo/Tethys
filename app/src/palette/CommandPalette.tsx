import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CommandItem } from "./commands";
import { Search } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
};

export function CommandPalette({ isOpen, onClose, commands }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(isOpen);
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusPendingRef = useRef(false);

  const restoreFocus = () => {
    if (!restoreFocusPendingRef.current) return;
    restoreFocusPendingRef.current = false;
    const returnTarget = returnFocusRef.current;
    returnFocusRef.current = null;
    if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
  };

  // Keep the palette mounted for the short exit motion. Reopening while it is leaving
  // cancels the timer, so rapidly tapping Ctrl+K never flashes an empty frame.
  useEffect(() => {
    let timer = 0;
    if (isOpen) {
      if (!restoreFocusPendingRef.current) {
        returnFocusRef.current = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
        restoreFocusPendingRef.current = true;
      }
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setMounted(false);
        setClosing(false);
      } else {
        setClosing(true);
        backdropRef.current?.focus({ preventScroll: true });
        timer = window.setTimeout(() => {
          setMounted(false);
          setClosing(false);
        }, 200);
      }
    }
    return () => window.clearTimeout(timer);
  }, [isOpen, mounted]);

  useEffect(() => {
    if (!isOpen && !mounted) restoreFocus();
  }, [isOpen, mounted]);

  useEffect(() => () => restoreFocus(), []);

  const filtered = commands.filter((cmd) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      (cmd.shortcut && cmd.shortcut.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      const frame = window.requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  if (!mounted) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (closing) {
      if (e.key === "Tab") e.preventDefault();
      return;
    }

    if (e.key === "Tab") {
      trapFocus(e, dialogRef.current);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={backdropRef}
      className={"palette-backdrop" + (closing ? " is-closing" : "")}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        ref={dialogRef}
        className="palette-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        aria-hidden={closing || undefined}
        inert={closing}
        tabIndex={-1}
      >
        <div className="palette-input-wrap">
          <Search size={18} />
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            placeholder="Type a command or search actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="palette-kbd">Esc</kbd>
        </div>

        <div className="palette-list" ref={listRef} role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <div className="palette-empty">No matching commands found</div>
          ) : (
            filtered.map((cmd, idx) => (
              <div
                key={cmd.id}
                className={`palette-item ${idx === selectedIndex ? "selected" : ""}`}
                style={{ "--palette-order": idx } as CSSProperties}
                role="option"
                aria-selected={idx === selectedIndex}
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="palette-item-cat">{cmd.category}</span>
                <span className="palette-item-title">{cmd.title}</span>
                {cmd.shortcut && <kbd className="palette-item-shortcut">{cmd.shortcut}</kbd>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function trapFocus(event: React.KeyboardEvent, dialog: HTMLElement | null) {
  if (!dialog) return;
  const focusable = getFocusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
    return;
  }

  const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
  const atStart = activeIndex <= 0;
  const atEnd = activeIndex === focusable.length - 1;

  if (event.shiftKey && atStart) {
    event.preventDefault();
    focusable[focusable.length - 1].focus({ preventScroll: true });
  } else if (!event.shiftKey && (activeIndex === -1 || atEnd)) {
    event.preventDefault();
    focusable[0].focus({ preventScroll: true });
  }
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((element) =>
    !element.hidden &&
    element.getAttribute("aria-hidden") !== "true" &&
    !element.closest('[hidden], [aria-hidden="true"]') &&
    element.getClientRects().length > 0
  );
}
