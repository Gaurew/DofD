# DofD Strapi + Yoxa Demo

This demo shows how a Democracy of Dreams-owned CMS/backend can accept a public Dreamer onboarding form, persist the submission, privately trigger a Yoxa workflow, and display workflow activity back inside Strapi.

The key integration boundary is intentional: the browser talks only to Strapi. Strapi owns validation, persistence, uploads, Yoxa secrets, workflow triggering, and the callback endpoint that receives generated Yoxa output.

## Demo Purpose

The demo is built to show a production-shaped client integration in a lightweight local setup:

- A simple DofD form collects Dreamer/startup information and a supporting file.
- Strapi stores the submission in SQLite and exposes it in Content Manager plus a custom DofD Review dashboard.
- Strapi triggers the deployed Yoxa workflow from server-side code.
- Yoxa can call back into Strapi with generated workflow reports.
- Strapi becomes the client-visible review console for submissions, trigger status, report files, timeline events, and final approve/reject decisions.

## Architecture

```text
frontend/  Static HTML/CSS DofD form
backend/   Strapi 5 TypeScript app with SQLite
scripts/   Local dev server and API test helpers
```

Local services:

```text
http://localhost:5177  Static DofD form
http://localhost:1337  Strapi admin/API
http://localhost:3000  Yoxa web app/BFF trigger route
```

Runtime flow:

```text
Dreamer form
  -> POST /api/dreamer-submissions/submit
  -> Strapi creates Dreamer Submission + upload
  -> Strapi sends multipart trigger_text + file to Yoxa
  -> Yoxa queues/runs workflow
  -> Yoxa calls POST /api/yoxa-tools/reports
  -> Strapi stores Workflow Report + timeline event
  -> Reviewer approves or rejects in DofD Review dashboard
```

## Environment

Configure `backend/.env`. This file is local-only and ignored by git.

Required Yoxa values:

```sh
YOXA_TRIGGER_ENDPOINT=http://localhost:3000/api/v1/public/workflow-deployments/<deployment-id>/trigger
YOXA_DEPLOYMENT_SECRET=<secret-from-yoxa>
YOXA_TRIGGER_TEXT_PREFIX=Submitted external form
```

SQLite defaults:

```sh
DATABASE_CLIENT=sqlite
DATABASE_FILENAME=.tmp/data.db
```

Connector callbacks are intentionally unauthenticated for this local demo. `YOXA_TOOL_API_KEY` is reserved for adding connector auth later.

## Install

Install the Strapi backend dependencies:

```sh
npm --prefix backend install
```

The root scripts use Node built-ins, so the root project does not need a separate dependency install.

## Run

Start the frontend and backend together:

```sh
npm run dev
```

Or run them separately:

```sh
npm run dev:frontend
npm run dev:backend
```

Open:

- Form: `http://localhost:5177`
- Strapi admin: `http://localhost:1337/admin`

On first Strapi start, create the admin account in the browser. Then use Content Manager to inspect:

- `Dreamer Submission`
- `Workflow Report`
- `Workflow Event`

The custom review dashboard is available from the Strapi sidebar as `DofD Review`.

## Demo Walkthrough

1. Start the Yoxa web app/BFF on `http://localhost:3000`.
2. Start this project with `npm run dev`.
3. Open the form at `http://localhost:5177`.
4. Complete the Dreamer form and attach a `.pdf`, `.doc`, `.docx`, `.txt`, or `.md` file.
5. Submit the form.
6. Open Strapi admin and go to `DofD Review`.
7. Select the new Dreamer Submission and review applicant details, workflow state, generated reports, and timeline events.
8. When Yoxa posts generated reports back to Strapi, confirm they appear as clickable report files.
9. Record the final reviewer decision with `Approve` or `Reject`.

The public form shows only a friendly success or failure message. Yoxa internals stay in Strapi/developer tooling.

## API Surface

Form submission:

```text
POST http://localhost:1337/api/dreamer-submissions/submit
```

Yoxa output callback:

```text
POST http://localhost:1337/api/yoxa-tools/workflow-output
```

Generated report upload:

```text
POST http://localhost:1337/api/yoxa-tools/reports
```

Generic callback payload:

```json
{
  "submissionId": "STRAPI_SUBMISSION_DOCUMENT_ID",
  "toolName": "workflow-output",
  "status": "completed",
  "summary": "Dreamer onboarding output generated.",
  "outputText": "Readable generated output from the workflow.",
  "outputJson": {
    "score": 87,
    "recommendation": "Invite to next step"
  },
  "workflowRunId": "optional-yoxa-run-id",
  "triggerAttemptId": "optional-yoxa-trigger-attempt-id",
  "payload": {
    "any": "additional connector payload"
  }
}
```

Example callback test:

```sh
curl -X POST http://localhost:1337/api/yoxa-tools/workflow-output \
  -H "Content-Type: application/json" \
  -d '{
    "submissionId": "replace-with-strapi-document-id",
    "toolName": "workflow-output",
    "status": "completed",
    "summary": "Demo generated output received.",
    "outputText": "The Yoxa workflow produced a demo onboarding summary.",
    "outputJson": {
      "score": 87,
      "recommendation": "Invite to the next Dreamer onboarding step."
    }
  }'
```

The callback creates a related Workflow Event and updates the submission to `output_received`. Error-like statuses such as `error`, `failed`, or `connector_error` update the submission to `connector_error`.

The report upload endpoint accepts `multipart/form-data`, requires `submissionId`, stores the first attached PDF or HTML file in Strapi Media Library, creates a Workflow Report, creates a Workflow Event, updates the submission to `reports_generated`, and returns:

```json
{
  "success": true,
  "message": "Upload Success",
  "submissionId": "strapi-submission-document-id",
  "reportId": "workflow-report-document-id",
  "fileName": "generated-report.pdf",
  "fileUrl": "/uploads/generated_report_hash.pdf",
  "eventId": "workflow-event-document-id"
}
```

Yoxa connector setup for each `Send Report to CRM` style tool:

```text
Method: POST
URL: http://host.docker.internal:1337/api/yoxa-tools/reports
Auth: None
Timeout seconds: 30
Attach generated output files: checked
Generated file: select the relevant report output
Request field: submissionId=<DofD Submission ID from trigger text/context>
Expected result guidance: Upload Success
```

Use a reachable tunnel URL instead of `localhost:1337` if the Yoxa backend is not running on the same machine/network as Strapi.

## API Tests

With Strapi running:

```sh
npm run test:api
```

This checks validation failures that should not call Yoxa.

To run the live Yoxa trigger test:

```sh
RUN_LIVE_YOXA_TEST=true npm run test:api
```

To test callback storage against an existing submission:

```sh
TEST_SUBMISSION_ID=<strapi-document-id> npm run test:api
```

## Security Notes

- Yoxa secrets live only in backend environment variables.
- The frontend never receives the Yoxa endpoint secret or calls Yoxa directly.
- CORS allows only `http://localhost:5177` and `http://127.0.0.1:5177`.
- The local connector callback is open for demo speed and should be protected before any hosted/client-facing deployment.
