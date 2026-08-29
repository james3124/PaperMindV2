import { DocxEditor } from '@docx-editor.dev/react';
import { useState } from 'react';

const Toolbar = DocxEditor.Toolbar;

type TabId = 'home' | 'insert' | 'layout' | 'review' | 'view';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'layout', label: 'Layout' },
  { id: 'review', label: 'Review' },
  { id: 'view', label: 'View' },
];

// Which chrome slots each tab shows. Everything else is hidden via the
// registry's `hidden` flag, so the engine keeps its default grouping and its
// "⋯" overflow collapse (a scrolling bar would clip the picker popups).
const TAB_SLOTS: Record<TabId, ReadonlySet<string>> = {
  home: new Set([
    'history.undo',
    'history.redo',
    'styles.style',
    'font.family',
    'font.size',
    'text.bold',
    'text.italic',
    'text.underline',
    'text.strike',
    'text.color',
    'text.highlight',
    'text.link',
    'script.super',
    'script.sub',
    'alignment.left',
    'alignment.center',
    'alignment.right',
    'alignment.justify',
    'list.bullet',
    'list.numbered',
    'list.lineSpacing',
    'list.indent',
    'list.outdent',
    'format.clear',
  ]),
  insert: new Set([
    'table.insert',
    'image.insert',
    'text.link',
    'insert.pageBreak',
    'insert.sectionBreakNextPage',
    'insert.footnote',
    'insert.endnote',
    'insert.toc',
    'insert.pageNumber',
    'insert.totalPages',
    'insert.pageXofY',
    'paragraph.dialog',
  ]),
  layout: new Set(['file.pageSetup', 'zoom.level']),
  review: new Set(['review.comments', 'review.editingMode']),
  view: new Set(['zoom.level', 'contentControl.showAll']),
};

export function Ribbon({ onFindToggle }: { onFindToggle?: () => void }) {
  const [tab, setTab] = useState<TabId>('home');
  const show = (slot: string) => !TAB_SLOTS[tab].has(slot);

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
      <Toolbar>
        {/* Home */}
        <Toolbar.Undo hidden={show('history.undo')} />
        <Toolbar.Redo hidden={show('history.redo')} />
        <Toolbar.StylePicker hidden={show('styles.style')} />
        <Toolbar.FontFamily hidden={show('font.family')} />
        <Toolbar.FontSize hidden={show('font.size')} />
        <Toolbar.Bold hidden={show('text.bold')} />
        <Toolbar.Italic hidden={show('text.italic')} />
        <Toolbar.Underline hidden={show('text.underline')} />
        <Toolbar.Strike hidden={show('text.strike')} />
        <Toolbar.FontColor hidden={show('text.color')} />
        <Toolbar.Highlight hidden={show('text.highlight')} />
        <Toolbar.Link hidden={show('text.link')} />
        <Toolbar.Superscript hidden={show('script.super')} />
        <Toolbar.Subscript hidden={show('script.sub')} />
        <Toolbar.AlignLeft hidden={show('alignment.left')} />
        <Toolbar.AlignCenter hidden={show('alignment.center')} />
        <Toolbar.AlignRight hidden={show('alignment.right')} />
        <Toolbar.AlignJustify hidden={show('alignment.justify')} />
        <Toolbar.BulletList hidden={show('list.bullet')} />
        <Toolbar.NumberedList hidden={show('list.numbered')} />
        <Toolbar.LineSpacing hidden={show('list.lineSpacing')} />
        <Toolbar.Indent hidden={show('list.indent')} />
        <Toolbar.Outdent hidden={show('list.outdent')} />
        <Toolbar.ClearFormatting hidden={show('format.clear')} />
        {/* Insert */}
        <Toolbar.TableInsert hidden={show('table.insert')} />
        <Toolbar.ImageInsert hidden={show('image.insert')} />
        <Toolbar.Button slot="insert.pageBreak" hidden={show('insert.pageBreak')} />
        <Toolbar.Button
          slot="insert.sectionBreakNextPage"
          hidden={show('insert.sectionBreakNextPage')}
        />
        <Toolbar.Button slot="insert.footnote" hidden={show('insert.footnote')} />
        <Toolbar.Button slot="insert.endnote" hidden={show('insert.endnote')} />
        <Toolbar.Button slot="insert.toc" hidden={show('insert.toc')} />
        <Toolbar.Button slot="insert.pageNumber" hidden={show('insert.pageNumber')} />
        <Toolbar.Button slot="insert.totalPages" hidden={show('insert.totalPages')} />
        <Toolbar.Button slot="insert.pageXofY" hidden={show('insert.pageXofY')} />
        <Toolbar.Button slot="paragraph.dialog" hidden={show('paragraph.dialog')} />
        {/* Layout */}
        <Toolbar.Button slot="file.pageSetup" hidden={show('file.pageSetup')} />
        <Toolbar.Zoom hidden={show('zoom.level')} />
        {/* Review */}
        <Toolbar.Comments hidden={show('review.comments')} />
        <Toolbar.EditingMode hidden={show('review.editingMode')} />
        {/* View */}
        <Toolbar.Button slot="contentControl.showAll" hidden={show('contentControl.showAll')} />
        {/* Never hosted in the ribbon: file actions live in the native top bar. */}
        <Toolbar.Button slot="file.open" hidden />
        <Toolbar.Button slot="file.save" hidden />
      </Toolbar>
    </div>
  );
}
