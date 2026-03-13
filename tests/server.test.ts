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

// Use a unique port to avoid conflicts
let nextPort = 17000;
function getPort(): number {
  return nextPort++;
}

describe('Server', () => {
  it('starts and stops without error', async () => {
    const instance = await startServer({ port: getPort() });
    expect(instance.url).toContain('http://');
    expect(instance.idp).toBeDefined();
    await instance.close();
  });

  it('GET / returns landing page HTML', async () => {
    const port = getPort();
    const instance = await startServer({ port });
    try {
      const res = await httpGet(`http://localhost:${port}/`);
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
    const port = getPort();
    const instance = await startServer({ port });
    try {
      const res = await httpGet(`http://localhost:${port}/metadata`);
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
    const port = getPort();
    const instance = await startServer({ port });
    try {
      // http.get doesn't follow redirects by default
      const res = await httpGet(`http://localhost:${port}/sso`);
      expect(res.status).toBe(302);
      expect(res.headers['location']).toBe('/');
    } finally {
      await instance.close();
    }
  });

  it('GET /sso with SAMLRequest shows login page', async () => {
    const port = getPort();
    const instance = await startServer({ port });
    try {
      const samlRequest = buildMinimalAuthnRequest({
        id: '_test123',
        issuer: 'https://sp.example.com',
        acsUrl: 'https://sp.example.com/acs',
        destination: `http://localhost:${port}/sso`,
      });

      // Encode for redirect binding
      const encoded = encodeRedirectBinding(
        Buffer.from(samlRequest, 'base64').toString('utf8'),
      );
      const url = `http://localhost:${port}/sso?SAMLRequest=${encoded}`;
      const res = await httpGet(url);
      expect(res.status).toBe(200);
      expect(res.body).toContain('Mock SAML Login');
      expect(res.body).toContain('https://sp.example.com/acs');
    } finally {
      await instance.close();
    }
  });

  it('POST /sso with SAMLRequest shows login page', async () => {
    const port = getPort();
    const instance = await startServer({ port });
    try {
      const samlRequest = buildMinimalAuthnRequest({
        id: '_testreq',
        issuer: 'https://sp.example.com',
        acsUrl: 'https://sp.example.com/acs',
      });
      const body = `SAMLRequest=${encodeURIComponent(samlRequest)}`;
      const res = await httpPost(`http://localhost:${port}/sso`, body);
      expect(res.status).toBe(200);
      expect(res.body).toContain('Mock SAML Login');
    } finally {
      await instance.close();
    }
  });

  it('POST /sso without SAMLRequest returns 400', async () => {
    const port = getPort();
    const instance = await startServer({ port });
    try {
      const res = await httpPost(`http://localhost:${port}/sso`, '');
      expect(res.status).toBe(400);
    } finally {
      await instance.close();
    }
  });

  it('POST /sso/response sends SAML response back to SP', async () => {
    const port = getPort();
    const instance = await startServer({ port });
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

      const res = await httpPost(`http://localhost:${port}/sso/response`, body);
      expect(res.status).toBe(200);
      expect(res.body).toContain('SAMLResponse');
      expect(res.body).toContain('https://sp.example.com/acs');
      expect(res.body).toContain('RelayState');
    } finally {
      await instance.close();
    }
  });

  it('POST /sso/test sends SAML response for direct test', async () => {
    const port = getPort();
    const instance = await startServer({ port });
    try {
      const body = new URLSearchParams({
        acsUrl: 'https://sp.example.com/acs',
        spEntityId: 'https://sp.example.com',
        nameId: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
      }).toString();

      const res = await httpPost(`http://localhost:${port}/sso/test`, body);
      expect(res.status).toBe(200);
      expect(res.body).toContain('SAMLResponse');
      expect(res.body).toContain('https://sp.example.com/acs');
    } finally {
      await instance.close();
    }
  });

  it('GET /slo returns logged out page', async () => {
    const port = getPort();
    const instance = await startServer({ port });
    try {
      const res = await httpGet(`http://localhost:${port}/slo`);
      expect(res.status).toBe(200);
      expect(res.body).toContain('Logged Out');
    } finally {
      await instance.close();
    }
  });

  it('GET /unknown returns 404', async () => {
    const port = getPort();
    const instance = await startServer({ port });
    try {
      const res = await httpGet(`http://localhost:${port}/unknown`);
      expect(res.status).toBe(404);
    } finally {
      await instance.close();
    }
  });

  it('respects custom defaultUser', async () => {
    const port = getPort();
    const instance = await startServer({
      port,
      defaultUser: {
        nameId: 'custom@test.com',
        firstName: 'Custom',
        lastName: 'Tester',
      },
    });
    try {
      const res = await httpGet(`http://localhost:${port}/`);
      expect(res.body).toContain('custom@test.com');
      expect(res.body).toContain('Custom');
      expect(res.body).toContain('Tester');
    } finally {
      await instance.close();
    }
  });

  it('metadata includes SSO and SLO service locations', async () => {
    const port = getPort();
    const instance = await startServer({ port });
    try {
      const res = await httpGet(`http://localhost:${port}/metadata`);
      expect(res.body).toContain(`http://localhost:${port}/sso`);
      expect(res.body).toContain(`http://localhost:${port}/slo`);
    } finally {
      await instance.close();
    }
  });
});
