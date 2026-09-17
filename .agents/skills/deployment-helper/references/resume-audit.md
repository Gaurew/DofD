# Resume Audit

Use this at the start of every fresh conversation and whenever the participant
says that part of deployment was completed earlier.

## Inspect without exposing secrets

Read source and filenames, but do not read, print, or request values from
`.env`, hosting secret stores, terminal history, screenshots, or copied commands
with substituted secrets. Inspect only safe evidence:

| Stage | Look for | What it proves |
| --- | --- | --- |
| API configuration | one-operation `.openapi.yml` files, source routes and tests | mappings may be implemented; not that Yoxa imported them or they worked |
| Environment contract | `.env.example`, runtime configuration module, deployment docs | variable names and server-only boundary; not that values are set |
| Reachability | no reliable repository signal | nothing; Yoxa UI/terminal result is required |
| Trigger | server-side Yoxa call, copied endpoint config name, UUID idempotency, authorized application action | code may be ready; not that it has run or is activated |
| HITL receiver | raw-body signature verification, durable event/task store, receiver route | inbound handling may be ready; not that Yoxa can reach it |
| HITL approval flow | approval UI plus authenticated server-side response route | decision flow may be ready; not that it was exercised |

Do not treat a client-side `fetch` or a public browser variable as valid trigger
or HITL secret handling.

## Act on the detected state

Do not show a checklist or a full codebase audit. Make safe environment-template
edits immediately. Then give the next step in 1–3 short lines, for example:

```text
Added YOXA keys to .env.example.
Create .env beside it. Add real values there. Restart server.
Now paste Yoxa's verification cURL with <YOUR_SECRET> unchanged.
```

Mention existing trigger/HITL code only when it changes the next action.

## Ask one precise runtime question

Ask only when the answer decides the next action. Do not ask about API
Configuration when the participant says they are at Release → Integration:

```text
Was reachability already verified? Do not send secrets.
```

If unknown, start reachability. Do not request workflow context again when the
participant says they are already at Integration.

## Environment-file checkpoint

Before the reachability command or any code that calls Yoxa, inspect the
project's environment-file convention. If `.env.example` is absent, always
create it; otherwise update it with any required missing server-only keys. It
must contain empty placeholders only, never values:

```dotenv
# Server-side only. Do not expose or commit real values.
YOXA_TRIGGER_URL=
YOXA_DEPLOYMENT_SECRET=
```

When deployed HITL is in scope, also add:

```dotenv
YOXA_HITL_WEBHOOK_SIGNING_SECRET=
YOXA_HITL_RESPONSE_SECRET=
```

Use existing project variable names when they are already correct; do not create
duplicate aliases. Tell the participant to create their ignored local `.env`
from `.env.example` (or set the same names in their hosting provider's server
secret manager), set the values there, and restart/redeploy the server. Never
create a `.env` containing values, and never ask them to paste those values in
chat.

Even if the project currently has no dotenv-style convention, create
`.env.example` as the safe, committed inventory of required server-side names.
The participant may still use a hosting secret manager rather than a local
`.env` in deployment.
