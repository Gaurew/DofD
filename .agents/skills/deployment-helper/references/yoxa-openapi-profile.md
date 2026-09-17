# Yoxa OpenAPI Profile

Use this profile when generating or reviewing a connector document.

## Required document shape

- OpenAPI version: `3.1.0`.
- One UTF-8 `.yml` or `.yaml` document.
- Exactly one absolute `servers[0].url`, with no variables.
- Exactly one path operation with a non-empty, stable `operationId`.
- One of `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`.
- No request body, or exactly one `application/json` request body.
- At least one documented successful `2xx` response.

`operationId` is an operation label, not a value the Yoxa user enters. For example, use `listTrips`, not a live request ID such as `90374596hsdifsi`.

`servers[0].url` must be the concrete **origin only**: scheme and host (and
an optional port), with no path. Put every path segment—API version prefixes,
provider function prefixes, and the operation route—in the `paths` key. Yoxa
combines the origin and path itself.

Valid:

```yaml
servers:
  - url: https://api.client.example
```

For example, a Supabase Edge Function at
`https://project-ref.supabase.co/functions/v1/update-case-status` must be
written as:

```yaml
servers:
  - url: https://project-ref.supabase.co
paths:
  /functions/v1/update-case-status:
    post: {}
```

Invalid because `servers[0].url` contains a path, even though the final URL is
otherwise public HTTPS:

```yaml
servers:
  - url: https://project-ref.supabase.co/functions/v1
paths:
  /update-case-status:
    post: {}
```

Invalid because it leaves the destination variable:

```yaml
servers:
  - url: https://{tenant}.api.client.example
```

Use a locally reachable HTTP server only in local/development Yoxa environments. Staging and production require a public HTTPS API origin.

## Inputs and responses

- Put path placeholders in required `in: path` parameters with exactly matching names.
- Include only request fields the backend actually reads.
- Do not add an empty JSON body when the route does not read one.
- Use useful request-field descriptions; Yoxa exposes them to the operator and workflow agent.
- Preserve the complete successful response envelope, nesting, types, nullability, requiredness, and arrays.
- Document every actual success status. Do not use a generic `{ type: object }` response.
- A `204` response has no JSON content.

The successful response schema is an execution contract: Yoxa validates live connector results against it and returns the validated result to the workflow agent. It is not only modal display data.

## Supported and unsupported features

Supported:

- path, query, and header parameters;
- JSON request bodies;
- no authentication, HTTP Bearer, or one header API key;
- internal component references such as `#/components/schemas/Trip`;
- bounded nested objects, arrays, typed maps, enums, standard constraints, nullable unions, and compatible object `allOf`.

Unsupported:

- server variables, remote/file/cyclic references, recursive schemas;
- user-defined multipart or file inputs, form encoding, cookies, XML;
- OAuth/OIDC, Basic auth, callbacks, webhooks, links, scripts, custom serialization, or shape-changing unions.

An internal `$ref` may have only `title` or `description` siblings. Do not put constraint siblings beside it.

This OpenAPI restriction does not prohibit Yoxa-managed generated-output
attachments. Those use a separate runtime multipart envelope described in
[API configuration](api-configuration.md); keep the uploaded operation's
ordinary JSON request schema.

## Authentication pattern

For Bearer auth, declare the method without the secret:

```yaml
components:
  securitySchemes:
    clientApiBearer:
      type: http
      scheme: bearer
security:
  - clientApiBearer: []
```

Tell the participant to enter the token in Yoxa's connector configuration after upload. Never put it in YAML, a generated code file, a command, or an example.

Do not model credentials as ordinary header parameters. In particular, omit
`Authorization`, `X-API-Key`, and equivalent secret-bearing headers from
`parameters`. Use one security scheme and one requirement instead. Ordinary,
non-secret headers are supported only when the route truly reads them.

## Canonical connector skeleton

Start every generated connector from this shape and fill it from application
source and tests. Remove the request body entirely for an endpoint that does
not read JSON. Add `components` only when a schema or security scheme needs it.

```yaml
openapi: 3.1.0
info:
  title: <stable connector title>
  version: 1.0.0
servers:
  - url: https://api.client.example
paths:
  /v1/resources/{resource_id}:
    post:
      operationId: updateResource
      summary: Update one resource
      parameters:
        - name: resource_id
          in: path
          required: true
          description: Resource to update.
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              additionalProperties: false
              required: [brief]
              properties:
                brief:
                  type: object
                  additionalProperties: false
                  required: [summary, details]
                  properties:
                    summary:
                      type: string
                    details:
                      type: string
      responses:
        '200':
          description: Updated resource.
          content:
            application/json:
              schema:
                type: object
                additionalProperties: false
                required: [id, status]
                properties:
                  id:
                    type: string
                  status:
                    type: string
```

The requiredness rule is local: each object may require only names declared in
its own `properties`. In the example, the body requires `brief`; the `brief`
object, not the body, requires `summary` and `details`. This avoids invalid
nested contracts such as `required: [brief, details]` when `details` exists
only inside `brief`.

If the API requires Bearer authentication, add this to the skeleton without a
token value:

```yaml
components:
  securitySchemes:
    clientApiBearer:
      type: http
      scheme: bearer
security:
  - clientApiBearer: []
```

For a header API key, use `type: apiKey`, `in: header`, and the actual header
`name`; still omit its value. Do not combine authentication schemes.

## Final check

Validate YAML syntax and verify every profile rule above. Then compare method, path, request fields, success status, and response shape against the backend source and tests one final time. For an existing connector, update its one generated file in place and repeat this check before re-uploading.
