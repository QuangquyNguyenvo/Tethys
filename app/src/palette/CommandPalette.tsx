import { useEffect, useRef, useState } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
      setTimeout(() => inputRef.current?.focus(), 50);
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

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
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

        <div className="palette-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="palette-empty">No matching commands found</div>
          ) : (
            filtered.map((cmd, idx) => (
              <div
                key={cmd.id}
                className={`palette-item ${idx === selectedIndex ? "selected" : ""}`}
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
