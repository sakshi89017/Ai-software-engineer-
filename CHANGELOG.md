# Changelog

## Step 7 — Alembic Database Migrations

**Backend**

- `backend/database/config.py` — Configured `load_dotenv()` to execute automatically when config is loaded, enabling local `.env` settings outside Docker. Added a fallback compile rule mapping the PostgreSQL-native `UUID` type to `VARCHAR(36)` on SQLite, enabling local development on SQLite out-of-the-box.
- `backend/main.py` — Removed `Base.metadata.create_all(bind=engine)` from the startup event. The database schema is now managed entirely via migrations.
- `backend/alembic.ini` (new) — Scaffolded the Alembic configuration file.
- `backend/alembic/env.py` (new) — Overrode dynamic database connectivity using `DATABASE_URL` from the application's config. Reused the SQLAlchemy `engine` directly to inherit custom SQLite mappings and connection options. Imported model metadata and models to support autogeneration.
- `backend/alembic/script.py.mako` (new) — Scaffolded the default Alembic migration script template.
- `backend/alembic/versions/24673d5373f9_initial_migration.py` (new) — Generated the initial migration matching the current DB schema exactly.
- `backend/alembic/README` (new) — Scaffolded the Alembic README.

**Functional Verification**
- Wiped database and ran `alembic upgrade head` successfully.
- Confirmed the FastAPI server boots correctly.
- Confirmed the Next.js frontend compiles and builds successfully with zero errors.

## Step 6 — Rate Limiting + Settings Page

**Backend**

- `backend/utils/__init__.py` (new) — marks `utils` as a package (was an empty scaffold directory before this step).
- `backend/utils/rate_limiter.py` (new) — `InMemoryRateLimiter`: a thread-safe, per-key sliding-window counter (`dict[str, deque[float]]` + a `threading.Lock`), plus two ready-to-use FastAPI dependencies:
  - `enforce_chat_rate_limit` — wraps `get_current_user`, enforces `CHAT_RATE_LIMIT_PER_MINUTE` (default 15/min) keyed by user id, raises `429` with a `Retry-After` header and a human-readable `detail` message on limit exceeded.
  - `enforce_upload_rate_limit` — same shape, enforces `UPLOAD_RATE_LIMIT_PER_MINUTE` (default 10/min) for uploads.
  - Both are drop-in replacements for `get_current_user` (they return the same `User` on success), so no other code around them needed to change.
- `backend/ai/router.py` — `send_message`'s `current_user` dependency changed from `get_current_user` to `enforce_chat_rate_limit`. Every other chat route (`/new`, `/history`, `/{chat_id}` GET/PATCH/DELETE) is untouched and still uses plain `get_current_user`, per the spec (only the endpoint that hits OpenAI is throttled).
- `backend/files/router.py` — `upload_file`'s `current_user` dependency changed from `get_current_user` to `enforce_upload_rate_limit`. `list_files`, `get_file`, `delete_file` are untouched.
- `backend/schemas/auth.py` — added `UserUpdate` (`full_name` only) and `ChangePasswordRequest` (`current_password`, `new_password`).
- `backend/api/auth_routes.py` — two new endpoints:
  - `PATCH /api/auth/me` — updates `full_name` and returns the updated `UserOut`.
  - `POST /api/auth/change-password` — verifies `current_password` via the existing `verify_password()` helper, then re-hashes and stores `new_password` via `hash_password()`. Returns a plain `{"message": "..."}` (no token rotation — the existing access token stays valid, matching how `logout` is already handled statelessly).
- `backend/.env.example` — added `CHAT_RATE_LIMIT_PER_MINUTE=15` and `UPLOAD_RATE_LIMIT_PER_MINUTE=10`.

**Frontend**

- `frontend/src/types/auth.ts` — added `UpdateProfilePayload` and `ChangePasswordPayload`.
- `frontend/src/lib/validations/auth.ts` — added `updateProfileSchema` and `changePasswordSchema` (current/new/confirm, reusing the same password-strength rule as `registerSchema`, plus a check that the new password differs from the current one).
- `frontend/src/services/auth-service.ts` — added `updateProfile()` (`PATCH /api/auth/me`) and `changePassword()` (`POST /api/auth/change-password`).
- `frontend/src/context/auth-context.tsx` — added `updateProfile` and `changePassword` to `AuthContextValue`, following the exact same try/toast/rethrow pattern as `login`/`register`. `updateProfile` also updates local `user` state from the response so the UI reflects the new name immediately without a refetch.
- `frontend/src/components/settings/profile-form.tsx` (new) — RHF + Zod form for editing `full_name` (email shown read-only). Save button is disabled until the form is dirty; resets its "dirty" baseline to the new values on success so it disables again without an extra network round-trip.
- `frontend/src/components/settings/change-password-form.tsx` (new) — RHF + Zod form for current/new/confirm password. On a server-side rejection specifically about the current password being wrong, additionally attaches a field-level error to the `currentPassword` input (on top of the toast the context already shows), so the person knows exactly which field to fix.
- `frontend/src/app/(dashboard)/dashboard/settings/page.tsx` — replaced the read-only placeholder with three cards: Profile (editable), Password (change form), Account (read-only "member since").
- `frontend/src/services/chat-service.ts` — `streamMessage()`'s error path now parses the JSON `{"detail": "..."}` body FastAPI sends for errors raised *before* streaming starts (e.g. this step's new 429s, or any validation error) and throws a clean `Error` with that message, instead of throwing the raw JSON text.
- `frontend/src/hooks/use-chat.ts` — `runStream`'s catch block now shows the thrown error's actual `message` (falling back to the old generic string only if none is present), so a 429 from the new rate limiter surfaces as e.g. *"You're sending messages too quickly (limit: 15 per minute). Please wait 42s and try again."* via the existing toast pattern, exactly like an `AIServiceError` message from the `"error"` SSE event already did.

**Not changed:** authentication (login/register/refresh/logout endpoints and flows), frontend routing, dashboard shell, AI Chat streaming/history/regenerate behavior, quick-action chips, File Upload's validation/storage logic, and Conversation History page — all untouched per the standing project rules. (Both flagged files, `ai/router.py` and `files/router.py`, were touched, but only to swap one dependency in one endpoint each — no other line in either file changed.)

### Design Decision: In-Memory Rate Limiting (not DB-backed)

`docker-compose.yml` runs exactly one `backend` container with a single `uvicorn` process (`backend/Dockerfile` has no `--workers` flag), so there's only one process's memory that needs to stay consistent — a plain in-process `dict[str, deque[float]]` (guarded by a `threading.Lock`) is enough, with none of the operational cost a DB-backed table would add on the hot path: no extra write to Postgres on every single chat message or upload, no cleanup job for old rows, no migration for a table nobody needs to query.

This is explicitly a single-process design. If DevPilot AI ever moves to multiple `uvicorn` workers or multiple backend replicas behind a load balancer, each process would get its own counters and the limiter would silently under-count — at that point this needs to move to a shared store (Redis, or a `rate_limits` table). That's recorded as a forward-looking caveat in `PROJECT_STATE.md`, not a bug in the current deployment target.

### Design Decision: Change-Password Verification Flow

`POST /api/auth/change-password` never trusts the frontend's "passwords match" check alone (that's UX, not security) — it independently re-verifies `current_password` server-side using the same `verify_password()` bcrypt helper `login` already uses, *before* touching `hashed_password` at all. Concretely: look up `current_user` (already authenticated via JWT) → `verify_password(payload.current_password, current_user.hashed_password)` → 400 if that fails → otherwise `hash_password(payload.new_password)` and commit. No new hashing logic was written; both helpers already existed in `auth/security.py` from Step 1. The existing access/refresh tokens are left valid afterward (consistent with `logout` already being stateless) — a future step could add token invalidation on password change if that's judged necessary, but it wasn't in scope here.

### Known Issues Addressed This Step

- ✅ **No rate limiting on `/api/chat/message` or `/api/files/upload`** (flagged in Steps 4 and 5) — fixed via `enforce_chat_rate_limit` / `enforce_upload_rate_limit` described above.
- ✅ **Settings page was read-only** — fixed via the new Profile and Password forms described above.

### Known Issues Still Outstanding / Decisions Flagged for Next Step

- **Alembic migrations**: still not introduced. This step's schema footprint is zero (no new columns, no new tables — rate limiting is in-memory and the two new auth endpoints reuse the existing `users` table), so there was no schema-migration risk to weigh this step. The recommendation from Step 5 stands unchanged: worth doing as its own dedicated step before the schema grows further, since it would also retroactively resolve the manual-migration caveat on `messages.file_id`.
- **Multi-file attachment per message**: `ai/router.py` and `files/router.py` were both touched this step, but only for the rate-limit dependency swap — neither router's request/response shape or prompt-building logic changed, so this step doesn't shift the calculus on tackling multi-file attachment next. Still a clean, isolated follow-on.
- No automated test suite yet (manual/scripted smoke tests only).
- In-memory rate limiter is per-process — see "Design Decision" above for the exact scaling boundary.

### Functional Verification (Step 6)

⚠️ **This sandbox has no network egress at all** (confirmed via `curl -I https://registry.npmjs.org/...` → `403 host_not_allowed`, and `pip install` → `Could not find a version that satisfies the requirement fastapi==0.115.0` with no index reachable). This is a step down from the Step 3–5 sandboxes, which could at least reach PyPI/npm to install dependencies (they just couldn't reach `api.openai.com`). Concretely, this means:

- **Backend**: could not `pip install -r requirements.txt` or boot `uvicorn` live. Verified instead via `python3 -m py_compile` across every backend `.py` file (including all newly added/modified ones) — confirms syntax validity and catches import-order typos, but does **not** confirm the dependency graph resolves at runtime (e.g. FastAPI's dependency-injection wiring, SQLAlchemy column definitions). Manually traced every new import (`utils.rate_limiter` → `auth.dependencies` → `database.config`/`models.user`, matching the existing `ai/router.py`/`files/router.py` import shape) to rule out circular imports.
- **Frontend**: could not `npm install` (registry blocked at the network layer, not an npm/version issue) or run `npm run build`/`tsc`. Every new/changed file was written to match existing, already-verified patterns line-for-line (`ProfileForm`/`ChangePasswordForm` mirror `LoginForm`/`RegisterForm`'s RHF+Zod+`Button isLoading` structure exactly; `updateProfileSchema`/`changePasswordSchema` mirror `registerSchema`'s shape) and manually re-read for type consistency against `types/auth.ts` and the `Input`/`Button`/`Card` component prop signatures.
- **Recommendation carried forward strongly**: before deploying this step, run `pip install -r requirements.txt && uvicorn main:app` and `npm install && npm run build` in an environment with normal network access, exactly as the Step 3–5 checkpoints recommended for live OpenAI streaming. This step's own risk surface (two new small endpoints, one dependency swap in two existing endpoints, two new frontend forms) is narrow, but it has strictly *less* verification than every prior step, not more — flagging this clearly rather than implying a false level of confidence.

---


## Step 5 — Explicit AI Actions + Conversation History Page

**Backend**

- `backend/models/chat.py` — added nullable `Message.file_id` (FK → `uploaded_files.id`, `ON DELETE SET NULL`). Tracks which uploaded file (if any) was attached when a *user* message was sent. Additive/non-breaking, same pattern as the Step 3 `token_count` column.
- `backend/schemas/chat.py` — `MessageOut.file_id: Optional[UUID]` added so the frontend can see which messages had a file attached.
- `backend/ai/router.py`:
  - Extracted the inline file-content-injection logic into a new `_build_file_prompt()` helper, shared by both the normal-send path and the regenerate path (previously this logic only existed inline for normal sends).
  - `send_message` now persists `file_id` on the user message row when one is attached.
  - **Fixed known issue**: regenerating a reply now looks up the *original* user message's `file_id` and re-resolves + re-injects that file's content, instead of silently dropping file context on regenerate.
- `backend/requirements.txt` — pinned `httpx==0.27.2`. **Bug fix, unrelated to Step 5 features**: the unpinned `httpx` resolved to `0.28.1` during environment verification, which removed the `proxies` kwarg that `openai==1.54.0`'s HTTP client wrapper still passes, crashing the app at import time (`AsyncClient.__init__() got an unexpected keyword argument 'proxies'`). Pinning restores a clean boot. No application code changed.

**Frontend**

- `frontend/src/lib/ai-actions.ts` (new) — client-side-only registry of the six AI action shortcuts (Explain Code, Find Bugs, Suggest Improvements, Optimize Code, Generate Comments, Explain This Algorithm), each with a `buildPrompt(fileName)` template function. See "Design Decisions" below for why this lives on the frontend rather than in `ai/prompts.py`.
- `frontend/src/lib/date-groups.ts` (new) — `groupChatsByDate()` utility that buckets `ChatListItem[]` into standard ChatGPT-style groups (Today / Yesterday / Previous 7 Days / Older) based on `updated_at`, preserving each chat's original ordering within its bucket and omitting empty buckets.
- `frontend/src/components/chat/chat-input.tsx` — added a row of quick-action chips, rendered only when a file is attached, positioned above the textarea. Clicking a chip immediately sends that action's templated prompt (using the attached file's name) through the existing `onSend` callback — no new send path, no new endpoint.
- `frontend/src/app/(dashboard)/dashboard/history/page.tsx` — replaced the placeholder with a real page: reuses `useChatHistory()` (search, rename, delete — zero duplicated logic), groups results via `groupChatsByDate()`, renders each chat as a row with title/preview/timestamp, inline rename, and a delete dropdown (same interaction pattern as the sidebar). Clicking a row's title/preview navigates to `/dashboard/chat/{id}`.

**Not changed:** authentication, frontend routing, dashboard shell, AI Chat streaming behavior/UI beyond the input, and File Upload — all untouched per the standing project rules.

### Design Decision: Action Shortcuts Reuse `POST /api/chat/message`

Action chips call the exact same `onSend` handler a manually typed message would, which flows through the existing `useChat.sendMessage()` → `chatService.streamMessage()` → `POST /api/chat/message` path, with the same `file_id` already attached. The backend has no concept of "actions" — it only ever sees a normal user-authored chat message. This means:

- Zero duplicated streaming/error-handling/persistence logic (all of it already lives in `ai/router.py` and `ai/service.py`).
- Zero new endpoints, zero new request/response schemas.
- Regenerate, title generation, and history all "just work" for action-originated messages with no special-casing.

The templates themselves live in a small frontend constants file (`src/lib/ai-actions.ts`) rather than `ai/prompts.py`, because the backend never needs to know these six phrasings exist — from its point of view they're indistinguishable from anything a user could type by hand. Keeping them client-side avoids adding backend surface area for something that's purely a UX affordance. If a future step needs the backend to treat these differently (e.g. a distinct system prompt per action, or usage analytics per action type), that would be the trigger to move the definitions server-side and pass an explicit `action` field on `SendMessageRequest`.

### Known Issues Addressed This Step

- ✅ **Regenerate + file_id** (was: "regenerating a message that originally had a file_id attached doesn't re-inject file content") — fixed via the new `Message.file_id` column and `_build_file_prompt()` reuse described above.

### Known Issues Still Outstanding

- No rate limiting on `/api/chat/message` or `/api/files/upload` (flagged again — not addressed this step; see Known Issues in PROJECT_STATE.md).
- No Alembic migrations yet; the new `messages.file_id` column relies on `Base.metadata.create_all()` picking it up for fresh databases. An existing deployed Postgres DB would need a manual `ALTER TABLE messages ADD COLUMN file_id UUID REFERENCES uploaded_files(id) ON DELETE SET NULL;` before upgrading to this step's backend code.
- No automated test suite yet (manual/scripted smoke tests only).

### Functional Verification (Step 5)

- Backend boots cleanly (`python -c "import main"` equivalent, via a local SQLite-shimmed check — see Step 4 note on Postgres not being installable in this sandbox) with the new `file_id` column created automatically.
- Frontend builds cleanly: `npm run build` — 0 errors, 0 warnings, 10 routes (unchanged route count from Step 4; `/dashboard/history` is now a real page instead of a placeholder, same path).
- Scripted smoke test: register → upload a file → send a message with `file_id` attached → confirm the persisted `Message` row has the correct `file_id` → insert a synthetic assistant reply → call `regenerate` → confirm file resolution succeeds with no 404 (previously this path didn't exist at all). AI streaming itself still can't be tested live end-to-end in this sandbox (no network access to `api.openai.com`, no real key) — same caveat as Steps 3–4.

---


## Step 4 — File Upload System

### Backend — Added

- `backend/files/__init__.py` — marks `files` as a package.
- `backend/files/service.py` — `FileService` class:
  - `ALLOWED_EXTENSIONS` maps each supported extension to a canonical `file_type` label (python, javascript, typescript, java, cpp, html, css, json, markdown, text).
  - `_sanitize_filename()` strips directory components and unsafe characters (path-traversal protection) — verified against `../../etc/passwd.txt`-style attacks.
  - `save_upload()` validates extension, rejects empty/oversized files (`MAX_UPLOAD_SIZE_BYTES`, default 2MB), rejects non-UTF-8 content (binaries disguised with an allowed extension), then writes to `uploads/storage/{user_id}/{uuid}_{filename}`.
  - `read_content()` / `delete_file()` for retrieval and cleanup.
  - Raises `FileValidationError` (400-safe) for all invalid-input cases.
- `backend/files/router.py` — `/api/files/*` endpoints. Mirrors `ai/router.py`'s ownership-check pattern (`_get_owned_file`: 404, not 403, for another user's file).
- `backend/schemas/file.py` — `UploadedFileOut`, `UploadedFileWithContent`.
- `backend/uploads/storage/.gitkeep` + `backend/.gitignore` — preserves the storage directory structure in version control without committing uploaded content.

### Backend — Modified

- `backend/schemas/chat.py` — added optional `file_id: Optional[uuid.UUID]` to `SendMessageRequest`.
- `backend/ai/router.py` — `send_message()` now resolves and validates an attached file (ownership-checked, 404 if missing/not-owned) and folds its content into the prompt sent to OpenAI for that turn (`ai_prompt_content`), while the DB still stores the user's original typed message unmodified. Regeneration and no-file sends are unaffected.
- `backend/main.py` — imports and registers `files.router.router` alongside the existing `auth_router` and `chat_router`. No existing routes changed.
- `backend/.env.example` — added `MAX_UPLOAD_SIZE_BYTES` and `UPLOAD_ROOT`.

### Frontend — Added

**Types & data layer**
- `src/types/file.ts` — `UploadedFile`, `UploadedFileWithContent`.
- `src/services/file-service.ts` — `upload()` (multipart, lets the browser set the Content-Type boundary), `list()`, `getWithContent()`, `remove()`.
- `src/hooks/use-files.ts` — manages the uploads list, client-side extension pre-check (fast feedback before hitting the network), upload/delete state.

**Components**
- `src/components/uploads/file-dropzone.tsx` — drag-and-drop + click-to-browse upload zone with drag-over highlighting and an uploading spinner state.
- `src/components/uploads/file-list-item.tsx` — file row with type/size/date, an "Ask AI" action (navigates to a new chat with the file pre-attached), and delete (with confirm).

**Pages**
- `src/app/(dashboard)/dashboard/uploads/page.tsx` — replaces the Step 2 placeholder with the real dropzone + file list.

### Frontend — Modified

- `src/types/chat.ts` — added optional `file_id` to `SendMessagePayload`.
- `src/hooks/use-chat.ts` — `sendMessage()` and `runStream()` now accept an optional `fileId`, passed through to the backend on the next message only.
- `src/components/chat/chat-input.tsx` — added an attached-file chip (shown above the textarea, removable via an X button) and a file-aware placeholder ("Ask about {filename}...").
- `src/components/chat/chat-view.tsx` — added `initialAttachedFile` prop; manages attached-file state locally and clears it after one send (a file is attached to a single message, not the whole conversation, matching common chat-with-file UX).
- `src/app/(dashboard)/dashboard/chat/page.tsx` — reads `?fileId=&fileName=` query params (set by the Uploads page's "Ask AI" button) to pre-attach a file when arriving at a new chat.

### Verification performed

- Backend: `python -c "from main import app"` boots cleanly with all three modules (auth, chat, files); OpenAPI schema confirms 13 registered routes.
- Backend: scripted functional test (SQLite shim) —
  - Valid `.py` upload succeeds, returns correct metadata.
  - List and get-with-content both return expected data.
  - Invalid extension (`.exe`) rejected with 400 and a clear message listing allowed extensions.
  - Oversized file (3MB against a 2MB cap) rejected with 400.
  - Path-traversal filename (`../../etc/passwd.txt`) safely sanitized to `passwd.txt` and stored inside the user's own directory — not written outside the upload root.
  - Cross-user file access returns 404.
  - Sending a chat message with `file_id` attached resolves the file server-side without a 404 (confirmed by the flow reaching the AI-service call, which then fails gracefully due to no `OPENAI_API_KEY` in the test environment — the *file lookup* succeeded).
  - Delete removes the DB row; subsequent GET returns 404.
- Frontend: `npm run build` — 0 errors, 0 warnings, all 10 routes compile and type-check (uploads page now real, ~6.3kB vs. the previous placeholder).

## Step 3 — AI Chat System

### Backend — Added

- `backend/ai/__init__.py` — marks `ai` as a package.
- `backend/ai/prompts.py` — `SYSTEM_PROMPT` (software-engineering-only assistant persona) and `build_title_generation_prompt()`, kept separate from business logic per spec.
- `backend/ai/utils.py` — `estimate_token_count()` (dependency-free ~4-chars-per-token estimate), `fallback_title_from_message()`, `sanitize_title()`.
- `backend/ai/service.py` — `AIService` class: wraps OpenAI's Responses API (`responses.create`, `stream=True`), yields text deltas via `stream_reply()`, generates chat titles via `generate_title()` with automatic fallback on failure. Translates `AuthenticationError`, `RateLimitError`, `APITimeoutError`, `APIConnectionError`, and generic `APIError` into a single `AIServiceError` with a user-safe message and appropriate status code. Exposes a module-level `ai_service` singleton.
- `backend/ai/router.py` — all `/api/chat/*` endpoints (see API section below). Routes are thin: DB access + response shaping only, all AI logic delegated to `AIService`.
- `backend/schemas/chat.py` — `MessageOut`, `ChatOut`, `ChatWithMessages`, `ChatListItem`, `ChatCreate`, `ChatUpdate`, `SendMessageRequest`.

### Backend — Modified

- `backend/models/chat.py` — added `token_count` (Integer, default 0, not null) to `Message`. Additive change; does not affect existing rows/behavior once migrated.
- `backend/main.py` — imports and registers `ai.router.router` alongside the existing `auth_router`. No existing routes changed.
- `backend/requirements.txt` — pinned `bcrypt==4.0.1` (compatibility fix for passlib, discovered during this step's testing; unrelated to chat feature itself but required for auth to keep working in verification).
- `backend/.env.example` — added `OPENAI_MODEL` and `OPENAI_TITLE_MODEL`.

### Frontend — Added

**Types & data layer**
- `src/types/chat.ts` — `Chat`, `ChatMessage`, `ChatWithMessages`, `ChatListItem`, `SendMessagePayload`, `ChatStreamEvent` (discriminated union matching backend SSE payloads exactly).
- `src/services/chat-service.ts` — REST calls (`createChat`, `getHistory`, `getChat`, `renameChat`, `deleteChat`) plus `streamMessage()`, a `fetch`-based SSE reader (Axios can't stream response bodies in-browser) that respects an `AbortSignal` for the Stop button.

**Hooks**
- `src/hooks/use-chat.ts` — manages a single chat's messages, streaming state, send/regenerate/stop.
- `src/hooks/use-chat-history.ts` — manages the sidebar's chat list, debounced search, rename, delete.

**Components**
- `src/components/chat/chat-sidebar.tsx` — new chat button, search input, chat list with inline rename and delete (via dropdown + confirm).
- `src/components/chat/chat-view.tsx` — shared view combining message list + input, used by both new-chat and existing-chat pages.
- `src/components/chat/message-list.tsx` — renders messages, streaming bubble, typing indicator, empty state; auto-scrolls on update.
- `src/components/chat/message-bubble.tsx` — user/assistant bubble with copy button and (for the last assistant message) a regenerate button.
- `src/components/chat/markdown-message.tsx` — `react-markdown` + `remark-gfm` renderer with custom code/table/th/td components.
- `src/components/chat/code-block.tsx` — syntax-highlighted code block (`react-syntax-highlighter`, theme-aware) with a copy button.
- `src/components/chat/typing-indicator.tsx` — animated three-dot indicator shown before the first token arrives.
- `src/components/chat/chat-input.tsx` — auto-resizing textarea, Enter-to-send/Shift+Enter-for-newline, Send/Stop button swap based on streaming state.

**Pages**
- `src/app/(dashboard)/dashboard/chat/layout.tsx` — adds `ChatSidebar` alongside the existing dashboard chrome (full-bleed within the main content area).
- `src/app/(dashboard)/dashboard/chat/page.tsx` — new-chat view (`chatId = null`).
- `src/app/(dashboard)/dashboard/chat/[id]/page.tsx` — continues an existing chat by id.

### Frontend — Modified

- `src/app/globals.css` — added `@plugin "@tailwindcss/typography"` for the `prose` classes used in markdown rendering; removed the earlier `tw-animate-css` import (caused a Tailwind v4 `@utility` nesting conflict) and the Google Fonts (`Geist`) import (unreachable in this sandbox's network allowlist — swapped to a system font stack). Both changes are environment-driven, not feature-driven, and don't affect visual intent.
- `package.json` — added `react-markdown`, `remark-gfm`, `react-syntax-highlighter`, `@types/react-syntax-highlighter`, `@tailwindcss/typography`.

### Frontend — Removed

- `src/app/(dashboard)/dashboard/chat/page.tsx` (Step 2's placeholder) — replaced by the real chat implementation above. No other Step 2 files were touched; auth, routing, and the rest of the dashboard shell are unchanged.

### Verification performed

- Backend: `python -c "from main import app"` boots cleanly; OpenAPI schema confirms all 10 routes (5 auth + 5 chat) are registered.
- Backend: scripted functional test (SQLite shim, since Postgres isn't installable in this sandbox) — register → create chat → list history → rename → get-by-id → cross-user access returns 404 → send message gracefully returns an `error` SSE event when no `OPENAI_API_KEY` is set (does not crash) → delete → 404 after delete → 401 for unauthenticated requests.
- Frontend: `npm run build` — 0 errors, 0 warnings, all 10 routes compile and type-check.
