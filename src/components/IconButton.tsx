import { forwardRef, type MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";

interface IconButtonProps {
  label: string;
  icon: LucideIcon;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  size?: number;
  disabled?: boolean;
  expanded?: boolean;
  hasPopup?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, icon: Icon, onClick, className = "", size = 18, disabled, expanded, hasPopup },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        className={`icon ${className}`.trim()}
        title={label}
        aria-label={label}
        aria-expanded={expanded}
        aria-haspopup={hasPopup ? "menu" : undefined}
        disabled={disabled}
        onClick={onClick}
      >
        <Icon size={size} />
      </button>
    );
  },
);