import { MockSamlIdp } from '../MockSamlIdp';
import type { IdpConfig } from '../types';

const ONELOGIN_DEFAULTS: Partial<IdpConfig> = {
  nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  signResponse: true,
  signAssertion: true,
};

/**
 * OneLogin standard attribute names.
 */
export const ONELOGIN_ATTRIBUTE_NAMES = {
  email: 'User.email',
  firstName: 'User.FirstName',
  lastName: 'User.LastName',
  memberOf: 'memberOf',
} as const;

export class OneLoginProvider extends MockSamlIdp {
  static create(
    config: Partial<IdpConfig> & { privateKey: string; certificate: string },
  ): OneLoginProvider {
    return new OneLoginProvider({ ...ONELOGIN_DEFAULTS, ...config } as IdpConfig);
  }
}
