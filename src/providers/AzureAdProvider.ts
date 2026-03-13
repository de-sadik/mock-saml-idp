import { MockSamlIdp } from '../MockSamlIdp';
import type { IdpConfig } from '../types';

const AZURE_DEFAULTS: Partial<IdpConfig> = {
  nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  authnContextClassRef:
    'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
  signResponse: false,
  signAssertion: true,
};

/**
 * Azure AD claim URIs used as attribute names.
 */
export const AZURE_AD_CLAIM_URIS = {
  email:
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  givenName:
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
  surname:
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
  displayName:
    'http://schemas.microsoft.com/identity/claims/displayname',
  objectId:
    'http://schemas.microsoft.com/identity/claims/objectidentifier',
} as const;

export class AzureAdProvider extends MockSamlIdp {
  static create(
    config: Partial<IdpConfig> & { privateKey: string; certificate: string },
  ): AzureAdProvider {
    return new AzureAdProvider({ ...AZURE_DEFAULTS, ...config } as IdpConfig);
  }
}
