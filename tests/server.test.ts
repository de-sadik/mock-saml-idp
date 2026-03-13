import http from 'http';
import { startServer } from '../src/server';
import { buildMinimalAuthnRequest } from '../src/saml/request';
import { encodeRedirectBinding } from '../src/saml/bindings';

function httpGet(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function httpPost(
  url: string,
  body: string,
  contentType = 'application/x-www-form-urlencoded',
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': contentType } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Use port 0 to let the OS assign an available port, avoiding conflicts
function getPort(): number {
  return 0;
}

describe('Server', () => {
  it('starts and stops without error', async () => {
    const instance = await startServer({ port: getPort() });
    expect(instance.url).toContain('http://');
    expect(instance.idp).toBeDefined();
    await instance.close();
  });

  it('GET / returns landing page HTML', async () => {
    const instance = await startServer({ port: getPort() });
    try {
      const res = await httpGet(`${instance.url}/`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Mock SAML IdP');
      expect(res.body).toContain('/metadata');
      expect(res.body).toContain('/sso');
    } finally {
      await instance.close();
    }
  });

  it('GET /metadata returns valid XML metadata', async () => {
    const instance = await startServer({ port: getPort() });
    try {
      const res = await httpGet(`${instance.url}/metadata`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/xml');
      expect(res.body).toContain('EntityDescriptor');
      expect(res.body).toContain('IDPSSODescriptor');
      expect(res.body).toContain('X509Certificate');
    } finally {
      await instance.close();
    }
  });

  it('GET /sso without SAMLRequest redirects to landing page', async () => {
    const instance = await startServer({ port: getPort() });
    try {
      const res = await httpGet(`${instance.url}/sso`);
      expect(res.status).toBe(302);
      expect(res.headers['location']).toBe('/');
    } finally {
      await instance.close();
    }
  });

  it('GET /sso with SAMLRequest shows login page', async () => {
    const instance = await startServer({ port: getPort() });
    try {
      const samlRequest = buildMinimalAuthnRequest({
        id: '_test123',
        issuer: 'https://sp.example.com',
        acsUrl: 'https://sp.example.com/acs',
        destination: `${instance.url}/sso`,
      });

      // Encode for redirect binding
      const encoded = encodeRedirectBinding(
        Buffer.from(samlRequest, 'base64').toString('utf8'),
      );
      const url = `${instance.url}/sso?SAMLRequest=${encoded}`;
      const res = await httpGet(url);
      expect(res.status).toBe(200);
      expect(res.body).toContain('Mock SAML Login');
      expect(res.body).toContain('https://sp.example.com/acs');
    } finally {
      await instance.close();
    }
  });

  it('POST /sso with SAMLRequest shows login page', async () => {
    const instance = await startServer({ port: getPort() });
    try {
      const samlRequest = buildMinimalAuthnRequest({
        id: '_testreq',
        issuer: 'https://sp.example.com',
        acsUrl: 'https://sp.example.com/acs',
      });
      const body = `SAMLRequest=${encodeURIComponent(samlRequest)}`;
      const res = await httpPost(`${instance.url}/sso`, body);
      expect(res.status).toBe(200);
      expect(res.body).toContain('Mock SAML Login');
    } finally {
      await instance.close();
    }
  });

  it('POST /sso without SAMLRequest returns 400', async () => {
    const instance = await startServer({ port: getPort() });
    try {
      const res = await httpPost(`${instance.url}/sso`, '');
      expect(res.status).toBe(400);
    } finally {
      await instance.close();
    }
  });

  it('POST /sso/response sends SAML response back to SP', async () => {
    const instance = await startServer({ port: getPort() });
    try {
      const body = new URLSearchParams({
        acsUrl: 'https://sp.example.com/acs',
        spEntityId: 'https://sp.example.com',
        nameId: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        inResponseTo: '_req1',
        relayState: '/dashboard',
      }).toString();

      const res = await httpPost(`${instance.url}/sso/response`, body);
      expect(res.status).toBe(200);
      expect(res.body).toContain('SAMLResponse');
      expect(res.body).toContain('https://sp.example.com/acs');
      expect(res.body).toContain('RelayState');
    } finally {
      await instance.close();
    }
  });

  it('POST /sso/test sends SAML response for direct test', async () => {
    const instance = await startServer({ port: getPort() });
    try {
      const body = new URLSearchParams({
        acsUrl: 'https://sp.example.com/acs',
        spEntityId: 'https://sp.example.com',
        nameId: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
      }).toString();

      const res = await httpPost(`${instance.url}/sso/test`, body);
      expect(res.status).toBe(200);
      expect(res.body).toContain('SAMLResponse');
      expect(res.body).toContain('https://sp.example.com/acs');
    } finally {
      await instance.close();
    }
  });

  it('GET /slo returns logged out page', async () => {
    const instance = await startServer({ port: getPort() });
    try {
      const res = await httpGet(`${instance.url}/slo`);
      expect(res.status).toBe(200);
      expect(res.body).toContain('Logged Out');
    } finally {
      await instance.close();
    }
  });

  it('GET /unknown returns 404', async () => {
    const instance = await startServer({ port: getPort() });
    try {
      const res = await httpGet(`${instance.url}/unknown`);
      expect(res.status).toBe(404);
    } finally {
      await instance.close();
    }
  });

  it('respects custom defaultUser', async () => {
    const instance = await startServer({
      port: getPort(),
      defaultUser: {
        nameId: 'custom@test.com',
        firstName: 'Custom',
        lastName: 'Tester',
      },
    });
    try {
      const res = await httpGet(`${instance.url}/`);
      expect(res.body).toContain('custom@test.com');
      expect(res.body).toContain('Custom');
      expect(res.body).toContain('Tester');
    } finally {
      await instance.close();
    }
  });

  it('metadata includes SSO and SLO service locations', async () => {
    const instance = await startServer({ port: getPort() });
    try {
      const res = await httpGet(`${instance.url}/metadata`);
      expect(res.body).toContain(`${instance.url}/sso`);
      expect(res.body).toContain(`${instance.url}/slo`);
    } finally {
      await instance.close();
    }
  });
});
