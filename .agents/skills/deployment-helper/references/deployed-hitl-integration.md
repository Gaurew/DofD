# Deployed HITL Integration

Use this guide when a participant wants their own application to receive and
answer a deployed Yoxa `human_approval` request.

On a resumed session, read [Resume audit](resume-audit.md) first. Existing
receiver code does not prove that Yoxa has the correct public URL, that secrets
are configured, or that **Send test event** has succeeded.

## Explain the model first

Keep this mental model clear:

```text
Yoxa workflow reaches human approval
  -> Yoxa POSTs a signed approval event to the participant's webhook endpoint
  -> participant server persists it
  -> participant UI shows the title, description, and options
  -> human chooses an option or writes a custom response
  -> participant server POSTs that decision to Yoxa
  -> Yoxa persists the decision and resumes the same workflow run
```

The webhook is a normal HTTP POST initiated by Yoxa. The response is a normal
HTTP POST initiated by the participant application. The client never calls a
separate resume endpoint.

Yoxa owns `request_id`: it is the Yoxa HITL request UUID required for the
response endpoint, not the participant application's record ID. The stable
cross-system link is `workflow_run_id`; persist it when the trigger succeeds
and use it to associate an approval with the local record and UI.

## First inspect the client application

Before providing code, inspect the participant's repository and identify:

1. The server boundary that can receive inbound HTTP requests.
2. The server boundary that can safely store environment secrets and call Yoxa.
3. The persisted application record that should own a pending approval task.
4. The frontend route/component where an authorized human can see and decide it.
5. The application's authorization model for deciding who may approve.
6. The local-network topology: where Yoxa executes relative to the participant
   server (host process, Docker container, or remote environment).

If a client has only browser code, say clearly that it cannot receive a webhook.
Recommend a minimal server function or an existing backend route. Do not force a
particular BFF architecture; use their FastAPI backend, Node server, serverless
function, or comparable existing trusted boundary.

State findings as:

```text
Webhook receiver: <route and source evidence>
Secret boundary: <server environment/store>
Approval persistence: <model/table/store>
Approval UI: <route/component>
Authorization: <existing policy or required decision>
Topology: <Yoxa execution location -> receiver URL it can reach>
```

## Configuration steps in Yoxa

Tell the participant to do these steps in order. Never ask them to paste real
secrets into chat.

1. Open **Release → Integration** for the candidate.
2. In **Human Approvals**, enter the public HTTPS URL of the receiver that
   the application has implemented, such as:

   ```text
   https://client.example.com/api/yoxa/hitl
   ```

   This is the client's own endpoint, not a Yoxa endpoint. Choose it from
   **Yoxa's network perspective**, not by copying an OpenAPI server URL:
   native Yoxa and a client server on the same machine can use `localhost`;
   Yoxa in Docker reaching a host server commonly uses
   `host.docker.internal`; remote Yoxa requires public HTTPS/tunnel access.
3. Save the Integration policy.
4. Ensure the project has a server-side `.env.example` before generating the
   secrets. If it is absent, always create it. It must list empty
   `YOXA_HITL_WEBHOOK_SIGNING_SECRET=` and
   `YOXA_HITL_RESPONSE_SECRET=` placeholders (plus the deployment trigger
   variables when trigger integration is in scope). Tell the participant to put
   real values only in their ignored local `.env` or hosting server secret
   manager, then restart/redeploy. Never create, read, or request real values.
5. In **Human approvals**, generate the webhook signing secret. Save it only in
   the client server's secret store as `YOXA_HITL_WEBHOOK_SIGNING_SECRET`.
6. Generate the HITL response secret. Save it only in the client server's
   secret store as `YOXA_HITL_RESPONSE_SECRET`.
7. Send a test event. The receiver must validate and persist it, then return a
   quick `2xx` response. Wait for Yoxa to show a successful test.
8. Finish the ordinary deployment-trigger handshake separately; it uses the
   existing deployment trigger secret, not either HITL secret.
9. Activate the Release Candidate only after all required Integration checks
   are successful.

The two HITL secrets have different roles:

```text
Signing secret: Yoxa -> client. Client verifies the webhook is authentic.
Response secret: client -> Yoxa. Yoxa verifies the decision is authentic.
```

## Webhook receiver contract

Yoxa sends a JSON POST to the configured client endpoint with headers:

```text
X-Yoxa-Webhook-Id: <event_id>
X-Yoxa-Webhook-Timestamp: <RFC3339 UTC timestamp>
X-Yoxa-Webhook-Signature: v1=<HMAC-SHA-256>
```

The HMAC is calculated over:

```text
<timestamp> + "." + <raw request-body bytes>
```

For a real approval, the payload contains:

```text
event_id
event_type = hitl.approval_requested
deployment_id
workflow_run_id
request_id
title
description
options[]: option_id, title, description
```

The test payload uses `event_type = hitl.webhook_test` and contains no workflow
or approval data.

The receiver must, in this order:

1. Read the raw request body before JSON parsing.
2. Verify the HMAC with `YOXA_HITL_WEBHOOK_SIGNING_SECRET` using constant-time
   comparison.
3. Reject stale timestamps (five minutes is the recommended initial tolerance).
4. Deduplicate on `event_id` with a database unique constraint or equivalent
   durable store.
5. For a test event, persist/record it and return `204` or `200`.
6. For an approval event, persist a pending approval task keyed by `request_id`,
   then return `204` or `200` quickly.
7. Route the stored task to the client's normal UI/work queue after persistence.

Yoxa delivery is at-least-once. A non-`2xx`, timeout, or transient failure can
produce another delivery with the same `event_id`; that is expected, not an
error. Never create a duplicate approval task or repeat a side effect.

## Approval UI requirements

Implement UI with the participant's existing component and authorization style.
Do not make a generic new design system.

For a pending task, display:

- `title`
- `description`
- one button for every supplied option
- a custom-response text area, when the product allows an override
- pending/submitting/success/error states

The UI must submit to the participant's own server action/API route, not Yoxa
directly. That server route must verify that the current application user may
act on the task, then send the answer to Yoxa. Persist `workflow_run_id` and
Yoxa's `request_id` with the task; join the UI to the local record by
`workflow_run_id`, and use Yoxa's `request_id` only in the response URL.

The application must store the final result locally so it can render a stable
"answered" state. A second user attempting the same task may receive Yoxa's
idempotent already-responded result; show that the task has already been
answered and refresh its local state.

## Response call from the client server

The participant server sends:

```text
POST /api/v1/public/workflow-deployments/{deployment_id}/hitl/requests/{request_id}/respond
X-Yoxa-HITL-Response-Secret: <server-held response secret>
Content-Type: application/json
```

With exactly one of:

```json
{ "selected_option_id": "option_1" }
```

or:

```json
{ "override_message": "Human-written response" }
```

Derive the Yoxa base URL from the required `YOXA_TRIGGER_URL` by default. The
HITL response needs only `YOXA_HITL_RESPONSE_SECRET` in addition to trigger
variables; `YOXA_API_BASE` is optional only when it deliberately differs from
the trigger URL's origin. Do not put the response secret in browser JavaScript,
a client-exposed environment variable, source code, screenshots, or chat.

`202` means Yoxa stored the response and queued workflow resume. `200` means
the request had already been answered. Neither response requires an additional
resume call.

## Test in two phases

Do not wait for activation to test the inbound webhook. The Yoxa **Send test
event** validates the receiver before activation; a real `human_approval` event
requires an activated workflow.

### Before activation

Guide the participant through this exact sequence:

1. Implement or confirm the receiver, persistence, and approval UI only after
   inspecting source and obtaining approval for any new application changes.
2. Deploy their webhook receiver and approval UI to an address Yoxa can reach.
3. Configure the URL and generate/store both HITL secrets in Yoxa and the
   client server respectively.
4. Use **Send test event**; confirm the receiver logs one verified test event
   and Yoxa shows success.
5. Complete the ordinary trigger handshake and confirm the trigger is attached
   to an authorized application action. Do not expect a real trigger run yet.

### After the participant clicks Activate

1. Trigger a workflow that is known to reach `human_approval`.
2. Confirm the client receives exactly one verified
   `hitl.approval_requested` event and displays the same 2–5 options.
3. Choose one option in the client UI.
4. Confirm the client server receives Yoxa's `202` response.
5. Confirm the same Yoxa `workflow_run_id` resumes and reaches its expected
   terminal state.
6. Repeat the decision submission once only to confirm the safe
    already-responded behavior, then delete test data if the participant wants
    a clean environment.

## Stack-specific guidance

Use the existing application framework. After inspecting source, implement or
propose the smallest native shape:

| Stack | Receiver | UI-to-server decision path |
| --- | --- | --- |
| FastAPI | `@app.post(...)` route with raw body via `await request.body()` | authenticated FastAPI route called by existing frontend |
| Express | `express.raw({ type: 'application/json' })` before JSON middleware for that route | authenticated Express controller |
| Next.js | `app/api/.../route.ts` with `await request.text()` | server action or `/api/...` route |
| Django | `@require_POST` view using `request.body` | authenticated Django view/form/API |
| Serverless | provider HTTP function that exposes raw request bytes | existing authenticated application endpoint/function |

For every stack, preserve raw bytes for HMAC verification, use the framework's
server-only environment variable mechanism, persist/deduplicate before return,
and keep the UI focused on the returned approval data. Add empty secret keys to
`.env.example` only when the application's existing convention supports it;
never add real values.

For a complete deployed HITL setup, the application-side environment contract
is normally exactly:

```text
YOXA_TRIGGER_URL=
YOXA_DEPLOYMENT_SECRET=
YOXA_HITL_WEBHOOK_SIGNING_SECRET=
YOXA_HITL_RESPONSE_SECRET=
```

Do not add `YOXA_API_BASE=` unless it is truly needed, and never add or request
`YOXA_INTERNAL_API_TOKEN`.

## Troubleshooting

- No test delivery: confirm the URL was saved, is reachable from Yoxa, and the
  receiver returns `2xx` before slow work.
- Invalid signature: confirm raw body is read before parsing or reserialization,
  and use the current signing secret after any rotation.
- Duplicate task: enforce unique `event_id` and unique pending `request_id`.
- Decision rejected: confirm the deployment ID/Yoxa HITL request ID pair and
  current server-held response secret. It must be verified against its stored
  hash, never compared to the hash as raw text.
- Card does not appear: verify the event was persisted, then join the local
  record to the approval by `workflow_run_id`, not Yoxa's `request_id`.
- Workflow does not continue after `202`: inspect the same workflow run in
  Yoxa; `202` means resume was durably queued, not that the terminal result is
  already available.
