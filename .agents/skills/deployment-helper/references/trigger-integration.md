# Integration, Verification, and Trigger Binding

Use this stage only after the participant confirms that API Configuration has been validated through multiple successful YOXA workflow runs.

On a resumed session, first read [Resume audit](resume-audit.md). Do not assume
reachability is complete just because trigger code or an Integration screen
exists.

## Establish the server environment contract first

Before giving a verification command or implementing a trigger, inspect the
project's environment convention. If `.env.example` is absent, always create
it; otherwise update it with required missing server-only keys. Use empty
values only:

```dotenv
# Server-side only. Never put real values in source control.
YOXA_TRIGGER_URL=
YOXA_DEPLOYMENT_SECRET=
```

If deployed HITL exists in the workflow or repository, add these empty keys in
the same edit:

```dotenv
YOXA_HITL_WEBHOOK_SIGNING_SECRET=
YOXA_HITL_RESPONSE_SECRET=
```

Preserve correct existing names rather than adding duplicates. Tell the
participant to create their ignored `.env` from that example for local work, or
configure the same names in the hosting provider's server-side secret manager.
They set the real values there and restart/redeploy the server. Do not create a
real `.env`, read its values, or ask for those values in chat.

When the participant says they have reached **Release → Integration**, make this
safe `.env.example` edit now. Do not ask permission. Respond briefly:

```text
Added YOXA variables to .env.example.
Create .env beside it. Put real server-only values there. Restart server.
Now paste the Yoxa verification cURL. Keep <YOUR_SECRET> unchanged.
```

Do not recap API Configuration, describe existing routes, or ask about
activation at this point.

## Generate and store the secret

Tell the participant to open Release → Integration. They may see several settings; first generate the YOXA deployment secret. It is shown only once, so they must store it immediately in their server-side hosting secret manager (for example, a Supabase Edge Function secret, Vercel or Netlify environment variable, or backend secret manager).

Never ask the participant to paste the real secret into chat. It must not enter source code, commits, OpenAPI files, browser code, or public environment variables.

## Verify reachability

After the participant copies YOXA's verification cURL, preserve its endpoint and headers exactly. Keep `<YOUR_SECRET>` in the chat-visible command. Tell them:

```text
This verifies that your deployed server can reach YOXA within the challenge's allowed time window.
Set the secret in your local ignored .env or server secret manager, then run this command promptly from a trusted server terminal/environment.
Do not paste the completed command, its secret, or terminal history into chat.
```

If the participant asks the agent to run the test, the agent may load the
already-configured local environment through the project's normal server
command, without printing the secret or constructing a chat-visible command
that contains it. Confirm only the status/result. Never ask them to reveal the
secret as a prerequisite.

Success is a verification response such as `{ "verified": true }`. It confirms reachability only; it does not prove trigger binding and does not activate the workflow. If it fails, inspect the returned status and body without exposing the secret. Typical causes are an expired challenge, an incorrect secret, an unsaved Integration policy, or a wrong endpoint. Create a fresh challenge when needed.

## Obtain the trigger template and bind it

Only after reachability succeeds, ask the participant to copy the trigger cURL template from YOXA and identify the trusted application event that should start the workflow, such as “Confirm trip”, “Submit request”, or “Complete checkout”. Keep `<YOUR_SECRET>` and `<UNIQUE_REQUEST_ID>` as placeholders in chat.

The first workflow step's trigger defines the public start request. The copied
workflow context explains its intent, but the Integration screen's cURL is the
authoritative URL, headers, and payload:

- `text` triggers use `application/json` with required `trigger_text` and may
  include `metadata`;
- `file` triggers use `multipart/form-data` with one required `file` and
  optional `trigger_text`.

Both modes require the deployment secret and a unique `Idempotency-Key`.
Later-step triggers are runtime gates inside the run, not separate public start
endpoints. For file mode, send the original file from the trusted server seam;
Yoxa extracts bounded text context for runtime use rather than exposing raw
file bytes to agents.

Inspect the project and identify the correct server-side seam: an application backend route, Supabase Edge Function, Netlify/Vercel/Cloudflare server function, server action, or equivalent trusted boundary. Do not put the secret or trigger call in browser code. The public application must enforce its own user/session authorization before calling this seam.

State the exact placement before coding:

```text
Trigger owner: <user action>
Server seam: <file and handler>
When: after <application record> is persisted successfully
UI result: persist workflow_run_id; show a safe error if the trigger fails
```

If the application has one obvious creation/confirmation action, use it. Do
not ask repeatedly for the placement. Ask one focused question only when there
are genuinely multiple possible trigger actions.

`YOXA_TRIGGER_URL` is required: it contains the deployment-specific path and
is the source of truth for the payload and headers copied from Yoxa. Do not
invent or reconstruct that path.

Do **not** add `YOXA_API_BASE` by default. For a later HITL response, derive
the origin from `new URL(YOXA_TRIGGER_URL).origin`. Add an explicit base URL
only when the client intentionally uses a different public Yoxa origin. Never
add an empty optional variable: an empty value can override a fallback.

`YOXA_INTERNAL_API_TOKEN` is not a participant application setting. It belongs
only to Yoxa's own web-to-backend proxy and must never be copied to the client.

Before writing trigger or response code, inspect the copied trigger URL. Its
origin must be Yoxa's **public web/API gateway**, not the private Python/backend
service URL. The participant calls that public origin with the deployment or
HITL response secret; Yoxa's gateway adds `X-Yoxa-Internal-Token` when
forwarding internally. If the copied Integration URL targets the backend
directly, stop and report a Yoxa Integration contract bug—never compensate by
adding the internal token to the participant app.

## Implement idempotency correctly

Use the copied YOXA endpoint, header names, and payload shape exactly. When `Idempotency-Key` is required:

- Generate a new UUID for each new logical user action or event.
- Retain the same key only when retrying that exact action with the identical payload after a timeout or transient failure.
- Never use a static key; YOXA does not generate this key.
- Reusing a key with the same payload safely replays the prior accepted result; reusing it with a different payload returns an idempotency conflict.

For TypeScript server-side code, the usual pattern is `const idempotencyKey = crypto.randomUUID();` inside the handler that processes the real application action.

When authorized to implement, add code that reads `YOXA_DEPLOYMENT_SECRET` and
`YOXA_TRIGGER_URL` at runtime from the server-side secret manager, sends the
copied request, forwards only intended event data, generates the idempotency
key, persists the returned `workflow_run_id`, handles failures without logging
a secret, and returns a safe application-facing result. Ensure `.env.example`
contains the corresponding empty keys before asking the participant to test.

## Activation boundary

Before a real trigger test, say:

```text
The trigger integration can now be added, but YOXA will not start production workflow runs until you return to Release and click Activate.

Before activating, confirm the secret is stored server-side, the trigger is attached to the correct authorized action, and reachability remains verified.
```

If deployed HITL is in scope, complete its receiver, environment configuration,
and **Send test event** before the participant activates. The participant, not
the skill, clicks Activate. After activation, they can perform the real
application action once and inspect the YOXA workflow run using a fresh
idempotency key.
