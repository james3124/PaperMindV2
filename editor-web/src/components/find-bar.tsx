import { useDocxEditor, useDocumentSearch } from '@docx-editor.dev/react';
import { useState } from 'react';

type FindBarProps = {
  onClose: () => void;
};

export function FindBar({ onClose }: FindBarProps) {
  const editor = useDocxEditor();
  const search = useDocumentSearch();
  const [replacement, setReplacement] = useState('');

  const matchCount = search.matches.length;
  const countLabel = search.query
    ? search.truncated
      ? `${matchCount}+`
      : `${matchCount}`
    : '';

  function replaceAll() {
    if (!editor || !search.query) return;
    editor.exec({
      type: 'replaceAllMatches',
      query: search.query,
      text: replacement,
      matchCase: search.matchCase,
      wholeWord: search.wholeWord,
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter') search.next();
    if (event.key === 'Escape') onClose();
  }

  return (
    <div className="pm-findbar" onKeyDown={onKeyDown}>
      <input
        className="pm-findbar__input"
        placeholder="Find"
        aria-label="Text to find"
        value={search.query}
        onChange={(event) => search.setQuery(event.target.value)}
      />
      <span className="pm-findbar__count" aria-live="polite">
        {countLabel}
      </span>
      <button type="button" className="pm-findbar__btn" onClick={search.previous} aria-label="Previous match">
        ▲
      </button>
      <button type="button" className="pm-findbar__btn" onClick={search.next} aria-label="Next match">
        ▼
      </button>
      <button
        type="button"
        className={`pm-findbar__btn${search.matchCase ? ' pm-findbar__btn--on' : ''}`}
        onClick={() => search.setMatchCase(!search.matchCase)}
        aria-label="Match case"
        title="Match case"
      >
        Aa
      </button>
      <button
        type="button"
        className={`pm-findbar__btn${search.wholeWord ? ' pm-findbar__btn--on' : ''}`}
        onClick={() => search.setWholeWord(!search.wholeWord)}
        aria-label="Whole words"
        title="Whole words only"
      >
        W
      </button>
      <input
        className="pm-findbar__input"
        placeholder="Replace"
        aria-label="Replacement text"
        value={replacement}
        onChange={(event) => setReplacement(event.target.value)}
      />
      <button
        type="button"
        className="pm-findbar__btn"
        onClick={replaceAll}
        disabled={!search.query}
      >
        All
      </button>
      <button type="button" className="pm-findbar__btn" onClick={onClose} aria-label="Close find">
        ✕
      </button>
    </div>
  );
}
