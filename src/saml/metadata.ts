import { create } from 'xmlbuilder2';
import { stripPemHeaders } from './crypto';
import type { IdpConfig, SamlMetadataOptions, NameIdFormat } from '../types';

const DEFAULT_NAMEID_FORMAT: NameIdFormat =
  'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';

/**
 * Generate IdP metadata XML conforming to the SAML 2.0 metadata schema.
 */
export function generateMetadata(
  config: IdpConfig,
  options: SamlMetadataOptions = {},
): string {
  const certRaw = stripPemHeaders(config.certificate);
  const nameIdFormat = config.nameIdFormat ?? DEFAULT_NAMEID_FORMAT;

  const entityDescAttrs: Record<string, string> = {
    'xmlns': 'urn:oasis:names:tc:SAML:2.0:metadata',
    'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
    entityID: config.entityId,
  };
  if (options.validUntil) {
    entityDescAttrs['validUntil'] = options.validUntil.toISOString();
  }
  if (options.cacheDuration) {
    entityDescAttrs['cacheDuration'] = options.cacheDuration;
  }

  const doc = create({ version: '1.0', encoding: 'UTF-8' });
  const entityDesc = doc.ele('EntityDescriptor', entityDescAttrs);

  const idpDescAttrs: Record<string, string> = {
    WantAuthnRequestsSigned: String(
      options.wantAuthnRequestsSigned ?? false,
    ),
    protocolSupportEnumeration: 'urn:oasis:names:tc:SAML:2.0:protocol',
  };

  const idpSso = entityDesc.ele('IDPSSODescriptor', idpDescAttrs);

  // Signing key descriptor
  const keyDescriptor = idpSso.ele('KeyDescriptor', { use: 'signing' });
  const keyInfo = keyDescriptor.ele('ds:KeyInfo');
  keyInfo.ele('ds:X509Data').ele('ds:X509Certificate').txt(certRaw);

  // SLO services
  if (config.sloUrl) {
    idpSso.ele('SingleLogoutService', {
      Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
      Location: config.sloUrl,
    });
    idpSso.ele('SingleLogoutService', {
      Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
      Location: config.sloUrl,
    });
  }

  // NameID format
  idpSso.ele('NameIDFormat').txt(nameIdFormat);

  // SSO services
  if (config.ssoUrl) {
    idpSso.ele('SingleSignOnService', {
      Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
      Location: config.ssoUrl,
    });
    idpSso.ele('SingleSignOnService', {
      Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
      Location: config.ssoUrl,
    });
  }

  return doc.end({ prettyPrint: false });
}
