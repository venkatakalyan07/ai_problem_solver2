# AI Problem Solver

AI Problem Solver is a lightweight web application for turning programming
problem statements into readable, language-specific solutions. Choose a
programming language, describe the problem, and receive a generated solution
with an explanation of the approach and its time and space complexity.

The HTML, CSS, and JavaScript frontend is served by an Express backend. The
backend calls NVIDIA's hosted chat-completions API and stores conversations
and messages in Supabase PostgreSQL. API credentials are read by the backend;
they are not included in frontend files.

## Features

- Generate solutions in Python, JavaScript, Java, C++, C#, Go, or Rust.
- Save conversations and messages in Supabase PostgreSQL.
- Browse, reopen, and delete saved conversations.
- Preserve solution formatting and copy code from responses.
- Use only the current problem statement for each NVIDIA request; prior
  conversation messages are not sent to NVIDIA.

## Requirements

- Node.js 18 or later.
- An NVIDIA API key with access to the configured model.
- A Supabase project with the `conversations` and `messages` tables.
- The Supabase publishable key and project URL.

## Configure and run locally

1. Open PowerShell in the project directory and move to the backend:

   ```powershell
   cd "C:\AI Projects\ai_problem_solver2\Backend"
   ```

2. Keep the existing `Backend/.env` and its `NVIDIA_API_KEY` unchanged. Edit
   that file and add the following variables, using your Supabase publishable
   key:

   ```dotenv
   SUPABASE_URL=https://htofpkuclfxhcxdxcqqg.supabase.co
   SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
   ```

   `Backend/.env.example` contains placeholders. If you do not already have a
   `.env`, create one with `Copy-Item .env.example .env`, then fill in all
   required values. The backend also accepts the existing
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   variable names as compatibility fallbacks.

3. Install dependencies if needed and start the backend:

   ```powershell
   npm install
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000).

`Backend/.env` is ignored by Git. Never place the NVIDIA key or a Supabase
secret/service-role key in the frontend or commit them. The backend rejects
known elevated Supabase keys; use only the publishable key.

## Supabase tables and permissions

The backend expects these columns:

- `conversations`: `id` (UUID), `title`, `created_at`, and `updated_at`.
- `messages`: `id`, `conversation_id`, `role`, `content`, `language`, and
  `created_at`.

The `messages.conversation_id` foreign key should reference
`conversations.id` with `ON DELETE CASCADE`. The database must provide defaults
for UUID IDs and message `created_at` timestamps. The backend sets conversation
`updated_at` on creation and whenever a message is added.

The live Supabase dashboard configuration cannot be inspected from this local
project. Before testing, check **Supabase Dashboard → Table Editor** for both
tables and their RLS status and policies. You can also run these read-only
checks in the Supabase SQL Editor:

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('conversations', 'messages');

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('conversations', 'messages');

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('conversations', 'messages');
```

The server uses the publishable key, which acts as the `anon` database role
unless a user-authentication flow is added. If RLS is enabled and no matching
policy permits an operation, Supabase rejects it; this app returns a generic
history error and logs only a safe database error code. Do not solve that by
disabling RLS or using a service-role key. For a secure multi-user deployment,
add Supabase Auth, an owner ID on each conversation, backend token validation,
and RLS policies based on `auth.uid()`; messages must be authorized through
their owning conversation. No such policies or database migrations are
created by this application.

## Prototype security limitation

Authentication and ownership are not implemented. This is a **single-user
prototype**: all clients that can reach this backend share the same history.
Conversation UUIDs are identifiers, not authorization tokens, and the
existence check in the API does not provide user isolation. Keep this app
private and local; do not expose it as a public or multi-user service until
authentication, ownership checks, and corresponding RLS policies are in place.
The backend never uses an elevated Supabase key to bypass RLS.

## Using conversation history

- On page load, saved conversations are fetched from Supabase through the
  backend.
- Choose a history item to load its messages in chronological order.
- **New chat** clears the current selection. Its conversation row is created
  when the first problem is submitted; later questions reuse that ID.
- Use **Delete** and confirm to remove a conversation and its cascading
  messages.
- A successful response refreshes the sidebar and the saved transcript.

## Manual end-to-end check

1. Start the server and open the page. The history panel should show saved
   conversations or its friendly empty-history message.
2. Submit a problem. The history should gain a titled chat, and the transcript
   should show the question and generated solution.
3. Submit another question without choosing **New chat**. It should appear in
   the same conversation.
4. Refresh the browser. Choose that chat in the sidebar and verify both
   messages are still present.
5. Choose **New chat**, submit a different problem, then verify it appears as a
   separate history item.
6. Choose the earlier chat to reopen it. Use **Delete** and confirm to remove
   that chat; it should disappear from history with its messages.
7. Check the `conversations` and `messages` tables in Supabase Table Editor.

## API

All responses are JSON. Database failures do not expose database details.

### `POST /api/solve`

Request:

```json
{
  "problem": "Find the largest element in an array",
  "language": "Java",
  "conversationId": null
}
```

Use the returned `conversationId` in subsequent requests for that chat.
Omitting `language` remains supported and defaults to Python. Successful
response:

```json
{
  "solution": "Generated explanation and solution...",
  "conversationId": "returned-conversation-uuid"
}
```

Provider errors after the user message is saved include `conversationId`, so
the frontend can keep the chat and its saved question. Invalid input returns
HTTP 400; missing configuration returns 503; provider failures return 502 or
504; database failures return a generic 500 response.

### `GET /api/conversations`

Returns `{ "conversations": [...] }`, sorted by `updated_at` descending.

### `POST /api/conversations`

Creates an empty conversation. Optional request body:

```json
{ "title": "New conversation" }
```

Returns HTTP 201 and `{ "conversation": {...} }`.

### `GET /api/conversations/:id/messages`

Returns `{ "messages": [...] }` sorted by `created_at` ascending. Invalid IDs
return HTTP 400; missing conversations return HTTP 404.

### `DELETE /api/conversations/:id`

Returns `{ "success": true, "conversationId": "..." }`. Messages are removed
by the database foreign-key cascade.

## Verify saved data

After sending a problem, open **Supabase Dashboard → Table Editor** and inspect
`conversations` and `messages`. A conversation row should have the generated
title and updated timestamp; its messages should include a `user` row and an
`assistant` row with the selected language. Refresh the browser and select the
same conversation from the sidebar to verify the history was loaded from the
database.

If Supabase returns a permissions or RLS error, verify the project URL/key,
table names and schema, grants, RLS status, and applicable policies in the
dashboard. A publishable key cannot bypass a policy denial. For production,
configure Auth, ownership columns, and `auth.uid()`-based policies instead of
granting anonymous access or substituting a secret key.

## Model configuration

The backend calls NVIDIA's chat-completions endpoint with the
`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` model. The endpoint, model, and
prompt format are retained from the existing implementation.
