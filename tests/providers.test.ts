import forge from 'node-forge';
import {
  AzureAdProvider,
  AZURE_AD_CLAIM_URIS,
  OktaProvider,
  OKTA_ATTRIBUTE_NAMES,
  OneLoginProvider,
  ONELOGIN_ATTRIBUTE_NAMES,
  PingFederateProvider,
  PING_ATTRIBUTE_NAMES,
  Auth0Provider,
  AUTH0_CLAIM_URIS,
  GoogleProvider,
  GOOGLE_ATTRIBUTE_NAMES,
} from '../src/providers/index';
import type { SamlUser, AuthnRequestOptions } from '../src/types';

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

const keys = generateTestKeyPair();
const baseConfig = {
  entityId: 'https://idp.example.com',
  ...keys,
  ssoUrl: 'https://idp.example.com/sso',
  sloUrl: 'https://idp.example.com/slo',
};

const testUser: SamlUser = {
  nameId: 'user@example.com',
  email: 'user@example.com',
  firstName: 'Jane',
  lastName: 'Smith',
};

const baseAuthnOpts: AuthnRequestOptions = {
  user: testUser,
  spEntityId: 'https://sp.example.com',
  acsUrl: 'https://sp.example.com/acs',
  inResponseTo: '_req1',
};

// -----------------------------------------------------------------------
describe('AzureAdProvider', () => {
  const provider = AzureAdProvider.create(baseConfig);

  it('creates a provider instance', () => {
    expect(provider).toBeInstanceOf(AzureAdProvider);
  });

  it('uses email NameID format by default', () => {
    const xml = provider.createAuthnResponseXml({
      ...baseAuthnOpts,
      user: {
        ...testUser,
        attributes: {
          [AZURE_AD_CLAIM_URIS.email]: 'user@example.com',
          [AZURE_AD_CLAIM_URIS.givenName]: 'Jane',
          [AZURE_AD_CLAIM_URIS.surname]: 'Smith',
        },
      },
    });
    expect(xml).toContain('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
  });

  it('uses Azure claim URIs as attribute names', () => {
    const xml = provider.createAuthnResponseXml({
      ...baseAuthnOpts,
      user: {
        ...testUser,
        attributes: {
          [AZURE_AD_CLAIM_URIS.email]: 'user@example.com',
          [AZURE_AD_CLAIM_URIS.displayName]: 'Jane Smith',
          [AZURE_AD_CLAIM_URIS.objectId]: 'object-id-123',
        },
      },
    });
    expect(xml).toContain(AZURE_AD_CLAIM_URIS.email);
    expect(xml).toContain(AZURE_AD_CLAIM_URIS.displayName);
    expect(xml).toContain(AZURE_AD_CLAIM_URIS.objectId);
  });

  it('signs assertion but not response by default', () => {
    const xml = provider.createAuthnResponseXml(baseAuthnOpts);
    // Should have exactly 1 signature (assertion only)
    const sigCount = (xml.match(/<ds:Signature[\s>]/g) ?? []).length;
    expect(sigCount).toBe(1);
    // The signature should be inside the Assertion
    const assertionIdx = xml.indexOf('<saml:Assertion');
    const sigIdx = xml.indexOf('<ds:Signature');
    expect(sigIdx).toBeGreaterThan(assertionIdx);
  });
});

// -----------------------------------------------------------------------
describe('OktaProvider', () => {
  const provider = OktaProvider.create(baseConfig);

  it('creates a provider instance', () => {
    expect(provider).toBeInstanceOf(OktaProvider);
  });

  it('uses Okta attribute names', () => {
    const xml = provider.createAuthnResponseXml({
      ...baseAuthnOpts,
      user: {
        ...testUser,
        attributes: {
          [OKTA_ATTRIBUTE_NAMES.email]: 'user@example.com',
          [OKTA_ATTRIBUTE_NAMES.firstName]: 'Jane',
          [OKTA_ATTRIBUTE_NAMES.lastName]: 'Smith',
          [OKTA_ATTRIBUTE_NAMES.login]: 'user@example.com',
        },
      },
    });
    expect(xml).toContain('Name="email"');
    expect(xml).toContain('Name="firstName"');
    expect(xml).toContain('Name="lastName"');
    expect(xml).toContain('Name="login"');
  });

  it('signs both response and assertion', () => {
    const xml = provider.createAuthnResponseXml(baseAuthnOpts);
    const sigCount = (xml.match(/<ds:Signature[\s>]/g) ?? []).length;
    expect(sigCount).toBe(2);
  });
});

// -----------------------------------------------------------------------
describe('OneLoginProvider', () => {
  const provider = OneLoginProvider.create(baseConfig);

  it('creates a provider instance', () => {
    expect(provider).toBeInstanceOf(OneLoginProvider);
  });

  it('uses OneLogin attribute names', () => {
    const xml = provider.createAuthnResponseXml({
      ...baseAuthnOpts,
      user: {
        ...testUser,
        attributes: {
          [ONELOGIN_ATTRIBUTE_NAMES.email]: 'user@example.com',
          [ONELOGIN_ATTRIBUTE_NAMES.firstName]: 'Jane',
          [ONELOGIN_ATTRIBUTE_NAMES.lastName]: 'Smith',
        },
      },
    });
    expect(xml).toContain('Name="User.email"');
    expect(xml).toContain('Name="User.FirstName"');
    expect(xml).toContain('Name="User.LastName"');
  });

  it('signs both response and assertion', () => {
    const xml = provider.createAuthnResponseXml(baseAuthnOpts);
    const sigCount = (xml.match(/<ds:Signature[\s>]/g) ?? []).length;
    expect(sigCount).toBe(2);
  });
});

// -----------------------------------------------------------------------
describe('PingFederateProvider', () => {
  const provider = PingFederateProvider.create(baseConfig);

  it('creates a provider instance', () => {
    expect(provider).toBeInstanceOf(PingFederateProvider);
  });

  it('uses persistent NameID format', () => {
    const xml = provider.createAuthnResponseXml(baseAuthnOpts);
    expect(xml).toContain('urn:oasis:names:tc:SAML:2.0:nameid-format:persistent');
  });

  it('uses PingFederate attribute names', () => {
    const xml = provider.createAuthnResponseXml({
      ...baseAuthnOpts,
      user: {
        ...testUser,
        attributes: {
          [PING_ATTRIBUTE_NAMES.subject]: 'user@example.com',
          [PING_ATTRIBUTE_NAMES.email]: 'user@example.com',
          [PING_ATTRIBUTE_NAMES.uid]: 'uid123',
          [PING_ATTRIBUTE_NAMES.cn]: 'Jane Smith',
        },
      },
    });
    expect(xml).toContain('Name="subject"');
    expect(xml).toContain('Name="email"');
    expect(xml).toContain('Name="uid"');
    expect(xml).toContain('Name="cn"');
  });

  it('signs only assertion by default', () => {
    const xml = provider.createAuthnResponseXml(baseAuthnOpts);
    const sigCount = (xml.match(/<ds:Signature[\s>]/g) ?? []).length;
    expect(sigCount).toBe(1);
  });
});

// -----------------------------------------------------------------------
describe('Auth0Provider', () => {
  const provider = Auth0Provider.create(baseConfig);

  it('creates a provider instance', () => {
    expect(provider).toBeInstanceOf(Auth0Provider);
  });

  it('signs only response (not assertion) by default', () => {
    const xml = provider.createAuthnResponseXml(baseAuthnOpts);
    const sigCount = (xml.match(/<ds:Signature[\s>]/g) ?? []).length;
    expect(sigCount).toBe(1);
    // The signature should be before the Assertion (on the Response)
    const assertionIdx = xml.indexOf('<saml:Assertion');
    const sigIdx = xml.indexOf('<ds:Signature');
    // Signature is on Response (before or near start), not inside Assertion
    expect(sigIdx).toBeLessThan(assertionIdx);
  });

  it('uses Auth0 claim URIs', () => {
    const xml = provider.createAuthnResponseXml({
      ...baseAuthnOpts,
      user: {
        ...testUser,
        attributes: {
          [AUTH0_CLAIM_URIS.email]: 'user@example.com',
          [AUTH0_CLAIM_URIS.name]: 'Jane Smith',
        },
      },
    });
    expect(xml).toContain(AUTH0_CLAIM_URIS.email);
    expect(xml).toContain(AUTH0_CLAIM_URIS.name);
  });
});

// -----------------------------------------------------------------------
describe('GoogleProvider', () => {
  const provider = GoogleProvider.create(baseConfig);

  it('creates a provider instance', () => {
    expect(provider).toBeInstanceOf(GoogleProvider);
  });

  it('uses email NameID format', () => {
    const xml = provider.createAuthnResponseXml(baseAuthnOpts);
    expect(xml).toContain('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
  });

  it('uses Google attribute names', () => {
    const xml = provider.createAuthnResponseXml({
      ...baseAuthnOpts,
      user: {
        ...testUser,
        attributes: {
          [GOOGLE_ATTRIBUTE_NAMES.email]: 'user@example.com',
          [GOOGLE_ATTRIBUTE_NAMES.firstName]: 'Jane',
          [GOOGLE_ATTRIBUTE_NAMES.lastName]: 'Smith',
        },
      },
    });
    expect(xml).toContain('Name="email"');
    expect(xml).toContain('Name="firstName"');
    expect(xml).toContain('Name="lastName"');
  });

  it('signs assertion but not response', () => {
    const xml = provider.createAuthnResponseXml(baseAuthnOpts);
    const sigCount = (xml.match(/<ds:Signature[\s>]/g) ?? []).length;
    expect(sigCount).toBe(1);
  });
});
