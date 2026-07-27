## Problem
Chrome on a remote machine hits the Vite dev server at `http://<lan-ip>:5173`. That origin is an **insecure context**, and `crypto.randomUUID()` is a secure-context-only API — so it's `undefined` and the page throws. (It works locally only because Chrome exempts `http://localhost`/`http://127.0.0.1`.)

The fix is purely code-level: replace the two direct `crypto.randomUUID()` calls with a helper that falls back gracefully. (A dev-server HTTPS change would also fix it but is more invasive and only helps dev, not a deployed HTTP origin.)

## Changes

### 1. New helper: `src/uuid.ts`
A small module exporting a `uuid()` function:
- If `globalThis.crypto?.randomUUID` exists → use it (native, secure contexts).
- Else if `crypto.getRandomValues` exists (available in insecure contexts too) → build an RFC-4122 v4 string manually from 16 random bytes.
- Else → `Math.random`-based fallback (very old browsers).

This produces UUID-v4-shaped strings in all cases, matching the shape the backend already accepts.

### 2. `src/components/tabs/PromptsTab.tsx`
- Add import of `uuid` from `../uuid` (or relative path).
- Line 72: `const [sessionId] = useState(() => uuid())`
- Line 266: `const promptId = uuid()`

## Why this approach
- Smallest change; no new dependency (no `uuid`/`nanoid` packages to add).
- Fixes the error on any HTTP origin, not just in dev.
- Native `crypto.randomUUID()` is still used whenever a secure context is available, so no behavior change for the normal case.
- `crypto.getRandomValues()` is intentionally available in insecure contexts (unlike `randomUUID`/`crypto.subtle`), so it's the right fallback tier.

## Files touched
- `src/uuid.ts` (new)
- `src/components/tabs/PromptsTab.tsx` (2 edits + 1 import)

## Verification
- `npm run lint` (oxlint) passes.
- `npm run build` (tsc + vite build) passes.
- Manual: load the app over `http://<lan-ip>:5173` from another machine and confirm submitting a prompt no longer throws and `prompt_id`/`session_id` are populated (network tab shows them in the request body).