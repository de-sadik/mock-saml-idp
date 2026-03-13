import forge from 'node-forge';
import { MockSamlIdp } from '../src/MockSamlIdp';
import {
  buildMinimalAuthnRequest,
  buildMinimalLogoutRequest,
} from '../src/saml/request';
import type { IdpConfig, AuthnRequestOptions, SamlUser } from '../src/types';

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
  ssoUrl: 'https://idp.example.com/sso',
  sloUrl: 'https://idp.example.com/slo',
  signAssertion: true,
  signResponse: false,
};

const testUser: SamlUser = {
  nameId: 'user@example.com',
  email: 'user@example.com',
  firstName: 'John',
  lastName: 'Doe',
  attributes: {
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe',
  },
};

const testAuthnOptions: AuthnRequestOptions = {
  user: testUser,
  spEntityId: 'https://sp.example.com',
  acsUrl: 'https://sp.example.com/acs',
  inResponseTo: '_req123',
  relayState: 'myRelayState',
};

describe('MockSamlIdp', () => {
  let idp: MockSamlIdp;

  beforeAll(() => {
    idp = new MockSamlIdp(testConfig);
  });

  describe('Metadata generation', () => {
    it('generates valid metadata XML with EntityDescriptor', () => {
      const metadata = idp.getMetadata();
      expect(metadata).toContain('EntityDescriptor');
      expect(metadata).toContain('https://idp.example.com');
      expect(metadata).toContain('IDPSSODescriptor');
    });

    it('includes SSO and SLO service locations', () => {
      const metadata = idp.getMetadata();
      expect(metadata).toContain('https://idp.example.com/sso');
      expect(metadata).toContain('https://idp.example.com/slo');
    });

    it('includes KeyDescriptor with certificate', () => {
      const metadata = idp.getMetadata();
      expect(metadata).toContain('KeyDescriptor');
      expect(metadata).toContain('X509Certificate');
    });

    it('respects wantAuthnRequestsSigned option', () => {
      const meta = idp.getMetadata({ wantAuthnRequestsSigned: true });
      expect(meta).toContain('WantAuthnRequestsSigned="true"');
    });

    it('includes validUntil when provided', () => {
      const validUntil = new Date('2030-01-01T00:00:00Z');
      const meta = idp.getMetadata({ validUntil });
      expect(meta).toContain('validUntil');
      expect(meta).toContain('2030-01-01');
    });
  });

  describe('AuthnResponse (POST binding)', () => {
    it('returns a SamlPostResponse with correct shape', () => {
      const resp = idp.createPostResponse(testAuthnOptions);
      expect(resp.type).toBe('POST');
      expect(resp.url).toBe(testAuthnOptions.acsUrl);
      expect(typeof resp.samlResponse).toBe('string');
      expect(resp.samlResponse.length).toBeGreaterThan(0);
      expect(resp.relayState).toBe('myRelayState');
    });

    it('samlResponse is valid base64', () => {
      const resp = idp.createPostResponse(testAuthnOptions);
      const decoded = Buffer.from(resp.samlResponse, 'base64').toString('utf8');
      expect(decoded).toContain('<samlp:Response');
    });

    it('response contains Issuer', () => {
      const xml = idp.createAuthnResponseXml(testAuthnOptions);
      expect(xml).toContain('<saml:Issuer>https://idp.example.com</saml:Issuer>');
    });

    it('response contains Assertion when status is Success', () => {
      const xml = idp.createAuthnResponseXml(testAuthnOptions);
      expect(xml).toContain('<saml:Assertion');
      expect(xml).toContain('user@example.com');
    });

    it('response contains Signature when signAssertion is true', () => {
      const xml = idp.createAuthnResponseXml(testAuthnOptions);
      expect(xml).toContain('<ds:Signature');
    });

    it('response IDs start with underscore', () => {
      const xml = idp.createAuthnResponseXml(testAuthnOptions);
      const idMatch = xml.match(/ID="_[a-f0-9]+"/);
      expect(idMatch).not.toBeNull();
    });

    it('InResponseTo is set when provided', () => {
      const xml = idp.createAuthnResponseXml(testAuthnOptions);
      expect(xml).toContain('InResponseTo="_req123"');
    });

    it('includes attributes in AttributeStatement', () => {
      const xml = idp.createAuthnResponseXml(testAuthnOptions);
      expect(xml).toContain('saml:AttributeStatement');
      expect(xml).toContain('saml:Attribute');
    });

    it('handles options without relayState', () => {
      const opts = { ...testAuthnOptions, relayState: undefined };
      const resp = idp.createPostResponse(opts);
      expect(resp.relayState).toBeUndefined();
    });
  });

  describe('AuthnResponse (Redirect binding)', () => {
    it('returns a SamlRedirectResponse with a URL', () => {
      const resp = idp.createRedirectResponse(testAuthnOptions);
      expect(resp.type).toBe('REDIRECT');
      expect(resp.url).toContain('SAMLResponse=');
    });

    it('redirect URL contains RelayState when provided', () => {
      const resp = idp.createRedirectResponse(testAuthnOptions);
      expect(resp.url).toContain('RelayState=');
    });
  });

  describe('Error/non-success status codes', () => {
    it('response with AuthnFailed does not include Assertion', () => {
      const xml = idp.createAuthnResponseXml({
        ...testAuthnOptions,
        statusCode: 'urn:oasis:names:tc:SAML:2.0:status:AuthnFailed',
      });
      expect(xml).not.toContain('<saml:Assertion');
      expect(xml).toContain('samlp:Status');
    });

    it('response with RequestDenied contains StatusCode element', () => {
      const xml = idp.createAuthnResponseXml({
        ...testAuthnOptions,
        statusCode: 'urn:oasis:names:tc:SAML:2.0:status:RequestDenied',
      });
      expect(xml).toContain('samlp:StatusCode');
    });

    it('statusMessage is included when provided', () => {
      const xml = idp.createAuthnResponseXml({
        ...testAuthnOptions,
        statusCode: 'urn:oasis:names:tc:SAML:2.0:status:AuthnFailed',
        statusMessage: 'Invalid credentials',
      });
      expect(xml).toContain('Invalid credentials');
    });
  });

  describe('Parsing AuthnRequest', () => {
    it('parses a base64-encoded AuthnRequest', () => {
      const encoded = buildMinimalAuthnRequest({
        id: '_authnreqid',
        issuer: 'https://sp.example.com',
        acsUrl: 'https://sp.example.com/acs',
        destination: 'https://idp.example.com/sso',
      });
      const parsed = idp.parseAuthnRequest(encoded);
      expect(parsed.id).toBe('_authnreqid');
      expect(parsed.issuer).toBe('https://sp.example.com');
      expect(parsed.acsUrl).toBe('https://sp.example.com/acs');
    });

    it('parsed request raw field contains XML', () => {
      const encoded = buildMinimalAuthnRequest({
        id: '_test',
        issuer: 'https://sp.example.com',
        acsUrl: 'https://sp.example.com/acs',
      });
      const parsed = idp.parseAuthnRequest(encoded);
      expect(parsed.raw).toContain('AuthnRequest');
    });
  });

  describe('LogoutResponse', () => {
    it('createLogoutResponseXml returns signed XML', () => {
      const xml = idp.createLogoutResponseXml({
        nameId: 'user@example.com',
        inResponseTo: '_logoutreq',
      });
      expect(xml).toContain('samlp:LogoutResponse');
      expect(xml).toContain('ds:Signature');
    });

    it('createPostLogoutResponse returns POST response', () => {
      const resp = idp.createPostLogoutResponse({
        nameId: 'user@example.com',
        inResponseTo: '_logoutreq',
        relayState: 'logoutRelay',
      });
      expect(resp.type).toBe('POST');
      expect(resp.relayState).toBe('logoutRelay');
    });

    it('createRedirectLogoutResponse returns REDIRECT response', () => {
      const resp = idp.createRedirectLogoutResponse({
        nameId: 'user@example.com',
      });
      expect(resp.type).toBe('REDIRECT');
    });
  });

  describe('Parsing LogoutRequest', () => {
    it('parses a base64-encoded LogoutRequest', () => {
      const encoded = buildMinimalLogoutRequest({
        id: '_logoutid',
        issuer: 'https://sp.example.com',
        nameId: 'user@example.com',
        sessionIndex: '_session1',
      });
      const parsed = idp.parseLogoutRequest(encoded);
      expect(parsed.id).toBe('_logoutid');
      expect(parsed.issuer).toBe('https://sp.example.com');
      expect(parsed.nameId).toBe('user@example.com');
      expect(parsed.sessionIndex).toBe('_session1');
    });
  });

  describe('signResponse option', () => {
    it('signs the response element when signResponse is true', () => {
      const signedResponseIdp = new MockSamlIdp({
        ...testConfig,
        signResponse: true,
        signAssertion: false,
      });
      const xml = signedResponseIdp.createAuthnResponseXml(testAuthnOptions);
      expect(xml).toContain('<ds:Signature');
    });
  });

  describe('Custom NameID format', () => {
    it('uses persistent NameID format when configured', () => {
      const persistentIdp = new MockSamlIdp({
        ...testConfig,
        nameIdFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
      });
      const xml = persistentIdp.createAuthnResponseXml(testAuthnOptions);
      expect(xml).toContain('urn:oasis:names:tc:SAML:2.0:nameid-format:persistent');
    });
  });

  describe('RSA-SHA512', () => {
    it('uses SHA512 signature algorithm when configured', () => {
      const sha512Idp = new MockSamlIdp({
        ...testConfig,
        signatureAlgorithm:
          'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512',
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha512',
      });
      const xml = sha512Idp.createAuthnResponseXml(testAuthnOptions);
      expect(xml).toContain('ds:Signature');
      expect(xml).toContain('rsa-sha512');
    });
  });
});
