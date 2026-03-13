import { MockSamlIdp } from '../MockSamlIdp';
import type { IdpConfig } from '../types';

const GOOGLE_DEFAULTS: Partial<IdpConfig> = {
  nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  signResponse: false,
  signAssertion: true,
};

/**
 * Google Workspace standard attribute names.
 */
export const GOOGLE_ATTRIBUTE_NAMES = {
  email: 'email',
  firstName: 'firstName',
  lastName: 'lastName',
} as const;

export class GoogleProvider extends MockSamlIdp {
  static create(
    config: Partial<IdpConfig> & { privateKey: string; certificate: string },
  ): GoogleProvider {
    return new GoogleProvider({ ...GOOGLE_DEFAULTS, ...config } as IdpConfig);
  }
}
