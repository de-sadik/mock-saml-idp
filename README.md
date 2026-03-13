# mock-saml-idp
Modern mock SAML 2.0 Identity Provider for testing Azure AD, Okta, OneLogin, Google Workspace SSO integrations. Zero git dependencies.

## Quick Start — Built-in Server

The package includes a built-in HTTP server with a web UI for manual testing. No extra setup required.

```bash
# Start the server (default: http://localhost:7000)
npx mock-saml-idp

# Or with custom port/host
PORT=8080 HOST=0.0.0.0 npx mock-saml-idp
```

The server provides:

| Endpoint      | Description                                  |
|---------------|----------------------------------------------|
| `GET /`       | Landing page with IdP configuration and test form |
| `GET /metadata` | SAML 2.0 IdP metadata XML                  |
| `GET /sso`    | SSO endpoint (HTTP-Redirect binding)         |
| `POST /sso`   | SSO endpoint (HTTP-POST binding)             |
| `GET /slo`    | Single Logout endpoint                       |

### Programmatic Usage

```typescript
import { startServer } from 'mock-saml-idp';

const { url, idp, close } = await startServer({
  port: 7000,
  host: 'localhost',
  defaultUser: {
    nameId: 'testuser@example.com',
    firstName: 'Test',
    lastName: 'User',
  },
});

console.log(`IdP running at ${url}`);
// ... use idp instance for programmatic access ...
await close(); // shut down when done
```
