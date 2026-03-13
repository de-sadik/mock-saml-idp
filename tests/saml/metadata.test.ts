import forge from 'node-forge';
import { generateMetadata } from '../../src/saml/metadata';
import type { IdpConfig } from '../../src/types';

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
  nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
};

describe('generateMetadata', () => {
  it('returns valid XML string', () => {
    const metadata = generateMetadata(testConfig);
    expect(metadata.startsWith('<?xml')).toBe(true);
  });

  it('contains EntityDescriptor with correct entityID', () => {
    const metadata = generateMetadata(testConfig);
    expect(metadata).toContain('EntityDescriptor');
    expect(metadata).toContain('entityID="https://idp.example.com"');
  });

  it('contains IDPSSODescriptor', () => {
    const metadata = generateMetadata(testConfig);
    expect(metadata).toContain('IDPSSODescriptor');
  });

  it('contains KeyDescriptor with signing use', () => {
    const metadata = generateMetadata(testConfig);
    expect(metadata).toContain('use="signing"');
    expect(metadata).toContain('X509Certificate');
  });

  it('certificate does not contain PEM headers', () => {
    const metadata = generateMetadata(testConfig);
    expect(metadata).not.toContain('-----BEGIN CERTIFICATE-----');
    expect(metadata).not.toContain('-----END CERTIFICATE-----');
  });

  it('contains SSO and SLO service elements', () => {
    const metadata = generateMetadata(testConfig);
    expect(metadata).toContain('SingleSignOnService');
    expect(metadata).toContain('SingleLogoutService');
    expect(metadata).toContain('https://idp.example.com/sso');
    expect(metadata).toContain('https://idp.example.com/slo');
  });

  it('contains both HTTP-POST and HTTP-Redirect bindings for SSO', () => {
    const metadata = generateMetadata(testConfig);
    expect(metadata).toContain(
      'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
    );
    expect(metadata).toContain(
      'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
    );
  });

  it('contains NameIDFormat', () => {
    const metadata = generateMetadata(testConfig);
    expect(metadata).toContain('NameIDFormat');
    expect(metadata).toContain(
      'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    );
  });

  it('includes wantAuthnRequestsSigned="true" when requested', () => {
    const metadata = generateMetadata(testConfig, {
      wantAuthnRequestsSigned: true,
    });
    expect(metadata).toContain('WantAuthnRequestsSigned="true"');
  });

  it('includes validUntil attribute when provided', () => {
    const validUntil = new Date('2035-06-01T00:00:00Z');
    const metadata = generateMetadata(testConfig, { validUntil });
    expect(metadata).toContain('validUntil');
    expect(metadata).toContain('2035-06-01');
  });

  it('omits SLO when sloUrl is not configured', () => {
    const noSlo: IdpConfig = { ...testConfig, sloUrl: undefined };
    const metadata = generateMetadata(noSlo);
    expect(metadata).not.toContain('SingleLogoutService');
  });

  it('omits SSO when ssoUrl is not configured', () => {
    const noSso: IdpConfig = { ...testConfig, ssoUrl: undefined };
    const metadata = generateMetadata(noSso);
    expect(metadata).not.toContain('SingleSignOnService');
  });
});
