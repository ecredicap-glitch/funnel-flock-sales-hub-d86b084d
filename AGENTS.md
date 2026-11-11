<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (ZapPilot)

- Multi-tenancy: every app table carries `workspace_id` and RLS uses `public.is_workspace_member()` / `public.has_workspace_role()` (security definer) — avoids recursive policies.
- Workspace roles live only in `public.members.role` (enum `member_role`), never on profiles — prevents privilege escalation.
- A signup trigger (`handle_new_user`) creates the profile, a first workspace and an admin membership; extra workspaces go through the `create_workspace` RPC — workspaces have no direct INSERT policy.
- Signed-in pages live under `src/routes/_authenticated/_app/` (gate in `_authenticated/route.tsx`, `ssr: false`; shell + workspace context in `_app.tsx`) — the session is in browser storage.
- Navigation entries are defined once in `src/lib/nav.ts` and feed the rail, bottom bar and command palette — keeps the three in sync.
- WhatsApp access goes through the `WhatsAppProvider` interface (`src/lib/whatsapp/provider.ts`) with adapters in `*.server.ts` loaded only inside server handlers — the provider may change later.
- Each workspace brings its own gateway: URL in `whatsapp_gateways`, key AES-GCM-encrypted (`GATEWAY_ENCRYPTION_KEY`) in `whatsapp_gateway_secrets`, which only the service role can read — keys never reach the browser.
- Instance status/QR are written only by server code (server functions or the token-checked webhook at `/api/public/whatsapp/webhook/$instanceId`); clients may update only name, daily limit and warmup — keeps connection state trustworthy.
- New public tables start with `REVOKE ALL ... FROM anon, authenticated` before explicit GRANTs — this backend's default privileges grant everything otherwise.
- Contacts consent rules live in the database (`contacts_status_guard` trigger, `import_contacts_batch` RPC, generated `eligible` column) — the UI cannot bypass them; campaigns must target only `eligible = true`.
- Phone normalization is the single function `normalizeBrPhone` in `src/lib/phone.ts`, mirrored by the `contacts.phone` CHECK regex — keep both in sync.
- Spreadsheet parsing runs in the browser (`xlsx` loaded via dynamic import) and sends rows to the RPC in batches — keeps the Worker free of large files.
- Message rendering (`{{variavel}}` + spintax `{a|b}`) lives only in the pure module `src/lib/spintax.ts`, shared by the editor preview and the future sender — preview and sent text never diverge.
