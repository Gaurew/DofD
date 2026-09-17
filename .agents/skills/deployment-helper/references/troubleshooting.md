# Troubleshooting

Use terse, evidence-led diagnosis. Do not expose raw credentials, private URLs, or production response bodies.

## Mapping uncertainty

- **Several plausible APIs:** compare each against business intent, ownership, inputs, and response. Ask one targeted question.
- **No API:** propose the smallest adapter endpoint and wait for explicit approval before code changes.
- **Tool wording conflicts with code:** show a copy-ready tool-description and agent-instruction improvement. Do not silently change either.

## OpenAPI import failure

Check, in order:

1. one operation and one server URL only;
2. OpenAPI `3.1.0` and a non-empty `operationId`;
3. absolute static server URL, no variables;
4. authentication is declared with exactly one supported security scheme, with no secret or credential-bearing header parameter;
5. no unsupported body encoding, callbacks, external refs, or composition;
6. matching required path parameters;
7. every `required` list names properties on that exact object, including nested objects;
8. at least one documented `2xx` response with the exact successful JSON schema.

When correcting a file, rebuild the one-operation document from the canonical
Yoxa skeleton rather than trying to salvage a full application OpenAPI export.
Keep the endpoint behaviour unchanged unless the participant explicitly
approves an application change.

## API Connection Check failure

- **No status / immediate failure:** inspect required API-check values and request-field roles.
- **No status after elapsed time:** inspect Yoxa-to-API reachability, HTTPS, DNS, server binding, and environment topology.
- **HTTP status but schema invalid:** compare the actual successful envelope to the YAML; fix the YAML or application contract with evidence.
- **Authentication failure:** confirm that the YAML declares the correct supported scheme and the value was entered in Yoxa's connector UI, not in the YAML.

## Generated output attachment failure

- Do not use API Connection Check as evidence of file delivery; it has no workflow-generated files.
- Run a complete Workflow Test and verify the selected output tool executes before the connector.
- At the destination, confirm multipart middleware ran, then inspect ordinary text fields, `arguments_json`, and each repeated `files` part, including filename and content type.
- If the endpoint returns an ordinary success but leaves its record unchanged, verify it did not intentionally treat an empty `files` list as a Connection Check.
- If the destination receives no request, check whether the selected output tool produced a file in that same run and whether attachment limits were exceeded.

## Trigger integration failure

- Verify the code calls the exact copied endpoint and uses the exact required header names.
- Verify `YOXA_DEPLOYMENT_SECRET` is present only in the server/Edge Function secret store.
- Verify the client application's server-side seam authenticates and authorizes its user before triggering Yoxa.
- When IP restrictions are configured, verify the server's real outbound source is eligible. Do not guess managed-serverless egress IPs.
- If an idempotency header is required, generate a fresh key for a new event and reuse the same key only for retrying that exact event.
