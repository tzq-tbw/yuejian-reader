import { PanelRightClose } from "lucide-react";
import { IconButton } from "../components/IconButton";

interface InspectorProps {
  onCollapse: () => void;
}

export function Inspector({ onCollapse }: InspectorProps) {
  return (
    <aside className="inspector" aria-label="精读侧栏">
      <div className="sectitle">
        <span aria-hidden="true" />
        <IconButton label="收起精读侧栏" icon={PanelRightClose} onClick={onCollapse} />
      </div>
      <div className="content" aria-label="翻译与解析预留区" />
    </aside>
  );
}
