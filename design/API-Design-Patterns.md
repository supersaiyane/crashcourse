# API Design Patterns — A 2-Day Crash Course

Well-designed APIs are the contracts that hold distributed systems together — REST, gRPC, GraphQL, versioning, pagination, error handling done right separates systems that scale from ones that rot.

---

## Part 0 — Why This Matters

Bad APIs don't fail loudly. They accumulate. You ship a field name you later regret, and now every client in production depends on that name. You skip versioning, so the only upgrade path is a flag day that never quite lands. You return different error shapes from different endpoints, so every consumer writes custom parsing logic.

The cost is concrete:

- **Coupling** — consumers break when the producer changes internal logic
- **Breaking changes** — no versioning means clients are always one deploy away from failure
- **Frustration** — inconsistent behavior forces consumers to read source instead of docs
- **Security surface** — unauthenticated endpoints, unbounded queries, missing rate limits become incidents

Good API design is not aesthetics. It is operational hygiene. When you get it right, teams move faster because the contract is trusted.

---

## Vocabulary

**REST** — Representational State Transfer. An architectural style (not a protocol) that uses HTTP methods and resource URLs. Stateless, cacheable, uniform interface.

**gRPC** — Google Remote Procedure Call. Uses HTTP/2 and Protocol Buffers. Strongly typed, bidirectional streaming, low latency. Native to service-to-service communication.

**GraphQL** — A query language for APIs. Clients declare exactly what data they need. Single endpoint. Solves over-fetching and under-fetching at the cost of query complexity.

**OpenAPI / Swagger** — A specification format (YAML/JSON) for describing REST APIs. Machine-readable, generates docs and client SDKs.

**Versioning** — Making breaking changes without breaking existing consumers. Three main strategies: URL versioning (`/v1/`), header versioning (`Accept: application/vnd.api+json;version=2`), content-type negotiation.

**Pagination — cursor** — Clients receive an opaque token pointing to their position in the dataset. Stable under inserts/deletes. Preferred for large or live datasets.

**Pagination — offset** — Clients send `?offset=20&limit=10`. Simple, but drifts when rows are inserted mid-page. Acceptable for static datasets.

**Idempotency** — An operation is idempotent if calling it multiple times produces the same result as calling it once. GET is naturally idempotent. POST with an idempotency key becomes idempotent.

**Rate Limiting** — Capping how often a client can call an endpoint in a time window. Protects the server, prevents abuse.

**HATEOAS** — Hypermedia As The Engine Of Application State. REST responses include links to valid next actions. Rarely implemented fully, but the principle (self-describing responses) is worth knowing.

**Proto / protobuf** — Protocol Buffers. Google's IDL for defining strongly typed messages. Compiled to code in many languages. Used by gRPC.

---

## Day 1 — REST Done Right

### Resource Design

Think nouns, not verbs. Resources are things, not actions.

```
# Wrong — verb-based
POST /createUser
GET  /getUserById?id=42
POST /deleteUser

# Right — noun-based, HTTP method carries the verb
POST   /users
GET    /users/42
DELETE /users/42
```

Nest resources when the child only makes sense in the context of the parent:

```
GET  /users/42/addresses
POST /users/42/addresses
GET  /users/42/addresses/7
```

Avoid deep nesting beyond two levels. `/users/42/addresses/7/coordinates` is a sign you need a flatter design or a separate resource.

Use plural nouns consistently. `/users`, `/orders`, `/products` — never mix `/user` and `/orders`.

### HTTP Methods

| Method | Purpose | Idempotent | Safe |
|--------|---------|-----------|------|
| GET | Retrieve | Yes | Yes |
| POST | Create | No | No |
| PUT | Replace (full) | Yes | No |
| PATCH | Partial update | No (can be) | No |
| DELETE | Remove | Yes | No |

PUT replaces the entire resource. PATCH updates only the fields you send. Use PATCH for partial updates — it is more precise and less error-prone.

### Status Codes

Use them correctly. Consumers parse these.

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST that creates a resource |
| 204 | No Content | Successful DELETE, or action with no body |
| 400 | Bad Request | Validation failure, malformed input |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Authenticated but not allowed |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Duplicate, version mismatch |
| 422 | Unprocessable Entity | Semantically invalid input |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side failure |
| 503 | Service Unavailable | Downstream dependency down |

⚠️ Never return 200 with an error body. Consumers should not have to parse the body to detect failure.

### Error Format

Pick a format and use it everywhere. RFC 7807 (Problem Details) is a solid baseline:

```json
{
  "type": "https://example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "The 'email' field must be a valid email address.",
  "instance": "/users",
  "errors": [
    { "field": "email", "message": "Invalid format" },
    { "field": "age", "message": "Must be >= 18" }
  ]
}
```

The `type` is a URI — it uniquely identifies the error class and can point to documentation. The `instance` is the request path. `errors` is an array so you can surface multiple validation failures in one response.

### Pagination

Always paginate list endpoints. Returning unbounded lists is an incident waiting to happen.

**Offset pagination:**

```
GET /users?offset=0&limit=20

{
  "data": [...],
  "pagination": {
    "total": 243,
    "offset": 0,
    "limit": 20
  }
}
```

**Cursor pagination:**

```
GET /users?cursor=eyJpZCI6NDJ9&limit=20

{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6NjJ9",
    "has_more": true
  }
}
```

Cursor is preferred when the dataset changes frequently. The cursor encodes the position (often base64-encoded), not a page number, so it survives inserts.

### Filtering and Sorting

Use query parameters:

```
GET /users?status=active&role=admin
GET /orders?created_after=2025-01-01&created_before=2025-06-01
GET /products?sort=price&order=asc
```

Be explicit about which fields are filterable and sortable. Documenting this in OpenAPI prevents consumer guesswork.

### Authentication Patterns

**Bearer tokens (JWT or opaque):**

```
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
```

Standard for most APIs. Short-lived access tokens, longer-lived refresh tokens.

**API keys:**

```
X-API-Key: sk_live_abc123
```

Good for machine-to-machine. Simpler, but no built-in expiry — requires rotation.

**OAuth 2.0:**

Use when you need delegated authorization — allowing a third party to act on a user's behalf. Complex to implement, but it is the right tool for that problem.

Never put credentials in URLs. They end up in logs, browser history, and referrer headers.

### Request/Response Design

- Use `application/json` consistently
- Return the created or updated resource in the response body — do not make the consumer do a follow-up GET
- Use ISO 8601 for dates: `2025-06-01T14:30:00Z`
- Use consistent field naming — `snake_case` is conventional for JSON APIs
- Never change a field's type once published — adding fields is safe, changing types breaks consumers

---

## Day 2 — Beyond REST

### gRPC — When and Why

gRPC makes sense when:

- You control both client and server (internal service-to-service)
- You need high throughput and low latency
- You need bidirectional streaming
- Strong typing and contract enforcement matter more than human readability

gRPC uses Protocol Buffers. You define your service in a `.proto` file:

```proto
syntax = "proto3";

service UserService {
  rpc GetUser (GetUserRequest) returns (User);
  rpc ListUsers (ListUsersRequest) returns (stream User);
  rpc CreateUser (CreateUserRequest) returns (User);
}

message User {
  int64 id = 1;
  string email = 2;
  string name = 3;
}
```

The toolchain generates typed client and server stubs. The wire format is binary — smaller and faster than JSON but not human-readable without tooling.

gRPC is not the default choice for public-facing APIs. Browsers cannot call gRPC directly without a proxy (gRPC-Web). REST is still the right choice for external APIs.

### GraphQL — When and Why

GraphQL makes sense when:

- You have diverse clients (web, mobile, partners) with different data needs
- Over-fetching is a real problem — mobile clients don't need 40-field user objects
- Your data model is graph-shaped and consumers need flexible traversal
- You have a stable enough schema to absorb the tooling overhead

GraphQL replaces multiple REST endpoints with a single endpoint. Clients describe exactly what they want:

```graphql
query {
  user(id: "42") {
    id
    name
    orders(last: 5) {
      id
      total
      status
    }
  }
}
```

The cost: query complexity, N+1 query problems (mitigated with DataLoader), schema versioning complexity, and a steeper learning curve for operations teams.

GraphQL is not always better than REST. If your clients have uniform data needs, REST is simpler and more cacheable.

### API Versioning Strategies

**URL versioning** — most common, most explicit:

```
/v1/users
/v2/users
```

Consumers know exactly what they are calling. The tradeoff is that you maintain multiple route trees.

**Header versioning:**

```
Accept: application/vnd.myapi+json;version=2
```

Cleaner URLs, but less discoverable. Clients have to know to set the header.

**Content-type negotiation:**

```
Accept: application/vnd.myapi.v2+json
```

Similar to header versioning. Follows HTTP semantics closely.

The practical advice: use URL versioning for public APIs. It is the most visible and easiest to route at the infrastructure level (load balancer, CDN, gateway). Use header versioning for internal APIs where you control the clients.

Regardless of strategy — never make a breaking change without a new version, and never delete a version without a documented deprecation timeline.

### Idempotency Keys

POST is not idempotent by default. Networks are unreliable. If a client retries a POST, you may create duplicates.

The solution: idempotency keys. The client generates a unique key per logical operation and sends it as a header:

```
POST /payments
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

The server stores the key and the response. On a retry with the same key, the server returns the cached response without re-executing the operation.

Stripe does this for all payment mutations. It is the right pattern for any operation where duplicates cause harm — payments, email sends, order creation.

Store idempotency keys with a TTL (24–48 hours is typical). After expiry, reuse of the key triggers a fresh execution.

### Rate Limiting Design

Rate limiting belongs at the API gateway or a middleware layer, not deep in business logic.

Common algorithms:

- **Token bucket** — each client has a bucket with a fixed capacity. Requests consume tokens. Tokens refill at a constant rate. Allows bursting up to bucket size.
- **Fixed window** — count requests in a fixed time window (e.g., 100/minute). Simple, but susceptible to burst at window boundaries.
- **Sliding window** — smoother than fixed window. Counts requests in a rolling interval.

What to return when a client is rate-limited:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1748700000
```

Always return `Retry-After` so well-behaved clients can back off correctly.

Rate limit by API key or user ID, not by IP. IP-based limiting breaks behind NAT.

### OpenAPI Spec

An OpenAPI spec is machine-readable documentation that stays in sync with your API. Generate it from code annotations or write it alongside your code — but treat it as a first-class artifact, not an afterthought.

A minimal OpenAPI 3.1 skeleton:

```yaml
openapi: 3.1.0
info:
  title: User API
  version: 1.0.0
  description: Manages users and their associated data

servers:
  - url: https://api.example.com/v1

paths:
  /users:
    get:
      summary: List users
      operationId: listUsers
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
        - name: cursor
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Paginated list of users
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserList'
    post:
      summary: Create a user
      operationId: createUser
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '400':
          $ref: '#/components/responses/BadRequest'

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: integer
          format: int64
        email:
          type: string
          format: email
        name:
          type: string
        created_at:
          type: string
          format: date-time
      required: [id, email, name, created_at]

  responses:
    BadRequest:
      description: Validation failed
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
```

### Backward Compatibility

Additive changes are safe:

- Adding a new field to a response
- Adding a new optional query parameter
- Adding a new endpoint
- Adding a new enum value (⚠️ be careful — clients may switch on enums exhaustively)

Breaking changes that require a version bump:

- Removing a field from a response
- Renaming a field
- Changing a field's type
- Changing the meaning of a field
- Making a previously optional field required
- Changing a status code for an existing error condition

When you deprecate something, say so explicitly. Add a `Deprecation` header or a `deprecated: true` flag in your OpenAPI spec. Set a sunset date and communicate it.

### REST vs gRPC vs GraphQL — Decision Tree

```
Is this a public-facing API?
├── Yes → REST (+ OpenAPI)
└── No (internal service-to-service)
    ├── Need streaming or very high throughput? → gRPC
    └── Otherwise → REST is still fine; gRPC if typing/perf matters

Do you have highly varied client data needs (mobile vs web vs partners)?
├── Yes, and query complexity is worth it → GraphQL
└── No, uniform data needs → REST

Do you need real-time bidirectional communication?
├── Yes → gRPC streaming or WebSockets
└── No → REST
```

---

## Worked Example — User Management API

You are designing a user management API. Here is how to apply everything above.

### Resources

```
/users              — collection
/users/{id}         — individual user
/users/{id}/roles   — roles belonging to a user
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /users | List users (paginated, filterable) |
| POST | /users | Create a user |
| GET | /users/{id} | Get a specific user |
| PUT | /users/{id} | Replace a user |
| PATCH | /users/{id} | Partial update |
| DELETE | /users/{id} | Delete a user |
| GET | /users/{id}/roles | List roles for a user |
| POST | /users/{id}/roles | Assign a role |
| DELETE | /users/{id}/roles/{roleId} | Remove a role |

### Request: Create User

```http
POST /v1/users HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

{
  "email": "alice@example.com",
  "name": "Alice Chen",
  "role": "viewer"
}
```

### Response: 201 Created

```http
HTTP/1.1 201 Created
Content-Type: application/json
Location: /v1/users/42

{
  "id": 42,
  "email": "alice@example.com",
  "name": "Alice Chen",
  "role": "viewer",
  "created_at": "2025-06-01T14:30:00Z",
  "updated_at": "2025-06-01T14:30:00Z"
}
```

### Response: Validation Error

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{
  "type": "https://api.example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "One or more fields failed validation.",
  "instance": "/v1/users",
  "errors": [
    { "field": "email", "message": "Must be a valid email address" }
  ]
}
```

### List with Cursor Pagination

```http
GET /v1/users?limit=20&cursor=eyJpZCI6MjB9&status=active HTTP/1.1
Authorization: Bearer <token>

HTTP/1.1 200 OK

{
  "data": [
    { "id": 21, "email": "bob@example.com", "name": "Bob", ... },
    ...
  ],
  "pagination": {
    "next_cursor": "eyJpZCI6NDB9",
    "has_more": true,
    "limit": 20
  }
}
```

---

## Pitfalls

**Returning 200 for errors.** Your consumer should not parse a body to detect failure. Use the correct status code.

**Not versioning from day one.** You will make a breaking change. Version from the first public release. It costs nothing to add `v1` now and saves a migration later.

**Leaking internal structure.** Your API should reflect your domain, not your database schema. Exposing table column names, internal IDs, or implementation details creates coupling you cannot escape.

**No idempotency on mutation endpoints.** Retry logic is standard in distributed systems. Without idempotency keys, retries create duplicates.

**Unbounded list endpoints.** A request that returns 100,000 rows will eventually arrive. Always set a maximum page size and enforce it server-side.

**Inconsistent error shapes.** Consumers write parsing logic for every error format they encounter. One format, used everywhere, saves everyone time.

**Skipping authentication on internal endpoints.** Internal does not mean safe. Service-to-service calls should authenticate. mTLS or API keys — pick one.

**Breaking changes without a version bump.** Removing or renaming a field in a v1 response breaks every consumer of v1. Even if you control the only consumer, treat breaking changes as a forcing function for discipline.

**Over-nesting resources.** `/organizations/{orgId}/teams/{teamId}/members/{memberId}/permissions/{permId}` — each level of nesting adds coupling and makes URL construction fragile. Flatten where possible.

**Ignoring rate limiting until you have an incident.** Add rate limiting headers from day one, even if the limit is generous. It is far easier to tighten limits than to add the infrastructure after production abuse.

---

## Quick Reference

### REST Conventions

```
GET    /resources              → list
POST   /resources              → create
GET    /resources/{id}         → get one
PUT    /resources/{id}         → replace
PATCH  /resources/{id}         → partial update
DELETE /resources/{id}         → delete
```

Use plural nouns. Never verbs in paths. Query params for filtering, sorting, pagination.

### Status Codes

```
200 OK              → success (GET, PUT, PATCH)
201 Created         → success (POST)
204 No Content      → success, no body (DELETE)
400 Bad Request     → validation failure
401 Unauthorized    → not authenticated
403 Forbidden       → authenticated, not authorized
404 Not Found       → resource missing
409 Conflict        → duplicate or state conflict
422 Unprocessable   → semantic validation failure
429 Too Many Requests → rate limited
500 Internal Error  → server fault
503 Unavailable     → dependency down
```

### OpenAPI Skeleton

```yaml
openapi: 3.1.0
info:
  title: <Your API>
  version: 1.0.0
servers:
  - url: https://api.example.com/v1
paths:
  /resources:
    get:
      summary: List resources
      parameters: [...]
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ResourceList'
    post:
      summary: Create resource
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateResourceRequest'
      responses:
        '201':
          description: Created
components:
  schemas: {}
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
security:
  - bearerAuth: []
```

---

## Next Steps

- `HTTP.md` — HTTP/1.1, HTTP/2, headers, caching, TLS — the transport layer your API runs on
- `Microservices-Patterns.md` — service discovery, circuit breakers, sagas — what happens when you have 50 APIs talking to each other
- `HLD.md` — high-level design interviews and system design — how API design fits into larger architecture decisions

---

## The Mantra

> Design for the consumer, not the implementation. The API surface is a promise — once published, you own it.
