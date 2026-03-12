import { MockSamlIdp } from '../MockSamlIdp';
import type { IdpConfig } from '../types';

const OKTA_DEFAULTS: Partial<IdpConfig> = {
  nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  authnContextClassRef:
    'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
  signResponse: true,
  signAssertion: true,
};

/**
 * Okta standard attribute names.
 */
export const OKTA_ATTRIBUTE_NAMES = {
  email: 'email',
  firstName: 'firstName',
  lastName: 'lastName',
  login: 'login',
  groups: 'groups',
} as const;

export class OktaProvider extends MockSamlIdp {
  static create(
    config: Partial<IdpConfig> & { privateKey: string; certificate: string },
  ): OktaProvider {
    return new OktaProvider({ ...OKTA_DEFAULTS, ...config } as IdpConfig);
  }
}
