import { useLayoutEffect, useRef, useState } from "react";
import {
  computePosition,
  flip,
  offset,
  shift,
  type VirtualElement,
} from "@floating-ui/dom";
import { BookMarked, Languages, TextQuote } from "lucide-react";
import { isSingleWord } from "../language/text";
import type { CapturedSelection } from "./selection";

interface SelectionToolbarProps {
  selection: CapturedSelection;
  onAskWord: (selection: CapturedSelection) => void;
  onTranslate: (selection: CapturedSelection) => void;
  onAnalyze: (selection: CapturedSelection) => void;
}

function toDomRect(selection: CapturedSelection): DOMRect {
  const { left, top, width, height } = selection.rect;
  if (typeof DOMRect === "function") {
    return new DOMRect(left, top, width, height);
  }
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Floating UI 定位的选区工具条；按钮按下时 preventDefault，保住原文选区。 */
export function SelectionToolbar({
  selection,
  onAskWord,
  onTranslate,
  onAnalyze,
}: SelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0, placed: false });
  const single = isSingleWord(selection.text);

  useLayoutEffect(() => {
    let cancelled = false;
    setPosition({ x: 0, y: 0, placed: false });
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const reference: VirtualElement = {
      getBoundingClientRect: () => toDomRect(selection),
    };

    const update = () => {
      void computePosition(reference, toolbar, {
        placement: "top-start",
        strategy: "fixed",
        middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
      })
        .then(({ x, y }) => {
          if (!cancelled) setPosition({ x, y, placed: true });
        })
        .catch(() => {
          // 定位失败时退回选区上方的固定位置，工具条仍然可用。
          if (!cancelled) {
            setPosition({
              x: Math.max(8, selection.rect.left),
              y: Math.max(8, selection.rect.top - 44),
              placed: true,
            });
          }
        });
    };

    update();
    window.addEventListener("resize", update);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", update);
    };
  }, [selection]);

  return (
    <div
      ref={toolbarRef}
      className="bubble selectionToolbar"
      data-theme="high-contrast"
      role="toolbar"
      aria-label="选区操作"
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        visibility: position.placed ? "visible" : "hidden",
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {single ? (
        <button type="button" onClick={() => onAskWord(selection)}>
          <BookMarked size={15} />
          查看词卡
        </button>
      ) : (
        <>
          <button type="button" onClick={() => onTranslate(selection)}>
            <Languages size={15} />
            翻译
          </button>
          <button type="button" onClick={() => onAnalyze(selection)}>
            <TextQuote size={15} />
            解析
          </button>
        </>
      )}
    </div>
  );
}