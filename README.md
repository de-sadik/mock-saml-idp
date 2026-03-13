# mock-saml-idp

Modern mock SAML 2.0 Identity Provider for testing Azure AD, Okta, OneLogin, Auth0, Google Workspace, and PingFederate SSO integrations.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start — Built-in Server](#quick-start--built-in-server)
  - [CLI Usage](#cli-usage)
  - [Server Endpoints](#server-endpoints)
  - [Programmatic Server Usage](#programmatic-server-usage)
- [Core API — MockSamlIdp Class](#core-api--mocksamlidp-class)
  - [Creating an IdP Instance](#creating-an-idp-instance)
  - [Generating a Key Pair](#generating-a-key-pair)
  - [Metadata](#metadata)
  - [Parsing Incoming SAML Requests](#parsing-incoming-saml-requests)
  - [Creating AuthnResponses](#creating-authnresponses)
  - [Creating LogoutResponses](#creating-logoutresponses)
- [Provider-Specific Helpers](#provider-specific-helpers)
  - [Azure AD](#azure-ad)
  - [Okta](#okta)
  - [OneLogin](#onelogin)
  - [Auth0](#auth0)
  - [Google Workspace](#google-workspace)
  - [PingFederate](#pingfederate)
- [Configuration Reference](#configuration-reference)
  - [IdpConfig](#idpconfig)
  - [SamlUser](#samluser)
  - [ServerOptions](#serveroptions)
- [Advanced Usage](#advanced-usage)
  - [Custom Attributes](#custom-attributes)
  - [Simulating Authentication Failures](#simulating-authentication-failures)
  - [HTTP Bindings](#http-bindings)
  - [Testing with Jest / Vitest](#testing-with-jest--vitest)
- [Deploying for Remote Access](#deploying-for-remote-access)
  - [Bind to All Interfaces](#bind-to-all-interfaces)
  - [Docker](#docker)
  - [Cloud Platforms](#cloud-platforms)
  - [Behind a Reverse Proxy or Load Balancer](#behind-a-reverse-proxy-or-load-balancer)
- [Using in UAT & Testing Environments](#using-in-uat--testing-environments)
  - [Manual & UAT Testing with the Built-in UI](#manual--uat-testing-with-the-built-in-ui)
  - [Automated Integration Testing](#automated-integration-testing)
  - [Persistent UAT Setup](#persistent-uat-setup)
- [TypeScript Types](#typescript-types)
- [License](#license)

---

## Features

- 🔐 Full SAML 2.0 IdP implementation — signed assertions and/or responses
- 🌐 Built-in HTTP server with a web UI for interactive manual testing
- 🧰 Provider presets for **Azure AD**, **Okta**, **OneLogin**, **Auth0**, **Google Workspace**, and **PingFederate**
- 📦 Programmatic API for automated testing with Jest, Vitest, Mocha, etc.
- 🔑 Automatic RSA key-pair generation (no pre-generated certificates required)
- 🔄 Supports both **HTTP-POST** and **HTTP-Redirect** SAML bindings
- 💬 Configurable NameID formats, signature algorithms, and attribute mappings
- 🚫 No git-based dependencies — all dependencies are published npm packages

---

## Installation

```bash
npm install --save-dev mock-saml-idp
# or
yarn add --dev mock-saml-idp
# or
pnpm add --save-dev mock-saml-idp
```

---

## Quick Start — Built-in Server

### CLI Usage

The package ships with a standalone HTTP server that you can start immediately for manual testing:

```bash
# Start on the default port (http://localhost:7000)
npx mock-saml-idp

# Custom port and host
PORT=8080 HOST=0.0.0.0 npx mock-saml-idp
```

Open your browser at `http://localhost:7000` to see the IdP landing page with:

- The IdP Entity ID, SSO URL, SLO URL, and Metadata URL
- The auto-generated X.509 certificate
- A test form for sending a SAML response directly to any SP ACS URL

### Server Endpoints

| Endpoint        | Method          | Description                                                    |
|-----------------|-----------------|----------------------------------------------------------------|
| `/`             | `GET`           | Landing page with IdP configuration and SP-initiated test form |
| `/metadata`     | `GET`           | SAML 2.0 IdP metadata XML                                      |
| `/sso`          | `GET`           | SSO endpoint — HTTP-Redirect binding (receives `SAMLRequest`)  |
| `/sso`          | `POST`          | SSO endpoint — HTTP-POST binding (receives `SAMLRequest`)      |
| `/sso/response` | `POST`          | Internal — processes the login form and posts SAMLResponse     |
| `/sso/test`     | `POST`          | Direct SP test — sends SAMLResponse without an AuthnRequest    |
| `/slo`          | `GET` / `POST`  | Single Logout endpoint                                         |

### Programmatic Server Usage

Use `startServer()` when you want to spin up the IdP inside automated tests or CI pipelines:

```typescript
import { startServer } from 'mock-saml-idp';

const { url, idp, close } = await startServer({
  port: 7000,          // optional — defaults to 7000
  host: 'localhost',   // optional — defaults to 'localhost'
  defaultUser: {
    nameId: 'testuser@example.com',
    firstName: 'Test',
    lastName: 'User',
  },
});

console.log(`IdP running at ${url}`);
// url      — base URL of the running server, e.g. "http://localhost:7000"
// idp      — MockSamlIdp instance (for programmatic response generation)
// close()  — async function to shut down the server

await close();
```

Pass `port: 0` to let the OS pick a free port automatically — useful when running tests in parallel:

```typescript
const { url, close } = await startServer({ port: 0 });
// url will be something like "http://localhost:54321"
```

You can also override `idpConfig` to customise the IdP behaviour:

```typescript
import { startServer, generateKeyPair } from 'mock-saml-idp';

const { privateKey, certificate } = generateKeyPair();

const { url, idp, close } = await startServer({
  idpConfig: {
    entityId: 'https://my-idp.example.com/saml',
    privateKey,
    certificate,
    signResponse: true,
    signAssertion: true,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  },
});
```

---

## Core API — MockSamlIdp Class

Use `MockSamlIdp` directly when you need full control over request parsing and response generation without running a server.

### Creating an IdP Instance

```typescript
import { MockSamlIdp, generateKeyPair } from 'mock-saml-idp';

const { privateKey, certificate } = generateKeyPair();

const idp = new MockSamlIdp({
  entityId: 'https://my-idp.example.com/saml',
  privateKey,
  certificate,
  ssoUrl: 'https://my-idp.example.com/saml/sso',
  sloUrl: 'https://my-idp.example.com/saml/slo',
  signAssertion: true,   // default: true
  signResponse: false,   // default: false
});
```

### Generating a Key Pair

`generateKeyPair()` creates a self-signed RSA 2048-bit certificate suitable for testing:

```typescript
import { generateKeyPair } from 'mock-saml-idp';

const { privateKey, certificate } = generateKeyPair();
// privateKey   — PEM-encoded RSA private key
// certificate  — PEM-encoded X.509 self-signed certificate
```

You can also bring your own PEM-encoded key and certificate if you prefer.

### Metadata

Retrieve the IdP SAML 2.0 metadata XML to configure your Service Provider:

```typescript
const metadataXml = idp.getMetadata();

// With optional parameters
const metadataXml = idp.getMetadata({
  wantAuthnRequestsSigned: false,
  validUntil: new Date('2030-01-01'),
  cacheDuration: 'PT1H',
});
```

Point your SP to `http://localhost:7000/metadata` (when using the built-in server) or paste the XML directly.

### Parsing Incoming SAML Requests

#### AuthnRequest

```typescript
import { MockSamlIdp } from 'mock-saml-idp';

// HTTP-Redirect binding (SAMLRequest query parameter, deflate-compressed + base64)
const parsed = idp.parseAuthnRequest(
  req.query.SAMLRequest,
  'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
);

// HTTP-POST binding (SAMLRequest body field, plain base64)
const parsed = idp.parseAuthnRequest(
  req.body.SAMLRequest,
  'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
);

console.log(parsed.id);        // request ID — use as inResponseTo
console.log(parsed.issuer);    // SP Entity ID
console.log(parsed.acsUrl);    // Assertion Consumer Service URL
```

#### LogoutRequest

```typescript
const parsed = idp.parseLogoutRequest(
  req.query.SAMLRequest,
  'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
);

console.log(parsed.nameId);       // user being logged out
console.log(parsed.sessionIndex); // session to terminate
```

### Creating AuthnResponses

#### HTTP-POST binding (most common)

```typescript
const response = idp.createPostResponse({
  user: {
    nameId: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    groups: ['engineers', 'admins'],
    attributes: {
      department: 'Engineering',
      employeeId: 'EMP-001',
    },
  },
  spEntityId: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
  inResponseTo: parsed.id,   // ID from the AuthnRequest
  relayState: '/dashboard',
});

// response.type        — 'POST'
// response.url         — ACS URL
// response.samlResponse — base64-encoded SAMLResponse
// response.relayState  — echoed relay state
```

#### HTTP-Redirect binding

```typescript
const response = idp.createRedirectResponse({
  user: { nameId: 'alice@example.com' },
  spEntityId: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
  inResponseTo: parsed.id,
});

// response.url — full redirect URL with SAMLResponse query parameter
// redirect the user's browser to response.url
```

#### Raw XML

```typescript
const xml = idp.createAuthnResponseXml({
  user: { nameId: 'alice@example.com' },
  spEntityId: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
});
// xml — signed SAML assertion XML string
```

### Creating LogoutResponses

```typescript
// HTTP-POST
const response = idp.createPostLogoutResponse({
  nameId: 'alice@example.com',
  sessionIndex: '_session123',
  inResponseTo: parsed.id,
});

// HTTP-Redirect
const response = idp.createRedirectLogoutResponse({
  nameId: 'alice@example.com',
  inResponseTo: parsed.id,
  relayState: '/login',
});
```

---

## Provider-Specific Helpers

Each provider subclass applies the correct default settings (NameID format, signing flags, attribute names) for its corresponding identity service, so you don't have to look them up.

### Azure AD

```typescript
import { AzureAdProvider, AZURE_AD_CLAIM_URIS, generateKeyPair } from 'mock-saml-idp';

const { privateKey, certificate } = generateKeyPair();

const idp = AzureAdProvider.create({
  entityId: 'https://my-idp.example.com/saml',
  privateKey,
  certificate,
});

// Use Azure AD claim URIs as attribute names
const response = idp.createPostResponse({
  user: {
    nameId: 'alice@example.com',
    attributes: {
      [AZURE_AD_CLAIM_URIS.email]:       'alice@example.com',
      [AZURE_AD_CLAIM_URIS.givenName]:   'Alice',
      [AZURE_AD_CLAIM_URIS.surname]:     'Smith',
      [AZURE_AD_CLAIM_URIS.displayName]: 'Alice Smith',
      [AZURE_AD_CLAIM_URIS.objectId]:    'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    },
  },
  spEntityId: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
});
```

**Azure AD defaults:** `signAssertion: true`, `signResponse: false`, emailAddress NameID format.

### Okta

```typescript
import { OktaProvider, OKTA_ATTRIBUTE_NAMES, generateKeyPair } from 'mock-saml-idp';

const { privateKey, certificate } = generateKeyPair();

const idp = OktaProvider.create({
  entityId: 'https://my-idp.example.com/saml',
  privateKey,
  certificate,
});

const response = idp.createPostResponse({
  user: {
    nameId: 'alice@example.com',
    attributes: {
      [OKTA_ATTRIBUTE_NAMES.email]:     'alice@example.com',
      [OKTA_ATTRIBUTE_NAMES.firstName]: 'Alice',
      [OKTA_ATTRIBUTE_NAMES.lastName]:  'Smith',
      [OKTA_ATTRIBUTE_NAMES.login]:     'alice',
      [OKTA_ATTRIBUTE_NAMES.groups]:    'engineers',
    },
  },
  spEntityId: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
});
```

**Okta defaults:** `signAssertion: true`, `signResponse: true`, emailAddress NameID format.

### OneLogin

```typescript
import { OneLoginProvider, ONELOGIN_ATTRIBUTE_NAMES, generateKeyPair } from 'mock-saml-idp';

const { privateKey, certificate } = generateKeyPair();

const idp = OneLoginProvider.create({
  entityId: 'https://my-idp.example.com/saml',
  privateKey,
  certificate,
});

const response = idp.createPostResponse({
  user: {
    nameId: 'alice@example.com',
    attributes: {
      [ONELOGIN_ATTRIBUTE_NAMES.email]:     'alice@example.com',
      [ONELOGIN_ATTRIBUTE_NAMES.firstName]: 'Alice',
      [ONELOGIN_ATTRIBUTE_NAMES.lastName]:  'Smith',
      [ONELOGIN_ATTRIBUTE_NAMES.memberOf]:  'engineers',
    },
  },
  spEntityId: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
});
```

**OneLogin defaults:** `signAssertion: true`, `signResponse: true`, emailAddress NameID format.

### Auth0

```typescript
import { Auth0Provider, AUTH0_CLAIM_URIS, generateKeyPair } from 'mock-saml-idp';

const { privateKey, certificate } = generateKeyPair();

const idp = Auth0Provider.create({
  entityId: 'https://my-idp.example.com/saml',
  privateKey,
  certificate,
});

const response = idp.createPostResponse({
  user: {
    nameId: 'alice@example.com',
    attributes: {
      [AUTH0_CLAIM_URIS.email]: 'alice@example.com',
      [AUTH0_CLAIM_URIS.name]:  'Alice Smith',
    },
  },
  spEntityId: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
});
```

**Auth0 defaults:** `signAssertion: false`, `signResponse: true`, emailAddress NameID format.

### Google Workspace

```typescript
import { GoogleProvider, GOOGLE_ATTRIBUTE_NAMES, generateKeyPair } from 'mock-saml-idp';

const { privateKey, certificate } = generateKeyPair();

const idp = GoogleProvider.create({
  entityId: 'https://my-idp.example.com/saml',
  privateKey,
  certificate,
});

const response = idp.createPostResponse({
  user: {
    nameId: 'alice@example.com',
    attributes: {
      [GOOGLE_ATTRIBUTE_NAMES.email]:     'alice@example.com',
      [GOOGLE_ATTRIBUTE_NAMES.firstName]: 'Alice',
      [GOOGLE_ATTRIBUTE_NAMES.lastName]:  'Smith',
    },
  },
  spEntityId: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
});
```

**Google Workspace defaults:** `signAssertion: true`, `signResponse: false`, emailAddress NameID format.

### PingFederate

```typescript
import { PingFederateProvider, PING_ATTRIBUTE_NAMES, generateKeyPair } from 'mock-saml-idp';

const { privateKey, certificate } = generateKeyPair();

const idp = PingFederateProvider.create({
  entityId: 'https://my-idp.example.com/saml',
  privateKey,
  certificate,
});

const response = idp.createPostResponse({
  user: {
    nameId: 'alice-persistent-id',
    attributes: {
      [PING_ATTRIBUTE_NAMES.email]:   'alice@example.com',
      [PING_ATTRIBUTE_NAMES.uid]:     'alice',
      [PING_ATTRIBUTE_NAMES.cn]:      'Alice Smith',
      [PING_ATTRIBUTE_NAMES.subject]: 'alice@example.com',
    },
  },
  spEntityId: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
});
```

**PingFederate defaults:** `signAssertion: true`, `signResponse: false`, persistent NameID format.

---

## Configuration Reference

### IdpConfig

| Field                 | Type                  | Default                                                                    | Description                                              |
|-----------------------|-----------------------|----------------------------------------------------------------------------|----------------------------------------------------------|
| `entityId`            | `string`              | **required**                                                               | IdP Entity ID URI                                        |
| `privateKey`          | `string`              | **required**                                                               | PEM-encoded RSA private key                              |
| `certificate`         | `string`              | **required**                                                               | PEM-encoded X.509 certificate (headers optional)         |
| `signatureAlgorithm`  | `SignatureAlgorithm`  | `rsa-sha256`                                                               | XML signature algorithm                                  |
| `digestAlgorithm`     | `DigestAlgorithm`     | `sha256`                                                                   | XML digest algorithm                                     |
| `nameIdFormat`        | `NameIdFormat`        | `emailAddress`                                                             | Default NameID format                                    |
| `issuer`              | `string`              | Same as `entityId`                                                         | Issuer value in SAML responses                           |
| `ssoUrl`              | `string`              | —                                                                          | SSO endpoint URL                                         |
| `sloUrl`              | `string`              | —                                                                          | Single Logout endpoint URL                               |
| `signResponse`        | `boolean`             | `false`                                                                    | Sign the entire `<samlp:Response>` element               |
| `signAssertion`       | `boolean`             | `true`                                                                     | Sign the `<saml:Assertion>` element                      |
| `encryptAssertion`    | `boolean`             | `false`                                                                    | Encrypt the assertion (not yet implemented)              |
| `authnContextClassRef`| `string`              | `PasswordProtectedTransport`                                               | AuthnContext class reference URI                         |
| `sessionDuration`     | `number`              | `3600`                                                                     | Session validity in seconds                              |
| `clockSkew`           | `number`              | `300`                                                                      | Allowed clock skew for time validation (seconds)         |

### SamlUser

| Field           | Type                              | Description                                         |
|-----------------|-----------------------------------|-----------------------------------------------------|
| `nameId`        | `string`                          | **required** — Subject NameID value                 |
| `nameIdFormat`  | `NameIdFormat`                    | Overrides the IdP-level `nameIdFormat`              |
| `sessionIndex`  | `string`                          | Session index included in the assertion             |
| `attributes`    | `Record<string, string \| string[]>` | Arbitrary SAML attributes to include             |
| `email`         | `string`                          | Shorthand — also sent as an attribute               |
| `firstName`     | `string`                          | Shorthand — also sent as an attribute               |
| `lastName`      | `string`                          | Shorthand — also sent as an attribute               |
| `displayName`   | `string`                          | Shorthand — also sent as an attribute               |
| `groups`        | `string[]`                        | Group membership list                               |
| `roles`         | `string[]`                        | Role list                                           |

### ServerOptions

| Field         | Type                   | Default       | Description                                      |
|---------------|------------------------|---------------|--------------------------------------------------|
| `port`        | `number`               | `7000`        | TCP port. Use `0` for a random available port.   |
| `host`        | `string`               | `'localhost'` | Host/IP to bind to                               |
| `idpConfig`   | `Partial<IdpConfig>`   | —             | Overrides for the auto-generated IdP config      |
| `defaultUser` | `Partial<SamlUser>`    | —             | Pre-fills the login form in the built-in UI      |

---

## Advanced Usage

### Custom Attributes

Pass any key/value pairs in the `attributes` field to include them as `<saml:Attribute>` elements:

```typescript
const response = idp.createPostResponse({
  user: {
    nameId: 'alice@example.com',
    attributes: {
      department:   'Engineering',
      employeeId:   'EMP-001',
      // multi-value attribute
      permissions:  ['read', 'write', 'admin'],
    },
  },
  spEntityId: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
});
```

### Simulating Authentication Failures

Pass a non-success `statusCode` to test how your SP handles SAML error responses:

```typescript
import { MockSamlIdp } from 'mock-saml-idp';

const failResponse = idp.createPostResponse({
  user: { nameId: 'blocked@example.com' },
  spEntityId: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
  statusCode: 'urn:oasis:names:tc:SAML:2.0:status:AuthnFailed',
  statusMessage: 'User account is disabled',
});
```

Available status codes:

| Status Code                                                  | Meaning                         |
|--------------------------------------------------------------|---------------------------------|
| `urn:oasis:names:tc:SAML:2.0:status:Success`                 | Successful authentication       |
| `urn:oasis:names:tc:SAML:2.0:status:AuthnFailed`             | Authentication failed           |
| `urn:oasis:names:tc:SAML:2.0:status:NoPassive`               | Passive auth not possible       |
| `urn:oasis:names:tc:SAML:2.0:status:RequestDenied`           | Request was denied              |
| `urn:oasis:names:tc:SAML:2.0:status:Requester`               | Request error (SP side)         |
| `urn:oasis:names:tc:SAML:2.0:status:Responder`               | Response error (IdP side)       |
| `urn:oasis:names:tc:SAML:2.0:status:VersionMismatch`         | Unsupported SAML version        |
| `urn:oasis:names:tc:SAML:2.0:status:InvalidAttrNameOrValue`  | Invalid attribute value         |

### HTTP Bindings

Low-level binding utilities are exported for when you need to encode or decode SAML messages manually:

```typescript
import {
  encodePostBinding,
  decodePostBinding,
  encodeRedirectBinding,
  decodeRedirectBinding,
  buildPostFormHtml,
  buildRedirectUrl,
} from 'mock-saml-idp';

// Encode a SAMLRequest or SAMLResponse for HTTP-POST
const base64 = encodePostBinding(xmlString);
const xml    = decodePostBinding(base64);

// Encode for HTTP-Redirect (deflate + base64 + URL-encode)
const encoded = encodeRedirectBinding(xmlString);
const xml     = decodeRedirectBinding(encoded);

// Build an auto-submitting HTML form (HTTP-POST binding)
const html = buildPostFormHtml(acsUrl, 'SAMLResponse', base64, relayState);

// Build a redirect URL with the encoded SAMLResponse
const url = buildRedirectUrl(acsUrl, 'SAMLResponse', xmlString, relayState);
```

### Testing with Jest / Vitest

A typical integration test that starts the IdP, configures an SP, and verifies the SSO flow:

```typescript
import { startServer, generateKeyPair } from 'mock-saml-idp';

let close: () => Promise<void>;
let idpUrl: string;

beforeAll(async () => {
  const server = await startServer({
    port: 0,  // random port
    defaultUser: {
      nameId: 'testuser@example.com',
      firstName: 'Test',
      lastName: 'User',
    },
  });
  idpUrl = server.url;
  close = server.close;
});

afterAll(() => close());

test('metadata endpoint returns valid XML', async () => {
  const res = await fetch(`${idpUrl}/metadata`);
  expect(res.status).toBe(200);
  const xml = await res.text();
  expect(xml).toContain('IDPSSODescriptor');
});

test('generates a POST response for a user', async () => {
  const { idp } = await startServer({ port: 0 });
  const { privateKey, certificate } = generateKeyPair();

  const localIdp = new (await import('mock-saml-idp')).MockSamlIdp({
    entityId: 'https://idp.test',
    privateKey,
    certificate,
  });

  const response = localIdp.createPostResponse({
    user: { nameId: 'alice@example.com' },
    spEntityId: 'https://sp.test',
    acsUrl: 'https://sp.test/acs',
  });

  expect(response.type).toBe('POST');
  expect(response.samlResponse).toBeTruthy();
});
```

You can also build test AuthnRequests programmatically using the exported helpers:

```typescript
import { buildMinimalAuthnRequest, buildMinimalLogoutRequest } from 'mock-saml-idp';

// Build a base64-encoded AuthnRequest (POST binding)
const samlRequest = buildMinimalAuthnRequest({
  id: '_req1',
  issuer: 'https://my-app.example.com',
  acsUrl: 'https://my-app.example.com/saml/acs',
  destination: `${idpUrl}/sso`,
});

// Build a base64-encoded LogoutRequest
const logoutRequest = buildMinimalLogoutRequest({
  id: '_logout1',
  issuer: 'https://my-app.example.com',
  nameId: 'alice@example.com',
  sessionIndex: '_session123',
});
```

---

## Deploying for Remote Access

The built-in server is designed for **testing use only** — do not expose it on a public
endpoint without a firewall or authentication layer in front of it.

### Bind to All Interfaces

By default the server listens on `localhost` only. To make it reachable from other machines
on the same network (or inside a container), bind to `0.0.0.0`:

```bash
HOST=0.0.0.0 PORT=7000 npx mock-saml-idp
```

When deployed behind a DNS name or public IP, also override the IdP URLs so that the
SAML metadata and responses contain the correct externally-visible addresses:

```bash
HOST=0.0.0.0 \
PORT=7000 \
IDP_BASE_URL=https://mock-idp.your-team.example.com \
npx mock-saml-idp
```

> **Tip:** `IDP_BASE_URL` is read by the CLI (`src/bin.ts`) and used as the base for
> `entityId`, `ssoUrl`, and `sloUrl`. If your deployment already handles TLS termination
> at a load balancer or reverse proxy, set this variable to the **public** HTTPS URL.

### Docker

A `Dockerfile` is included in the repository. Build and run a container with:

```bash
# Build the image
docker build -t mock-saml-idp .

# Run on port 7000 (localhost only — suitable for a single developer machine)
docker run --rm -p 7000:7000 mock-saml-idp

# Run with a custom external base URL (required when deploying to a shared server)
docker run --rm \
  -p 7000:7000 \
  -e IDP_BASE_URL=https://mock-idp.your-team.example.com \
  mock-saml-idp
```

Or with Docker Compose — create a `docker-compose.yml` in your project:

```yaml
version: "3.9"
services:
  mock-saml-idp:
    build: .          # replace with 'image: your-registry/mock-saml-idp' if you push to a registry
    ports:
      - "7000:7000"
    environment:
      HOST: "0.0.0.0"
      PORT: "7000"
      IDP_BASE_URL: "https://mock-idp.your-team.example.com"
    restart: unless-stopped
```

```bash
docker compose up -d
```

### Cloud Platforms

The container can be deployed to any platform that supports Docker images.
Below are quick-start examples for common platforms.

#### Render

1. Push the repository (or your fork) to GitHub.
2. Create a new **Web Service** on [Render](https://render.com), connect the repo, and
   set the Docker environment.
3. Set the environment variable `IDP_BASE_URL` to the Render-generated URL
   (e.g. `https://mock-saml-idp.onrender.com`).
4. Set the port to `7000`.

#### Railway

```bash
# Install the Railway CLI and deploy in one command
railway init
railway up
```

Set `PORT` and `IDP_BASE_URL` in **Railway → Variables**.

#### Heroku

```bash
heroku create mock-saml-idp
heroku config:set IDP_BASE_URL=https://mock-saml-idp.herokuapp.com
git push heroku main
```

The `Procfile` equivalent is already covered by `npm start` → `node dist/bin.js`.

#### Any VPS / VM

```bash
# On the server
git clone https://github.com/de-sadik/mock-saml-idp.git
cd mock-saml-idp
npm ci
npm run build
IDP_BASE_URL=https://mock-idp.your-team.example.com \
HOST=0.0.0.0 PORT=7000 \
node dist/bin.js
```

Use a process manager such as **pm2** or **systemd** to keep the process running:

```bash
npm install -g pm2
IDP_BASE_URL=https://mock-idp.your-team.example.com \
PORT=7000 pm2 start dist/bin.js --name mock-saml-idp
pm2 save
pm2 startup
```

### Behind a Reverse Proxy or Load Balancer

When nginx, Caddy, or an AWS ALB terminates TLS in front of this server:

1. Set `IDP_BASE_URL` to the **public HTTPS** URL (e.g. `https://mock-idp.corp.example.com`).
2. Forward traffic to the container on port `7000`.
3. Ensure the proxy passes the original `Host` header.

Example nginx block:

```nginx
server {
    listen 443 ssl;
    server_name mock-idp.corp.example.com;

    ssl_certificate     /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass         http://localhost:7000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $remote_addr;
        proxy_set_header   X-Forwarded-Proto https;
    }
}
```

---

## Using in UAT & Testing Environments

**Yes** — `mock-saml-idp` is well-suited for UAT (User Acceptance Testing), manual
exploratory testing, and automated integration/end-to-end testing.

### Manual & UAT Testing with the Built-in UI

When deployed to a shared server (see [Deploying for Remote Access](#deploying-for-remote-access)),
the built-in web UI lets testers and QA engineers:

- View the IdP **Entity ID**, **SSO URL**, **SLO URL**, and **Metadata URL** at a glance.
- Copy the auto-generated **X.509 certificate** to configure their Service Provider.
- Fill in a form to **inject any test user** directly into an SP's ACS URL without needing
  a real AuthnRequest — useful for testing specific attribute combinations or edge-case users.
- Trigger the full **SP-initiated SSO flow** by initiating login from the SP; the IdP
  shows a login form where any user identity can be entered.

**Typical UAT workflow:**

1. Deploy the IdP server to a shared test host (e.g. `https://mock-idp.uat.example.com`).
2. Point your application's SAML SP settings to the IdP metadata URL:
   `https://mock-idp.uat.example.com/metadata`.
3. Open the application's login page → click "Login with SSO" → the browser is redirected
   to the mock IdP.
4. Fill in the test user's email, first name, and last name, then click **Sign In**.
5. The IdP posts a signed SAML response back to the SP → you are logged in as that user.

### Automated Integration Testing

Use `startServer()` inside your test suite to spin up a real SAML IdP that your
application under test can talk to over HTTP:

```typescript
import { startServer } from 'mock-saml-idp';

let closeIdp: () => Promise<void>;
let idpUrl: string;

beforeAll(async () => {
  const { url, close } = await startServer({
    port: 0,             // random free port — avoids port conflicts in CI
    defaultUser: {
      nameId: 'uat-user@example.com',
      firstName: 'UAT',
      lastName: 'User',
    },
  });
  idpUrl = url;
  closeIdp = close;

  // Point your application's SAML config to the test IdP
  process.env.SAML_METADATA_URL = `${idpUrl}/metadata`;
});

afterAll(() => closeIdp());

test('SSO login creates a session', async () => {
  // … drive your SP through the full SAML flow using a headless browser
  // (Playwright, Puppeteer, etc.) or by posting a SAMLResponse directly.
});
```

**Why this is better than mocking at the library level:**

- The SAML response is a **real signed XML document** — your SP's signature verification
  code is exercised end-to-end.
- The test runs against a live HTTP server, so network serialisation, redirects, and
  cookie handling are all tested.
- Works in **CI pipelines** (GitHub Actions, GitLab CI, Jenkins) with no external
  dependencies.

### Persistent UAT Setup

For teams that need a long-lived IdP (e.g. shared across sprints):

1. Generate and persist a key pair so the certificate stays stable across restarts:

```typescript
import { generateKeyPair } from 'mock-saml-idp';
import fs from 'fs';

// Run once and commit the output files (or store in a secrets manager)
const { privateKey, certificate } = generateKeyPair();
fs.writeFileSync('idp-private-key.pem', privateKey);
fs.writeFileSync('idp-certificate.pem', certificate);
```

2. Start the server with the persisted credentials:

```bash
node -e "
const { startServer } = require('mock-saml-idp');
const fs = require('fs');
startServer({
  idpConfig: {
    entityId: 'https://mock-idp.uat.example.com/metadata',
    privateKey: fs.readFileSync('idp-private-key.pem', 'utf8'),
    certificate: fs.readFileSync('idp-certificate.pem', 'utf8'),
    ssoUrl: 'https://mock-idp.uat.example.com/sso',
    sloUrl: 'https://mock-idp.uat.example.com/slo',
  },
  port: 7000,
  host: '0.0.0.0',
}).then(({ url }) => console.log('IdP running at', url));
"
```

3. Configure your SP once with the stable metadata URL. The certificate will not change
   between restarts, so you will not need to re-import it.

> **Security note:** `mock-saml-idp` is intended for **non-production testing environments
> only**. It does not authenticate users — anyone who can reach the login form can assert
> any identity. Keep it behind a VPN or firewall, and never deploy it in front of
> production data.

---

## TypeScript Types

All types are exported from the package root:

```typescript
import type {
  IdpConfig,
  SamlUser,
  AuthnRequestOptions,
  LogoutRequestOptions,
  ParsedAuthnRequest,
  ParsedLogoutRequest,
  SamlPostResponse,
  SamlRedirectResponse,
  SamlMetadataOptions,
  SpMetadata,
  NameIdFormat,
  SignatureAlgorithm,
  DigestAlgorithm,
  SamlBinding,
  StatusCode,
} from 'mock-saml-idp';
```

---

## License

[MIT](./LICENSE)
