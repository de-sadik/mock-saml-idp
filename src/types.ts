export type NameIdFormat =
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient'
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:kerberos'
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:WindowsDomainQualifiedName';

export type SignatureAlgorithm =
  | 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
  | 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512';

export type DigestAlgorithm =
  | 'http://www.w3.org/2001/04/xmlenc#sha256'
  | 'http://www.w3.org/2001/04/xmlenc#sha512';

export type SamlBinding =
  | 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST'
  | 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect';

export type StatusCode =
  | 'urn:oasis:names:tc:SAML:2.0:status:Success'
  | 'urn:oasis:names:tc:SAML:2.0:status:Requester'
  | 'urn:oasis:names:tc:SAML:2.0:status:Responder'
  | 'urn:oasis:names:tc:SAML:2.0:status:VersionMismatch'
  | 'urn:oasis:names:tc:SAML:2.0:status:AuthnFailed'
  | 'urn:oasis:names:tc:SAML:2.0:status:InvalidAttrNameOrValue'
  | 'urn:oasis:names:tc:SAML:2.0:status:NoPassive'
  | 'urn:oasis:names:tc:SAML:2.0:status:RequestDenied';

export interface IdpConfig {
  entityId: string;
  privateKey: string;  // PEM format
  certificate: string; // PEM format (without headers or with)
  signatureAlgorithm?: SignatureAlgorithm;
  digestAlgorithm?: DigestAlgorithm;
  nameIdFormat?: NameIdFormat;
  issuer?: string; // defaults to entityId
  ssoUrl?: string;
  sloUrl?: string;
  signResponse?: boolean;    // default: false
  signAssertion?: boolean;   // default: true
  encryptAssertion?: boolean; // default: false
  authnContextClassRef?: string;
  sessionDuration?: number; // seconds, default: 3600
  clockSkew?: number; // seconds for time validation, default: 300
}

export interface SamlUser {
  nameId: string;
  nameIdFormat?: NameIdFormat;
  sessionIndex?: string;
  attributes?: Record<string, string | string[]>;
  email?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  groups?: string[];
  roles?: string[];
}

export interface AuthnRequestOptions {
  user: SamlUser;
  spEntityId: string;
  acsUrl: string;
  inResponseTo?: string;
  relayState?: string;
  statusCode?: StatusCode;
  statusMessage?: string;
  sessionDuration?: number;
  notBefore?: Date;
  notOnOrAfter?: Date;
}

export interface LogoutRequestOptions {
  nameId: string;
  nameIdFormat?: NameIdFormat;
  sessionIndex?: string;
  spEntityId?: string;
  inResponseTo?: string;
  relayState?: string;
}

export interface ParsedAuthnRequest {
  id: string;
  issuer: string;
  acsUrl: string;
  destination?: string;
  nameIdPolicy?: {
    format?: string;
    allowCreate?: boolean;
  };
  forceAuthn?: boolean;
  isPassive?: boolean;
  raw: string;
}

export interface ParsedLogoutRequest {
  id: string;
  issuer: string;
  nameId: string;
  nameIdFormat?: string;
  sessionIndex?: string;
  destination?: string;
  raw: string;
}

export interface SamlPostResponse {
  type: 'POST';
  url: string;
  samlResponse: string;   // base64 encoded
  relayState?: string;
}

export interface SamlRedirectResponse {
  type: 'REDIRECT';
  url: string;  // full URL with query params
  relayState?: string;
}

export interface SamlMetadataOptions {
  wantAuthnRequestsSigned?: boolean;
  validUntil?: Date;
  cacheDuration?: string;
}

export interface SpMetadata {
  entityId: string;
  acsUrl: string;
  sloUrl?: string;
  nameIdFormat?: string;
  wantAssertionsSigned?: boolean;
  certificate?: string;
}
