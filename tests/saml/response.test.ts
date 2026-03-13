import forge from 'node-forge';
import { buildAuthnResponse, buildLogoutResponse } from '../../src/saml/response';
import type { BuildResponseOptions } from '../../src/saml/response';
import type { IdpConfig, SamlUser } from '../../src/types';

function generateTestKeyPair(): { privateKey: string; certificate: string } {
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keypair.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [{ name: 'commonName', value: 'Test IdP' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keypair.privateKey, forge.md.sha256.create());
  return {
    privateKey: forge.pki.privateKeyToPem(keypair.privateKey),
    certificate: forge.pki.certificateToPem(cert),
  };
}

const { privateKey, certificate } = generateTestKeyPair();

const testConfig: IdpConfig = {
  entityId: 'https://idp.example.com',
  privateKey,
  certificate,
  signAssertion: true,
  signResponse: false,
};

const user: SamlUser = {
  nameId: 'user@example.com',
  attributes: { email: 'user@example.com', role: 'admin' },
};

const buildOpts: BuildResponseOptions = {
  user,
  spEntityId: 'https://sp.example.com',
  acsUrl: 'https://sp.example.com/acs',
  inResponseTo: '_reqId',
};

describe('buildAuthnResponse', () => {
  it('returns a valid XML string', () => {
    const xml = buildAuthnResponse(buildOpts, testConfig);
    expect(typeof xml).toBe('string');
    expect(xml.startsWith('<?xml')).toBe(true);
  });

  it('contains samlp:Response root element', () => {
    const xml = buildAuthnResponse(buildOpts, testConfig);
    expect(xml).toContain('samlp:Response');
  });

  it('contains saml:Assertion for success', () => {
    const xml = buildAuthnResponse(buildOpts, testConfig);
    expect(xml).toContain('saml:Assertion');
  });

  it('contains ds:Signature when signAssertion is true', () => {
    const xml = buildAuthnResponse(buildOpts, testConfig);
    expect(xml).toContain('ds:Signature');
  });

  it('does not contain Assertion for failure status', () => {
    const xml = buildAuthnResponse(
      { ...buildOpts, statusCode: 'urn:oasis:names:tc:SAML:2.0:status:AuthnFailed' },
      testConfig,
    );
    expect(xml).not.toContain('saml:Assertion');
  });

  it('contains AttributeStatement with provided attributes', () => {
    const xml = buildAuthnResponse(buildOpts, testConfig);
    expect(xml).toContain('saml:AttributeStatement');
    expect(xml).toContain('Name="email"');
    expect(xml).toContain('Name="role"');
    expect(xml).toContain('admin');
  });

  it('multi-value attributes are all emitted', () => {
    const xml = buildAuthnResponse(
      {
        ...buildOpts,
        user: { nameId: 'user@example.com', attributes: { roles: ['admin', 'user'] } },
      },
      testConfig,
    );
    expect(xml).toContain('admin');
    expect(xml).toContain('user');
  });

  it('response ID starts with underscore', () => {
    const xml = buildAuthnResponse(buildOpts, testConfig);
    expect(xml).toMatch(/ID="_[a-f0-9]+"/);
  });

  it('uses provided issuer over entityId', () => {
    const xml = buildAuthnResponse(buildOpts, {
      ...testConfig,
      issuer: 'https://custom-issuer.example.com',
    });
    expect(xml).toContain('https://custom-issuer.example.com');
  });

  it('includes custom authnContextClassRef', () => {
    const xml = buildAuthnResponse(buildOpts, {
      ...testConfig,
      authnContextClassRef: 'urn:oasis:names:tc:SAML:2.0:ac:classes:X509',
    });
    expect(xml).toContain('urn:oasis:names:tc:SAML:2.0:ac:classes:X509');
  });
});

describe('buildLogoutResponse', () => {
  it('returns signed XML with LogoutResponse element', () => {
    const xml = buildLogoutResponse(
      { destination: 'https://sp.example.com/slo', inResponseTo: '_logoutreq' },
      testConfig,
    );
    expect(xml).toContain('samlp:LogoutResponse');
    expect(xml).toContain('ds:Signature');
  });

  it('includes InResponseTo when provided', () => {
    const xml = buildLogoutResponse(
      { inResponseTo: '_logoutreq' },
      testConfig,
    );
    expect(xml).toContain('InResponseTo="_logoutreq"');
  });

  it('uses Success status code by default', () => {
    const xml = buildLogoutResponse({}, testConfig);
    expect(xml).toContain('urn:oasis:names:tc:SAML:2.0:status:Success');
  });
});
