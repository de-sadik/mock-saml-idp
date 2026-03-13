import { MockSamlIdp } from '../MockSamlIdp';
import type { IdpConfig } from '../types';

const AUTH0_DEFAULTS: Partial<IdpConfig> = {
  nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  signResponse: true,
  signAssertion: false, // Auth0 signs the response, not the assertion by default
};

/**
 * Auth0 attribute claim URIs.
 */
export const AUTH0_CLAIM_URIS = {
  email:
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  name: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
} as const;

export class Auth0Provider extends MockSamlIdp {
  static create(
    config: Partial<IdpConfig> & { privateKey: string; certificate: string },
  ): Auth0Provider {
    return new Auth0Provider({ ...AUTH0_DEFAULTS, ...config } as IdpConfig);
  }
}
