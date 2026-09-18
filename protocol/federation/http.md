# Federation HTTP v0.1

Federation deliberately reuses the normal Spatial surface.

There is no separate duplicate feature API.

## Source discovery

Federated sources are returned through:

```http
GET /spatial/v1/sources
```

Their source descriptor contains a route with:

```text
kind = federated
upstreamInstanceId
accessMode
```

and route-effective capabilities.

## Reads

Reads use the normal Spatial Read links.

Delivery metadata identifies whether the response/view is live or cached.

## Writes

Writes use:

```http
POST /spatial/v1/operations
GET  /spatial/v1/operations/{operationId}
```

The federation provider may return `relay-durable` only if the route advertises `federation.durable-relay`.

## No credential pass-through endpoint

v0.1 intentionally defines no endpoint that returns or transports raw upstream passwords/tokens to clients.

Future delegated-user authorization may add explicit authorization links/metadata without changing the Spatial operation model.
