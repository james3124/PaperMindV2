import type { Misspelling } from '../lib/spellcheck';

type SpellCheckPanelProps = {
  colorMode: 'light' | 'dark';
  checking: boolean;
  items: Misspelling[];
  fixedCount: number;
  onFix: (word: string, replacement: string) => void;
  onIgnore: (word: string) => void;
  onClose: () => void;
};

export function SpellCheckPanel({
  colorMode,
  checking,
  items,
  fixedCount,
  onFix,
  onIgnore,
  onClose,
}: SpellCheckPanelProps) {
  const dark = colorMode === 'dark';
  const colors = dark
    ? {
        backdrop: 'rgba(0,0,0,0.55)',
        bg: '#212225',
        element: '#2e3135',
        text: '#ffffff',
        secondary: '#b0b4ba',
        accent: '#7ba7e0',
        danger: '#ff6b61',
        chipText: '#ffffff',
      }
    : {
        backdrop: 'rgba(0,0,0,0.35)',
        bg: '#ffffff',
        element: '#f0f0f3',
        text: '#1a1a1a',
        secondary: '#60646c',
        accent: '#2b579a',
        danger: '#d93025',
        chipText: '#1a1a1a',
      };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: colors.backdrop,
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '70%',
          backgroundColor: colors.bg,
          color: colors.text,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: '12px 16px calc(16px + env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 16, flex: 1 }}>Spelling</strong>
          <span style={{ fontSize: 13, color: colors.secondary }}>
            {checking
              ? 'Checking…'
              : fixedCount > 0
                ? `${fixedCount} fixed`
                : ''}
          </span>
          <button
            onClick={onClose}
            aria-label="Close spell check"
            style={{
              border: 'none',
              background: colors.element,
              color: colors.text,
              borderRadius: 14,
              width: 28,
              height: 28,
              fontSize: 14,
              lineHeight: '28px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {checking ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: colors.secondary }}>
            Checking the document…
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: colors.secondary }}>
            No spelling issues found ✓
          </div>
        ) : (
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item) => (
              <div
                key={item.word}
                style={{
                  backgroundColor: colors.element,
                  borderRadius: 10,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      color: colors.danger,
                      fontWeight: 600,
                      textDecoration: 'line-through',
                      flex: 1,
                    }}
                  >
                    {item.word}
                  </span>
                  <button
                    onClick={() => onIgnore(item.word)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: colors.secondary,
                      fontSize: 13,
                      cursor: 'pointer',
                      padding: 4,
                    }}
                  >
                    Ignore
                  </button>
                </div>
                {item.suggestions.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {item.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => onFix(item.word, suggestion)}
                        style={{
                          border: `1px solid ${colors.accent}`,
                          backgroundColor: 'transparent',
                          color: dark ? colors.accent : colors.accent,
                          borderRadius: 14,
                          padding: '4px 12px',
                          fontSize: 14,
                          cursor: 'pointer',
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: colors.secondary, fontSize: 13 }}>No suggestions</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
