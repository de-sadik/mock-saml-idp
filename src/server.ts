import http from 'http';
import { URL } from 'url';
import { MockSamlIdp } from './MockSamlIdp';
import { generateKeyPair, stripPemHeaders } from './saml/crypto';
import { buildPostFormHtml } from './saml/bindings';
import type { IdpConfig, SamlUser } from './types';

export interface ServerOptions {
  port?: number;
  host?: string;
  idpConfig?: Partial<IdpConfig>;
  /** Default test user shown in the login form */
  defaultUser?: Partial<SamlUser>;
}

interface ServerInstance {
  server: http.Server;
  url: string;
  idp: MockSamlIdp;
  close: () => Promise<void>;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Render the IdP landing page HTML.
 */
function renderLandingPage(baseUrl: string, config: IdpConfig, defaultUser: SamlUser): string {
  const certPem = stripPemHeaders(config.certificate);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mock SAML IdP</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #333; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; padding: 20px; }
    header { text-align: center; padding: 40px 0 20px; }
    header h1 { font-size: 2em; color: #2c3e50; }
    header p { color: #666; margin-top: 8px; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 24px; margin-bottom: 20px; }
    .card h2 { font-size: 1.2em; color: #2c3e50; margin-bottom: 16px; border-bottom: 2px solid #3498db; padding-bottom: 8px; }
    .info-grid { display: grid; grid-template-columns: 180px 1fr; gap: 8px 16px; align-items: start; }
    .info-grid dt { font-weight: 600; color: #555; }
    .info-grid dd { word-break: break-all; }
    .info-grid dd a { color: #3498db; text-decoration: none; }
    .info-grid dd a:hover { text-decoration: underline; }
    .cert-box { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 12px; font-family: monospace; font-size: 0.8em; word-break: break-all; max-height: 120px; overflow-y: auto; }
    .test-form { margin-top: 8px; }
    .test-form label { display: block; font-weight: 600; margin-bottom: 4px; color: #555; font-size: 0.9em; }
    .test-form input, .test-form textarea { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9em; margin-bottom: 12px; }
    .test-form textarea { font-family: monospace; resize: vertical; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
    .btn { display: inline-block; padding: 10px 24px; background: #3498db; color: #fff; border: none; border-radius: 4px; font-size: 1em; cursor: pointer; }
    .btn:hover { background: #2980b9; }
    .btn-secondary { background: #6c757d; }
    .btn-secondary:hover { background: #5a6268; }
    footer { text-align: center; padding: 20px; color: #999; font-size: 0.85em; }
    .badge { display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>&#128274; Mock SAML IdP</h1>
      <p>A mock SAML 2.0 Identity Provider for testing SSO integrations</p>
      <span class="badge">Running on ${escapeHtml(baseUrl)}</span>
    </header>

    <div class="card">
      <h2>IdP Configuration</h2>
      <dl class="info-grid">
        <dt>Entity ID</dt>
        <dd>${escapeHtml(config.entityId)}</dd>
        <dt>SSO URL (POST)</dt>
        <dd><a href="${escapeHtml(config.ssoUrl ?? '')}">${escapeHtml(config.ssoUrl ?? '')}</a></dd>
        <dt>SSO URL (Redirect)</dt>
        <dd><a href="${escapeHtml(config.ssoUrl ?? '')}">${escapeHtml(config.ssoUrl ?? '')}</a></dd>
        <dt>SLO URL</dt>
        <dd><a href="${escapeHtml(config.sloUrl ?? '')}">${escapeHtml(config.sloUrl ?? '')}</a></dd>
        <dt>Metadata URL</dt>
        <dd><a href="${escapeHtml(baseUrl)}/metadata">${escapeHtml(baseUrl)}/metadata</a></dd>
        <dt>Sign Assertion</dt>
        <dd>${config.signAssertion !== false ? 'Yes' : 'No'}</dd>
        <dt>Sign Response</dt>
        <dd>${config.signResponse === true ? 'Yes' : 'No'}</dd>
        <dt>NameID Format</dt>
        <dd>${escapeHtml(config.nameIdFormat ?? 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress')}</dd>
      </dl>
    </div>

    <div class="card">
      <h2>Certificate</h2>
      <div class="cert-box">${escapeHtml(certPem)}</div>
    </div>

    <div class="card">
      <h2>SP-Initiated SSO Test</h2>
      <p style="margin-bottom:16px;color:#666;font-size:0.9em;">
        Configure your Service Provider with the metadata URL above, then initiate login from your SP.
        Alternatively, fill in the form below to send a SAML response directly to your SP's ACS URL.
      </p>
      <form class="test-form" method="POST" action="/sso/test">
        <div class="form-row">
          <div>
            <label for="acsUrl">ACS URL (Assertion Consumer Service)</label>
            <input type="url" id="acsUrl" name="acsUrl" placeholder="https://your-sp.example.com/acs" required>
          </div>
          <div>
            <label for="spEntityId">SP Entity ID</label>
            <input type="text" id="spEntityId" name="spEntityId" placeholder="https://your-sp.example.com" required>
          </div>
        </div>
        <div class="form-row">
          <div>
            <label for="nameId">NameID (Email)</label>
            <input type="email" id="nameId" name="nameId" value="${escapeHtml(defaultUser.nameId)}" required>
          </div>
          <div>
            <label for="relayState">RelayState (optional)</label>
            <input type="text" id="relayState" name="relayState" placeholder="/dashboard">
          </div>
        </div>
        <div class="form-row">
          <div>
            <label for="firstName">First Name</label>
            <input type="text" id="firstName" name="firstName" value="${escapeHtml(defaultUser.firstName ?? '')}">
          </div>
          <div>
            <label for="lastName">Last Name</label>
            <input type="text" id="lastName" name="lastName" value="${escapeHtml(defaultUser.lastName ?? '')}">
          </div>
        </div>
        <button type="submit" class="btn">Send SAML Response</button>
      </form>
    </div>

    <div class="card">
      <h2>SP-Initiated Login (AuthnRequest)</h2>
      <p style="margin-bottom:16px;color:#666;font-size:0.9em;">
        When your SP redirects users to the SSO URL with a SAMLRequest, this IdP will display a login form
        and send a SAML response back to the SP's ACS URL.
      </p>
    </div>

    <footer>
      mock-saml-idp &mdash; Mock SAML 2.0 Identity Provider for testing
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Render the login form that appears when an AuthnRequest is received.
 */
function renderLoginPage(
  baseUrl: string,
  acsUrl: string,
  spEntityId: string,
  inResponseTo: string,
  relayState: string,
  defaultUser: SamlUser,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mock SAML IdP - Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #333; line-height: 1.6; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .login-card { background: #fff; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 32px; width: 100%; max-width: 480px; }
    .login-card h1 { font-size: 1.4em; color: #2c3e50; text-align: center; margin-bottom: 8px; }
    .login-card .subtitle { text-align: center; color: #888; font-size: 0.85em; margin-bottom: 24px; }
    .login-card label { display: block; font-weight: 600; margin-bottom: 4px; color: #555; font-size: 0.9em; }
    .login-card input { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9em; margin-bottom: 12px; }
    .btn { display: block; width: 100%; padding: 10px 24px; background: #3498db; color: #fff; border: none; border-radius: 4px; font-size: 1em; cursor: pointer; }
    .btn:hover { background: #2980b9; }
    .sp-info { background: #f8f9fa; border: 1px solid #eee; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; font-size: 0.85em; color: #666; }
    .sp-info strong { color: #333; }
  </style>
</head>
<body>
  <div class="login-card">
    <h1>&#128274; Mock SAML Login</h1>
    <p class="subtitle">Authenticate as a test user</p>
    <div class="sp-info">
      <strong>SP:</strong> ${escapeHtml(spEntityId)}<br>
      <strong>ACS:</strong> ${escapeHtml(acsUrl)}
    </div>
    <form method="POST" action="${escapeHtml(baseUrl)}/sso/response">
      <input type="hidden" name="acsUrl" value="${escapeHtml(acsUrl)}">
      <input type="hidden" name="spEntityId" value="${escapeHtml(spEntityId)}">
      <input type="hidden" name="inResponseTo" value="${escapeHtml(inResponseTo)}">
      <input type="hidden" name="relayState" value="${escapeHtml(relayState)}">
      <label for="nameId">NameID (Email)</label>
      <input type="email" id="nameId" name="nameId" value="${escapeHtml(defaultUser.nameId)}" required>
      <label for="firstName">First Name</label>
      <input type="text" id="firstName" name="firstName" value="${escapeHtml(defaultUser.firstName ?? '')}">
      <label for="lastName">Last Name</label>
      <input type="text" id="lastName" name="lastName" value="${escapeHtml(defaultUser.lastName ?? '')}">
      <button type="submit" class="btn">Sign In &amp; Send Response</button>
    </form>
  </div>
</body>
</html>`;
}

function buildUserFromForm(form: Record<string, string>, defaultUser: SamlUser): SamlUser {
  return {
    nameId: form['nameId'] || defaultUser.nameId,
    email: form['nameId'] || defaultUser.email,
    firstName: form['firstName'] || defaultUser.firstName,
    lastName: form['lastName'] || defaultUser.lastName,
    displayName: `${form['firstName'] || defaultUser.firstName} ${form['lastName'] || defaultUser.lastName}`,
    attributes: {
      email: form['nameId'] || defaultUser.email || '',
      firstName: form['firstName'] || defaultUser.firstName || '',
      lastName: form['lastName'] || defaultUser.lastName || '',
    },
  };
}

/**
 * Create and start a mock SAML IdP HTTP server with a built-in UI.
 */
export async function startServer(options: ServerOptions = {}): Promise<ServerInstance> {
  const requestedPort = options.port ?? 7000;
  const host = options.host ?? 'localhost';

  const { privateKey, certificate } = generateKeyPair();

  // Use a mutable reference so the request handler always sees the resolved URL.
  let baseUrl = `http://${host}:${requestedPort}`;

  const idpConfig: IdpConfig = {
    entityId: `${baseUrl}/metadata`,
    privateKey,
    certificate,
    ssoUrl: `${baseUrl}/sso`,
    sloUrl: `${baseUrl}/slo`,
    signAssertion: true,
    signResponse: false,
    nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    ...options.idpConfig,
  };

  // Ensure URLs are set if user overrode them with undefined
  idpConfig.ssoUrl = idpConfig.ssoUrl ?? `${baseUrl}/sso`;
  idpConfig.sloUrl = idpConfig.sloUrl ?? `${baseUrl}/slo`;

  const defaultUser: SamlUser = {
    nameId: 'user@example.com',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    ...options.defaultUser,
  };

  const idp = new MockSamlIdp(idpConfig);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', baseUrl);
    const method = req.method ?? 'GET';

    try {
      // Landing page
      if (url.pathname === '/' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderLandingPage(baseUrl, idpConfig, defaultUser));
        return;
      }

      // Metadata endpoint
      if (url.pathname === '/metadata' && method === 'GET') {
        const metadata = idp.getMetadata();
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
        res.end(metadata);
        return;
      }

      // SSO endpoint - GET (HTTP-Redirect binding)
      if (url.pathname === '/sso' && method === 'GET') {
        const samlRequest = url.searchParams.get('SAMLRequest');
        const relayState = url.searchParams.get('RelayState') ?? '';

        if (!samlRequest) {
          // No SAMLRequest — show landing page
          res.writeHead(302, { Location: '/' });
          res.end();
          return;
        }

        const parsed = idp.parseAuthnRequest(
          samlRequest,
          'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderLoginPage(
          baseUrl,
          parsed.acsUrl,
          parsed.issuer,
          parsed.id,
          relayState,
          defaultUser,
        ));
        return;
      }

      // SSO endpoint - POST (HTTP-POST binding for AuthnRequest)
      if (url.pathname === '/sso' && method === 'POST') {
        const body = await readBody(req);
        const form = parseFormBody(body);
        const samlRequest = form['SAMLRequest'];
        const relayState = form['RelayState'] ?? '';

        if (!samlRequest) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing SAMLRequest parameter');
          return;
        }

        const parsed = idp.parseAuthnRequest(
          samlRequest,
          'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderLoginPage(
          baseUrl,
          parsed.acsUrl,
          parsed.issuer,
          parsed.id,
          relayState,
          defaultUser,
        ));
        return;
      }

      // Process login form and send SAML response back to SP
      if (url.pathname === '/sso/response' && method === 'POST') {
        const body = await readBody(req);
        const form = parseFormBody(body);
        const user = buildUserFromForm(form, defaultUser);

        const samlResp = idp.createPostResponse({
          user,
          spEntityId: form['spEntityId'],
          acsUrl: form['acsUrl'],
          inResponseTo: form['inResponseTo'] || undefined,
          relayState: form['relayState'] || undefined,
        });

        const html = buildPostFormHtml(
          samlResp.url,
          'SAMLResponse',
          samlResp.samlResponse,
          samlResp.relayState,
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // SP-initiated test from landing page (no AuthnRequest)
      if (url.pathname === '/sso/test' && method === 'POST') {
        const body = await readBody(req);
        const form = parseFormBody(body);
        const user = buildUserFromForm(form, defaultUser);

        const samlResp = idp.createPostResponse({
          user,
          spEntityId: form['spEntityId'],
          acsUrl: form['acsUrl'],
          relayState: form['relayState'] || undefined,
        });

        const html = buildPostFormHtml(
          samlResp.url,
          'SAMLResponse',
          samlResp.samlResponse,
          samlResp.relayState,
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // SLO endpoint
      if (url.pathname === '/slo' && (method === 'GET' || method === 'POST')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html><head><title>Logged Out</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f5f7fa;}
.msg{text-align:center;}.msg h1{color:#2c3e50;}.msg a{color:#3498db;}</style></head>
<body><div class="msg"><h1>&#9989; Logged Out</h1><p>You have been logged out.</p><p><a href="/">Back to IdP Home</a></p></div></body></html>`);
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal Server Error';
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html><head><title>Error</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f5f7fa;}
.err{text-align:center;max-width:600px;}.err h1{color:#e74c3c;}.err pre{background:#fff;padding:16px;border-radius:8px;text-align:left;overflow:auto;}</style></head>
<body><div class="err"><h1>Error</h1><pre>${escapeHtml(message)}</pre><p><a href="/">Back to Home</a></p></div></body></html>`);
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(requestedPort, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : requestedPort;
      baseUrl = `http://${host}:${actualPort}`;

      // Update config URLs when port was dynamically assigned
      if (!options.idpConfig?.entityId) idpConfig.entityId = `${baseUrl}/metadata`;
      if (!options.idpConfig?.ssoUrl) idpConfig.ssoUrl = `${baseUrl}/sso`;
      if (!options.idpConfig?.sloUrl) idpConfig.sloUrl = `${baseUrl}/slo`;

      resolve({
        server,
        url: baseUrl,
        idp,
        close: () => new Promise<void>((res, rej) => {
          server.close((err) => (err ? rej(err) : res()));
        }),
      });
    });
  });
}
