# PaperMind

An Android app for writing and editing Word (`.docx`) documents, built with Expo SDK 57.
The editor is a paginated, Word-like web editor ([@docx-editor.dev](https://docx-editor.dev))
embedded in a WebView and bridged to the native app.

## Architecture

```
src/app/(tabs)/index.tsx   Document library: list, + New, Import, rename/share/delete
src/app/editor.tsx         Editor screen: top bar (back/filename/Share), save in place
src/components/
  docx-bridge-view.tsx     WebView host + message bridge, theme sync, zoom fix
  document-list-item.tsx   Library row with swipe actions and action sheet
src/lib/
  documents.ts             Store layer over Paths.document (expo-file-system)
  docx-bridge.ts           Native side of the postMessage protocol
  doc-names.ts             Pure naming/formatting helpers (unit-tested)
editor-web/                Vite + React app that hosts the docx editor
src/generated/             Generated artifacts (do not edit)
```

### WebView bridge protocol

Native → web: `LOAD_DOC {base64}`, `EXPORT_REQUEST`, `SET_THEME {value}`
Web → native: `READY`, `DIRTY {value}`, `SAVE_REQUEST {base64, title?}`, `ERROR {message}`

Both parsers are unit-tested (`src/lib/docx-bridge.test.ts`, `editor-web/src/lib/bridge.test.ts`).

### Editor asset pipeline

Metro cannot bundle raw HTML, so the editor web app is built to a single file and
inlined into a TypeScript module:

```bash
npm run generate        # vite build editor-web -> editor-html.ts, plus blank-docx.ts
```

- `editor-web/` builds with `vite-plugin-singlefile` into `assets/editor-web/index.html`
- `scripts/generate-editor-html.mjs` embeds it into `src/generated/editor-html.ts`
- At runtime the HTML is written to the cache directory once and loaded via `file://`
  (falls back to inline loading if the write fails)
- `assets/documents/blank.docx` is embedded as base64 via `scripts/generate-blank-docx.mjs`

## Development

```bash
npm install
npx expo start          # then press a to open on Android
```

### Verification

```bash
npx tsc --noEmit        # app typecheck
npm run typecheck:web   # editor-web typecheck
npm run lint
npm test                # app unit tests (vitest)
npm run test:web        # editor-web unit tests
npx expo-doctor
```

## Building an APK

The Android applicationId is `com.papermind.app`. Builds run on EAS (no local
Android SDK required):

```bash
npx eas login
npx eas build --profile preview --platform android   # installable APK
npx eas build --profile production --platform android # Play Store bundle
```

Profiles are defined in `eas.json` (`development`, `preview` = APK, `production` = AAB).

## Device checklist

Things to verify on a real phone after install:

- [ ] Import copies `content://` picker URIs into the library (Android SAF)
- [ ] New blank documents open and save correctly
- [ ] Rename sheet is not covered by the keyboard
- [ ] Editor does not zoom when tapping into text (WebView `textZoom=100`)
- [ ] Dark mode follows the system theme in both chrome and editor
