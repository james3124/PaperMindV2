import { DocxEditor, usePageSetup } from '@docx-editor.dev/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const Toolbar = DocxEditor.Toolbar;

type TabId = 'home' | 'insert' | 'layout' | 'review' | 'view';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'layout', label: 'Layout' },
  { id: 'review', label: 'Review' },
  { id: 'view', label: 'View' },
];

/**
 * Single-row horizontal panning. The engine's picker popups are absolutely
 * positioned inside the bar, so a real `overflow-x: auto` container would
 * clip them; instead the row keeps `overflow: visible` and is dragged with
 * a transform. Vertical scrolling stays native (touch-action: pan-y).
 */
function PanRow({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startT: 0, t: 0 });

  const clamp = useCallback((t: number) => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return t;
    const min = Math.min(0, outer.clientWidth - inner.scrollWidth);
    return Math.max(min, Math.min(0, t));
  }, []);

  const apply = useCallback((t: number) => {
    drag.current.t = t;
    if (innerRef.current) innerRef.current.style.transform = `translateX(${t}px)`;
  }, []);

  useEffect(() => {
    const onResize = () => apply(clamp(drag.current.t));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [apply, clamp]);

  return (
    <div
      ref={outerRef}
      className="pm-ribbon__pan-outer"
      onPointerDown={(event) => {
        drag.current.active = true;
        drag.current.startX = event.clientX;
        drag.current.startT = drag.current.t;
      }}
      onPointerMove={(event) => {
        if (!drag.current.active) return;
        const dx = event.clientX - drag.current.startX;
        if (Math.abs(dx) > 6) apply(clamp(drag.current.startT + dx));
      }}
      onPointerUp={() => {
        drag.current.active = false;
      }}
      onPointerLeave={() => {
        drag.current.active = false;
      }}
      onWheel={(event) => {
        const dx = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0;
        if (dx) apply(clamp(drag.current.t + dx));
      }}
    >
      <div ref={innerRef} className="pm-ribbon__pan-inner">
        {children}
      </div>
    </div>
  );
}

/** Common paper sizes in twips (1/20th of a point). */
const PAPER_SIZES: readonly { id: string; label: string; w: number; h: number }[] = [
  { id: 'letter', label: 'Letter', w: 12240, h: 15840 },
  { id: 'a4', label: 'A4', w: 11906, h: 16838 },
  { id: 'legal', label: 'Legal', w: 12240, h: 20160 },
  { id: 'a3', label: 'A3', w: 16838, h: 23811 },
  { id: 'a5', label: 'A5', w: 8391, h: 11906 },
  { id: 'tabloid', label: 'Tabloid', w: 15840, h: 12240 },
];

function PaperSizePicker() {
  const { pageSetup, isEnabled, apply } = usePageSetup();
  if (!pageSetup) return null;
  const current = PAPER_SIZES.find(
    (size) =>
      (size.w === pageSetup.pageWidthTwips && size.h === pageSetup.pageHeightTwips) ||
      (size.h === pageSetup.pageWidthTwips && size.w === pageSetup.pageHeightTwips),
  );
  return (
    <label className="pm-ribbon__paper">
      <span className="pm-ribbon__paper-label">Size</span>
      <select
        className="pm-ribbon__paper-select"
        aria-label="Paper size"
        disabled={!isEnabled}
        value={current?.id ?? 'custom'}
        onChange={(event) => {
          const size = PAPER_SIZES.find((entry) => entry.id === event.target.value);
          if (!size || !pageSetup) return;
          const landscape = pageSetup.orientation === 'landscape';
          apply({
            pageWidthTwips: landscape ? size.h : size.w,
            pageHeightTwips: landscape ? size.w : size.h,
          });
        }}
      >
        {!current && <option value="custom">Custom</option>}
        {PAPER_SIZES.map((size) => (
          <option key={size.id} value={size.id}>
            {size.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Ribbon({ onFindToggle }: { onFindToggle?: () => void }) {
  const [tab, setTab] = useState<TabId>('home');

  return (
    <div className="pm-ribbon">
      <div className="pm-ribbon__tabs" role="tablist" aria-label="Ribbon tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`pm-ribbon__tab${tab === entry.id ? ' pm-ribbon__tab--active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
        {onFindToggle && (
          <button
            type="button"
            className="pm-ribbon__find"
            onClick={onFindToggle}
            aria-label="Find and replace"
          >
            Find
          </button>
        )}
      </div>
      <PanRow>
        <Toolbar preset={false} className="pm-ribbon__body">
          {tab === 'home' && (
            <>
              <Toolbar.Undo />
              <Toolbar.Redo />
              <Toolbar.Separator />
              <Toolbar.StylePicker />
              <Toolbar.FontFamily />
              <Toolbar.FontSize />
              <Toolbar.Separator />
              <Toolbar.Bold />
              <Toolbar.Italic />
              <Toolbar.Underline />
              <Toolbar.Strike />
              <Toolbar.FontColor />
              <Toolbar.Highlight />
              <Toolbar.Separator />
              <Toolbar.AlignLeft />
              <Toolbar.AlignCenter />
              <Toolbar.AlignRight />
              <Toolbar.AlignJustify />
              <Toolbar.BulletList />
              <Toolbar.NumberedList />
              <Toolbar.LineSpacing />
              <Toolbar.Indent />
              <Toolbar.Outdent />
              <Toolbar.Separator />
              <Toolbar.Link />
              <Toolbar.ClearFormatting />
            </>
          )}
          {tab === 'insert' && (
            <>
              <Toolbar.TableInsert />
              <Toolbar.ImageInsert />
              <Toolbar.Separator />
              <Toolbar.Link />
              <Toolbar.Button slot="insert.pageBreak" />
              <Toolbar.Button slot="insert.footnote" />
              <Toolbar.Button slot="insert.endnote" />
              <Toolbar.Button slot="insert.toc" />
              <Toolbar.Button slot="insert.pageNumber" />
            </>
          )}
          {tab === 'layout' && (
            <>
              <PaperSizePicker />
              <Toolbar.Separator />
              <Toolbar.Button slot="file.pageSetup" />
              <Toolbar.Separator />
              <Toolbar.Zoom />
            </>
          )}
          {tab === 'review' && (
            <>
              <Toolbar.Comments />
              <Toolbar.EditingMode />
            </>
          )}
          {tab === 'view' && (
            <>
              <Toolbar.Zoom />
              <Toolbar.Separator />
              <Toolbar.Button slot="contentControl.showAll" />
            </>
          )}
        </Toolbar>
      </PanRow>
    </div>
  );
}
