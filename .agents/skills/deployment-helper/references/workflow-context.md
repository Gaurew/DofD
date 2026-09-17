# Workflow Context

## Read the context as intent, not a contract

Use only the integration-relevant material in the copied context:

- the entry trigger and any later runtime gates;
- simulated-tool display name, call name, description, owner, and representative output;
- human approval tools, when present;
- generated output tools, when present.

Simulated-tool inputs are intentionally absent. They are defined later from the
external application's real API and the uploaded OpenAPI operation. Discover
them from source, schemas, and tests; do not ask the participant to reconstruct
design-time inputs.

Separate facts into three buckets before searching code:

| Bucket | Meaning |
| --- | --- |
| Workflow intent | What the workflow designer wants to achieve |
| Simulated example | A sandbox example; useful for hypothesis and test comparison only |
| Verified application contract | Route behavior proven from handler, schema/type, and ideally tests |

Do not infer a request parameter from a simulated response. For example, a returned `trip_id` does not prove the API accepts a `trip_id` input.

## Mapping process

1. Translate each tool into a short capability statement: actor, action, resource, and intended result.
2. Search the application for route handlers, API clients, request/response schemas, service methods, tests, and existing OpenAPI documents.
3. Compare the tool's business intent with each candidate operation:
   - operation effect: read, create, update, delete, or asynchronous request;
   - resource and ownership/auth context;
   - required inputs and whether the workflow can supply them;
   - successful response and whether it supplies what downstream workflow steps need.
4. Classify the result:
   - **strong match**: route and contract fit the intent;
   - **needs confirmation**: meaningful ambiguity or incomplete evidence;
   - **missing API**: no suitable single operation exists.

Present the mapping register in chat before generating files.

Treat the entry trigger as implementation intent. Its input mode determines
whether the external application will eventually send JSON text or a file, but
the cURL copied from Yoxa's Integration screen is the authoritative live
contract. Later-step triggers are runtime gates, not additional public workflow
start endpoints.

When human approval tools are present, plan for deployed HITL after API
Configuration and read [Deployed HITL integration](deployed-hitl-integration.md)
before implementing it. When generated output tools are present, consider
whether a later simulated-tool connector must receive their files and read the
attachment guidance in [API configuration](api-configuration.md).

## Improve weak workflow wording

When the code supports the intent but the Yoxa tool is unclear, offer an improvement instead of treating it as an error:

```text
Suggested tool description
Retrieve completed trip history for the authenticated user.

Suggested agent instruction
Use this tool only for questions about past completed trips. Do not use it to
plan, create, or change a trip.
```

When the workflow and code conflict, say which one is observed and ask a targeted question. Example: a workflow says "completed trips", but the only candidate route returns drafts too. Do not generate YAML until the participant confirms whether that behavior is acceptable.

## Missing API path

Explain the gap in plain language, propose the minimum application-owned API contract, and wait for explicit approval before modifying code. Prefer a small adapter endpoint if one workflow capability would otherwise require multiple service calls.

Do not propose an API based only on a tool name. Include the codebase evidence searched and the unresolved business decision.
