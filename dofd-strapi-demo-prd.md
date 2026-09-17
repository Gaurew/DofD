# Democracy of Dreams Strapi + Yoxa Demo PRD

## Summary

Build a standalone demo showing how a Democracy of Dreams-owned CMS/backend can receive a public Dreamer onboarding form, persist the submission, and privately trigger a Yoxa workflow. The demo should use a real Strapi app with SQLite to mirror the likely DofD content architecture while keeping the Yoxa backend private.

The browser should submit only to Strapi. Strapi should call Yoxa from server-side code through the Yoxa public web BFF route.

The first implementation should complete the trigger setup. A later implementation can add Strapi endpoints for Yoxa API Connectors, allowing Yoxa workflow tools that were simulated during design time to call DofD-owned APIs during deployed runs.

## Yoxa Context

Yoxa.ai is an agentic workflow automation platform. A Yoxa creator designs a workflow, tests it with simulated tools and test cases, saves a version, deploys it, and monitors workflow runs from the Yoxa dashboard.

For this demo, Yoxa provides:

- External public workflow deployment: a stable BFF endpoint that starts the deployed Dreamer onboarding workflow.
- Deployment monitoring: a dashboard showing trigger attempts, queued/running/completed runs, logs, outputs, and connector readiness.
- API Connectors: deployment-time configuration that maps simulated workflow tools to live HTTP endpoints owned by the external client.

The demo Strapi app represents the client-owned backend/CMS. It should not depend on Yoxa source code or packages.

## Product Goal

Demonstrate the production-shaped integration:

```text
Static DofD form -> Strapi CMS/API -> Yoxa public workflow deployment trigger -> queued Yoxa workflow run
```

The demo should make it clear that Yoxa can integrate with a client's existing backend/CMS workflow without requiring the client website to expose Yoxa secrets or directly talk to Yoxa's private backend.

Also prepare the demo architecture for the later connector direction:

```text
Yoxa deployed workflow tool call -> Strapi tool endpoint -> tool result returned to Yoxa
```

This second direction is not required for the first build, but the docs and route naming should leave a clean path for it.

## User Experience

- The first screen should remain the DofD-style Path of Dreamer form using the current `index.html` and `styles.css` as the visual reference.
- The form should collect the same personal, startup, connection, and supporting-file fields.
- On submit, the browser should show:
  - pending: "Submitting your dream profile..."
  - success: "Thank you. Your dream profile has been submitted successfully."
  - failure: a client-friendly retry message without exposing Yoxa internals.
- No Yoxa endpoint, deployment secret, workflow ID, or debug helper should appear in the client-facing UI.
- Local developer console logging may include the Strapi submission ID and Yoxa acknowledgement IDs for demo verification.

## Architecture

Use a real Strapi project with SQLite:

- Static UI served separately, for example on `http://localhost:5177`.
- Strapi API/admin served on `http://localhost:1337`.
- SQLite as the local demo database.
- Strapi upload plugin for supporting files.
- Yoxa web BFF trigger endpoint configured by env var.

The Yoxa call should go to:

```text
POST http://localhost:3000/api/v1/public/workflow-deployments/{deployment_id}/trigger
```

Do not call the private Yoxa backend directly.

There are two integration boundaries:

- Trigger boundary: Strapi is the caller and Yoxa is the receiver.
- Tool connector boundary: Yoxa is the caller and Strapi is the receiver.

The trigger boundary must be implemented first. The connector boundary can be scaffolded or documented, but it should not block the first working demo.

## Strapi Data Model

Create one collection type: `dreamer-submission`.

Recommended fields:

- `firstName`: string, required
- `lastName`: string, required
- `email`: email/string, required
- `profileLink`: string/url, optional
- `startupName`: string, required
- `startupWebsite`: string/url, optional
- `startDate`: date, required
- `startupVision`: rich text/text, required
- `founderBackground`: text, optional
- `connectionSources`: JSON or repeatable text/list
- `referredBy`: string, optional
- `otherSource`: string, optional
- `supportingFile`: media relation, required
- `yoxaTriggerStatus`: enum/string, values like `pending`, `accepted`, `failed`
- `yoxaWorkflowRunId`: string, optional
- `yoxaTriggerAttemptId`: string, optional
- `yoxaTriggerError`: text/JSON, optional sanitized internal details
- default Strapi timestamps

## Submission Flow

This is the required phase-one implementation.

Implement a custom Strapi submission endpoint, for example:

```text
POST /api/dreamer-submissions/submit
```

Expected behavior:

1. Accept multipart form data from the static UI.
2. Validate required fields and require one supporting file.
3. Persist a `dreamer-submission` record with status `pending`.
4. Store and associate the uploaded file.
5. Build `trigger_text` from the saved submission:
   - include a prefix such as `Submitted external form`
   - include personal information, startup information, and connection fields
   - keep formatting readable for the Yoxa workflow
6. Send multipart form data to Yoxa:

```text
trigger_text=<compiled text>
file=<stored or forwarded uploaded file>
```

with header:

```text
X-Yoxa-Deployment-Secret: <YOXA_DEPLOYMENT_SECRET>
```

7. On Yoxa accepted response, update the submission:
   - `yoxaTriggerStatus = accepted`
   - `yoxaWorkflowRunId = workflow_run_id`
   - `yoxaTriggerAttemptId = trigger_attempt_id`
8. On Yoxa failure, update the submission:
   - `yoxaTriggerStatus = failed`
   - `yoxaTriggerError = sanitized error summary`
9. Return a client-friendly JSON response to the browser.

## Future Tool Connector Flow

This is a phase-two implementation. It should be planned now but does not need to be completed in the first standalone build.

Yoxa workflows can contain simulated tools used during design and testing. In deployment, those simulated tools can be configured as API Connectors. The Yoxa API Connectors screen shows:

- the tool name and owning workflow step/agent
- the expected request shape inferred from the simulated tool input contract
- expected result guidance derived from saved test cases and simulated outputs
- connector configuration fields such as method, URL, auth, timeout, and generated-output file attachments
- a Test Call modal for sending sample arguments to the configured endpoint

For the DofD demo, Strapi should later expose endpoints that match those connector contracts. Example endpoint names:

```text
POST /api/yoxa-tools/send-welcome-confirmation
POST /api/yoxa-tools/knowledge-base
```

Expected behavior:

1. Yoxa reaches a configured API Connector during a deployed workflow run.
2. Yoxa sends the connector's inferred request JSON to the configured Strapi endpoint.
3. If enabled, Yoxa may attach generated workflow output files according to connector configuration.
4. Strapi validates the connector API key header, for example `X-DofD-Yoxa-Tool-Key`.
5. Strapi performs a deterministic demo action or a real CMS/CRM/email operation.
6. Strapi returns a response shaped like the expected result guidance from the Yoxa test cases.
7. Yoxa records the tool response and continues the workflow.

Recommended phase-two data model additions:

- `yoxa-tool-invocation` collection or log table, optional but useful for demo visibility
- fields: `toolName`, `workflowRunId`, `requestPayload`, `responsePayload`, `status`, `errorSummary`, timestamps
- optional relation back to `dreamer-submission` when the request payload includes a submission ID or email

Do not expose these endpoints directly from the browser. They are server-to-server endpoints called by Yoxa.

## Implementation Guidance

- Prefer a Strapi controller/service implementation over putting all logic directly in lifecycle hooks.
- The controller should receive and validate the browser request.
- The service should own record creation, upload association, trigger text generation, Yoxa request, and result persistence.
- If lifecycle hooks are used, add a guard so updating Yoxa result fields does not trigger another Yoxa call.
- Keep Yoxa configuration in environment variables:

```sh
YOXA_TRIGGER_ENDPOINT=http://localhost:3000/api/v1/public/workflow-deployments/06650f00-2b49-413f-ac34-4537ada83213/trigger
YOXA_DEPLOYMENT_SECRET=replace-with-secret-from-yoxa
YOXA_TRIGGER_TEXT_PREFIX=Submitted external form
YOXA_TOOL_API_KEY=replace-with-a-demo-tool-api-key
```

- The static UI should submit to Strapi, not Yoxa:

```text
POST http://localhost:1337/api/dreamer-submissions/submit
```

- The Strapi server may then call Yoxa with Node's `fetch`/`FormData` support or the standard Strapi/Node-compatible HTTP approach selected by the future project.
- `YOXA_TOOL_API_KEY` is only needed once Strapi exposes endpoints for Yoxa API Connectors. Yoxa stores the connector secret in its deployment configuration and sends it to Strapi on tool calls.

## Security Requirements

- Never expose `YOXA_DEPLOYMENT_SECRET` to the browser.
- Never expose `YOXA_TOOL_API_KEY` to the browser.
- Never store the raw Yoxa secret in a Strapi content collection.
- Do not put Yoxa secrets in CMS-managed content or media.
- Store only sanitized Yoxa error details on the submission.
- Keep browser responses generic enough for a client-facing form.
- Tool connector endpoints must authenticate server-to-server calls before executing business logic.
- Tool connector endpoint errors should be sanitized and deterministic enough for Yoxa workflow logs.
- For local demos, allow developer console logs, but make them easy to remove for a client demo.

## Test Plan

Happy path:

- Static UI posts all fields and one file to Strapi.
- Strapi creates a `dreamer-submission` record in SQLite.
- Uploaded file is stored and associated with the record.
- Strapi calls Yoxa BFF with multipart `trigger_text` and `file`.
- Yoxa returns `accepted`, `workflow_run_id`, and `trigger_attempt_id`.
- Strapi stores the Yoxa acknowledgement IDs.
- Browser shows the DofD success acknowledgement.

Failure cases:

- Missing required text field rejects before Yoxa call.
- Missing supporting file rejects before Yoxa call.
- Missing `YOXA_DEPLOYMENT_SECRET` fails server-side with a sanitized browser message.
- Yoxa rejection/failure updates the Strapi record to `failed` and stores sanitized error details.
- Browser does not expose Yoxa endpoint, secret, stack trace, or private backend details.

Demo verification:

- In Strapi admin, the submission record is visible with original fields, uploaded file, and Yoxa status.
- In Yoxa Deployed Workflows monitoring, the trigger attempt and workflow run are visible.
- The Yoxa workflow run has the expected trigger text and file attachment.

Phase-two connector verification:

- In Yoxa API Connectors, each required simulated tool can be mapped to a Strapi endpoint.
- Yoxa Test Call succeeds with sample arguments derived from the expected request shape.
- Strapi records or logs the tool invocation.
- Yoxa displays the test result and later uses the same endpoint during a deployed workflow run.

## Assumptions

- DofD uses Strapi-like CMS infrastructure; the demo should model that with real Strapi and SQLite.
- The final demo will be moved outside this Yoxa monorepo.
- The current static form remains the visual reference.
- Yoxa should be called through the public web BFF route, not the private backend.
- The first standalone build can prioritize local demo correctness over production hosting hardening.
- The first standalone build should finish the trigger flow before implementing tool connector endpoints.
- Tool connector endpoint contracts should be driven by the Yoxa API Connectors screen for the selected deployed workflow version.
