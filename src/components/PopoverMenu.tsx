import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";

export interface MenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
}

interface PopoverMenuProps {
  open: boolean;
  label: string;
  items: MenuItem[];
  onClose: () => void;
  align?: "left" | "right";
}

export function PopoverMenu({
  open,
  label,
  items,
  onClose,
  align = "right",
}: PopoverMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }, 0);
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className={`menu ${align}`}
      role="menu"
      aria-label={label}
    >
      {items.map(({ label: itemLabel, icon: Icon, onSelect, danger }) => (
        <button
          key={itemLabel}
          type="button"
          role="menuitem"
          className={danger ? "danger" : undefined}
          onClick={() => {
            onClose();
            onSelect();
          }}
        >
          <Icon size={15} />
          {itemLabel}
        </button>
      ))}
    </div>
  );
}