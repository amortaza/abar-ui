## Goal
In the **Projects** tab, clicking a project row selects that project-id as the current project, persisted as an app setting (localStorage) and shared app-wide via React Context.

## Approach (per your choices)
- **State**: React Context (`CurrentProjectProvider` + `useCurrentProject` hook).
- **Persistence**: new `src/settings.ts` module backed by `localStorage`.

## Files to change

### 1. NEW `src/settings.ts` — typed, reusable settings layer
- `const STORAGE_KEY = 'abar.settings.v1'`
- `export interface AppSettings { currentProject: string | null }`
- `export function loadSettings(): AppSettings` — reads/parses localStorage; try/catch + shape guard; returns `{ currentProject: null }` on miss/error.
- `export function saveSettings(s: AppSettings): void` — JSON.stringify + setItem, wrapped in try/catch (private mode / quota).

### 2. NEW `src/components/CurrentProjectContext.tsx`
- `CurrentProjectContext = createContext<CurrentProjectContextValue | null>(null)`
- `interface CurrentProjectContextValue { currentProject: string | null; setCurrentProject: (id: string | null) => void }`
- `CurrentProjectProvider({ children })`:
  - `useState(() => loadSettings().currentProject)` (lazy init — reads once on mount)
  - `useEffect` → `saveSettings({ currentProject })` whenever it changes (persist after first paint)
- `useCurrentProject()` — returns context; throws if used outside the provider.

### 3. EDIT `src/App.tsx`
- Import `CurrentProjectProvider` and wrap the app content so Header / LeftPane / right pane can all read the current project.

### 4. EDIT `src/components/tabs/ProjectsTab.tsx`
- Import `useCurrentProject`; destructure `currentProject` + `setCurrentProject`.
- Row `<li className="projects-row">` becomes clickable:
  - `onClick={() => setCurrentProject(id)}`
  - `role="button"`, `tabIndex={0}`, `aria-pressed={id === currentProject}`
  - `onKeyDown` → select on Enter / Space
  - Active class: `id === currentProject ? 'projects-row--active' : ''`
- Stop selection when clicking an action button: wrap Rename/Delete `onClick` to `e.stopPropagation()` before the existing handler.
- Correctness on CRUD:
  - After **delete**: if the deleted id was current → `setCurrentProject(null)`.
  - After **rename**: if the renamed id was current → `setCurrentProject(newId)`.

### 5. EDIT `src/components/tabs/ProjectsTab.css`
- `.projects-row { cursor: pointer; }`
- `.projects-row--active` — distinct highlight (e.g. accent-tinted background + left accent border) to show the selected/current project.

## Out of scope
- Displaying the current project in the Header or wiring it into `PhrasesTab` — the API functions (`fetchPrompts`/`fetchPhrases`) already accept `project_id`, but the task is specifically the Projects-tab selection + save. The context is ready for those follow-ups.

## Verification
- `npm run build` (runs `tsc -b && vite build`) — confirms types compile (incl. `verbatimModuleSyntax`, `noUnusedLocals`).
- `npm run lint` (oxlint).
- Manual: click a row → highlighted; reload page → same project still selected; Rename/Delete update/clear selection correctly.