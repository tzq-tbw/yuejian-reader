import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Feather } from "lucide-react";
import type { WordlistSummary } from "../data/types";

interface VocabularySelectorProps {
  lists: WordlistSummary[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function VocabularySelector({ lists, selectedIds, onChange }: VocabularySelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const pointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("keydown", keyDown);
    };
  }, [open]);

  return (
    <div className="vocabularySelector" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`markToggle${selectedIds.length ? " on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`词表标色，已选 ${selectedIds.length} 个词表`}
        onClick={() => setOpen((current) => !current)}
      >
        <Feather size={15} /> 词表标色 <span>{selectedIds.length}</span><ChevronDown size={13} />
      </button>
      {open && (
        <div className="vocabularyMenu" role="menu" aria-label="选择标色词表">
          <div className="vocabularyMenuTitle">选择要标色的词表，可多选</div>
          {lists.length === 0 ? (
            <p>暂无可用词表，请先到设置页导入。</p>
          ) : lists.map((list) => {
            const checked = selectedIds.includes(list.id);
            return (
              <button
                type="button"
                className="vocabMenuItem"
                role="menuitemcheckbox"
                aria-checked={checked}
                key={list.id}
                onClick={() => onChange(checked
                  ? selectedIds.filter((id) => id !== list.id)
                  : [...selectedIds, list.id])}
              >
                <span className={`wordlistCheck${checked ? " checked" : ""}`}>{checked && <Check size={13} />}</span>
                <span>{list.name}<small>{list.wordCount.toLocaleString()} 词</small></span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
