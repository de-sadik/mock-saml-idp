import { MockSamlIdp } from '../MockSamlIdp';
import type { IdpConfig } from '../types';

const PING_DEFAULTS: Partial<IdpConfig> = {
  nameIdFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  signResponse: false,
  signAssertion: true,
};

/**
 * PingFederate standard attribute names.
 */
export const PING_ATTRIBUTE_NAMES = {
  subject: 'subject',
  email: 'email',
  uid: 'uid',
  cn: 'cn',
} as const;

export class PingFederateProvider extends MockSamlIdp {
  static create(
    config: Partial<IdpConfig> & { privateKey: string; certificate: string },
  ): PingFederateProvider {
    return new PingFederateProvider({ ...PING_DEFAULTS, ...config } as IdpConfig);
  }
}
