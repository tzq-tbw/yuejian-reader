import { useId } from "react";
import { parsePastedText } from "../data/text";
import { TOPIC_SUGGESTIONS } from "../data/types";

export interface ArticleDraft {
  title: string;
  topic: string;
  text: string;
}

interface ArticleDraftFieldsProps {
  value: ArticleDraft;
  onChange: (next: ArticleDraft) => void;
  disabled?: boolean;
  focusBody?: boolean;
}

export function ArticleDraftFields({
  value,
  onChange,
  disabled,
  focusBody = false,
}: ArticleDraftFieldsProps) {
  const listId = useId();
  const paragraphCount = parsePastedText(value.text).length;

  return (
    <div className="draftFields">
      <label htmlFor={`${listId}-title`}>标题</label>
      <input
        id={`${listId}-title`}
        type="text"
        value={value.title}
        disabled={disabled}
        data-autofocus={!focusBody || undefined}
        onChange={(event) => onChange({ ...value, title: event.target.value })}
      />
      <label htmlFor={`${listId}-topic`}>主题</label>
      <input
        id={`${listId}-topic`}
        type="text"
        list={listId}
        value={value.topic}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, topic: event.target.value })}
      />
      <datalist id={listId}>
        {TOPIC_SUGGESTIONS.map((topic) => (
          <option key={topic} value={topic} />
        ))}
      </datalist>
      <label htmlFor={`${listId}-text`}>正文</label>
      <textarea
        id={`${listId}-text`}
        value={value.text}
        data-autofocus={focusBody || undefined}
        disabled={disabled}
        spellCheck={false}
        lang="en"
        onChange={(event) => onChange({ ...value, text: event.target.value })}
      />
      <p className="paragraphPreview">
        共 {paragraphCount} 段 · 用空行分段；段内换行会合并为空格
      </p>
    </div>
  );
}
