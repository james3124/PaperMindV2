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

function HomeTab() {
  return (
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
      <Toolbar.Separator />
      <Toolbar.BulletList />
      <Toolbar.NumberedList />
      <Toolbar.LineSpacing />
      <Toolbar.Indent />
      <Toolbar.Outdent />
      <Toolbar.Separator />
      <Toolbar.Link />
      <Toolbar.ClearFormatting />
    </>
  );
}

function InsertTab() {
  return (
    <>
      <Toolbar.TableInsert />
      <Toolbar.ImageInsert />
      <Toolbar.Separator />
      <Toolbar.Button slot="insert.pageBreak" />
      <Toolbar.Button slot="insert.footnote" />
      <Toolbar.Button slot="insert.endnote" />
      <Toolbar.Button slot="insert.toc" />
      <Toolbar.Button slot="insert.pageNumber" />
    </>
  );
}

function LayoutTab() {
  return (
    <>
      <Toolbar.Button slot="file.pageSetup" />
      <Toolbar.Separator />
      <Toolbar.Zoom />
    </>
  );
}

function ReviewTab() {
  return (
    <>
      <Toolbar.Comments />
      <Toolbar.EditingMode />
    </>
  );
}

function ViewTab() {
  return (
    <>
      <Toolbar.Zoom />
      <Toolbar.Separator />
      <Toolbar.Button slot="contentControl.showAll" />
    </>
  );
}

export function Ribbon() {
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
      </div>
      <Toolbar className="pm-ribbon__body" preset={false}>
        {tab === 'home' && <HomeTab />}
        {tab === 'insert' && <InsertTab />}
        {tab === 'layout' && <LayoutTab />}
        {tab === 'review' && <ReviewTab />}
        {tab === 'view' && <ViewTab />}
      </Toolbar>
    </div>
  );
}
