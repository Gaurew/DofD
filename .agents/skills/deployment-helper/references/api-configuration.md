# API Configuration

## Investigate before writing YAML

For each confirmed mapping, inspect the actual route handler and relevant tests. Establish:

- HTTP method and backend path;
- backend server origin reachable from Yoxa;
- path, query, header, and JSON-body fields the server reads;
- authentication scheme, if any;
- every real successful `2xx` status;
- complete successful JSON response envelope and schema.

Do not rely only on browser network traffic or UI labels. A frontend development server may proxy `/api/*` while the real service runs elsewhere.

## Produce one operation per file

Create one `.openapi.yml` or `.openapi.yaml` file for one confirmed simulated-tool mapping. If two tools map to two operations, create two files. Do not combine operations into a single file.

Before creating files, show the participant this compact confirmation:

```text
Ready to generate
- Get_trip_data → GET /api/trips → get-trip-data.openapi.yml
- Push_trip_data → POST /api/requests/{requestId}/plan → push-trip-data.openapi.yml
```

Write files after confirmation. Preserve the application's conventions; otherwise use a discoverable directory such as `yoxa/openapi/`.

## Reconcile an existing API before generating YAML

Whether the application API already exists or the participant has approved a
new adapter endpoint, always generate the YAML from the implemented route—not
from the workflow's simulated output or a generic OpenAPI exporter.

1. Read the route and tests, then identify the one operation that serves the
   simulated tool.
2. Start from the canonical skeleton in [Yoxa OpenAPI profile](yoxa-openapi-profile.md).
3. Copy only fields the route reads and the complete documented successful
   response envelope. Inline the schema or use safe internal components; do not
   carry over unrelated paths, security schemes, global parameters, callbacks,
   or provider-specific extensions.
4. If a prior generated file exists, compare it with the route. Update that
   file in place only when the route evidence changed or the old file violates
   the Yoxa profile. Do not create a duplicate document for the same simulated
   tool.
5. If the route's contract needs an unsupported shape, authentication method,
   or transport, propose the smallest compatible application-owned adapter.
   Wait for explicit approval before implementing it, then generate the YAML
   for the adapter instead.

This reconciliation is required for both a first API and an existing API. It
keeps connector uploads predictable while preserving the application's real
contract.

## Include exactly what Yoxa needs

Use [Yoxa OpenAPI profile](yoxa-openapi-profile.md) while authoring and validating.

Split the confirmed live URL into an origin and a path before writing YAML.
`servers[0].url` is only `https://host` (or `https://host:port`); it cannot
contain `/api`, `/v1`, `/functions/v1`, or any other path prefix. Put the full
remaining route into the single `paths` key. For example,
`https://project.supabase.co/functions/v1/update-case-status` becomes server
`https://project.supabase.co` and path `/functions/v1/update-case-status`.
Check this split explicitly before uploading; a public HTTPS endpoint with a
path in `servers[0].url` is rejected by Yoxa.

The generated file must use the actual server behavior, not the simulated output. Model the response envelope fully. If an endpoint returns `204`, document the successful `204` with no JSON content.

Authentication belongs in OpenAPI metadata, never in a parameter, example, or hard-coded header. If the route has Bearer or API-key authentication, describe the scheme and explain that the operator enters its value in Yoxa after upload. Do not declare `Authorization`, `X-API-Key`, or another credential-bearing header as an ordinary `parameters` item.

For nested JSON, declare `required` next to the `properties` at the same object
level. For example, `brief` belongs in the outer body's `required` list only if
the outer body has a `brief` property; `brief.details` is required inside
`brief`'s own object schema. Do not use dotted required names or make a parent
require one of its grandchildren.

## Explain the Yoxa-side next step

After creating the files, tell the participant:

1. Which simulated-tool connector receives each file.
2. Which request values Yoxa will ask the operator to provide during an API Connection Check, especially record IDs that cannot safely be invented.
3. Which fields should normally be agent input, fixed value, credential, or omitted.
4. Whether the API check can cause an external side effect.

Keep this explanation conversational. Do not create a report file.

## Generated output attachments

An output tool creates a file during a Yoxa workflow run. For a POST
simulated-tool connector, the participant can select output tools from the
current or an earlier step under **Attach output files**.

The external endpoint must accept both ordinary connector checks and live file
delivery:

| Execution | Request received by the external API |
| --- | --- |
| API Connection Check | Normal JSON or query request; no generated files |
| Workflow Test or activated run with no attachments selected | Normal JSON |
| Workflow Test or activated run with selected, generated attachments | `multipart/form-data` |
| Selected attachment is missing from that run | No external request; Yoxa returns a recoverable connector failure |

Attachment-bearing requests contain:

- each top-level constructed JSON-body property as a text form field;
- `arguments_json` with the complete constructed JSON request body;
- one repeated `files` part per generated file, including filename and content type.

String body values are sent directly. Structured values are JSON-encoded and
`null` is sent as an empty text value. Field names `arguments_json` and `files`
are reserved for the envelope. Path, query, header, and authentication mappings
still apply. Multiple files may be attached. The endpoint's response must still
match the successful response schema declared in OpenAPI.

When implementing or reviewing the receiver:

1. Accept both the ordinary JSON request and the attachment-bearing multipart request.
2. Register multipart parsing before reading body fields.
3. Accept repeated binary parts named exactly `files`.
4. Read ordinary text fields such as `summary`; parse `arguments_json` when the complete body is useful.
5. Do not require a file for API Connection Check.
6. Validate file count, size, filename handling, and allowed content types before persistence.
7. Verify with a complete Workflow Test that the received file is actually stored or processed.

Do not model these generated files as multipart or binary inputs in the
uploaded OpenAPI document. Keep the ordinary JSON operation there; Yoxa's
attachment envelope is a separate runtime transport convention. Because API
Connection Check has no workflow-generated files, verify file delivery with a
complete Workflow Test.

Current default limits are 10 files, 50 MiB per file, and 100 MiB total.

## Required validation before Integration

Generating and uploading OpenAPI files does not complete API Configuration. Tell the participant to run the workflow multiple times in Yoxa using representative inputs. They must verify that each connector calls the intended API, request-field mappings are correct, returned data is useful to the agent, the workflow completes as intended, and no connector is failed, stale, or awaiting review.

If any check fails, stay in API Configuration and repair the mapping. Only after the participant confirms reliable workflow runs should the skill direct them to Release → Integration.
