import { v4 as uuidv4 } from 'uuid';
import { create } from 'xmlbuilder2';
import { signXml, stripPemHeaders } from './crypto';
import type {
  IdpConfig,
  StatusCode,
  NameIdFormat,
  SignatureAlgorithm,
  DigestAlgorithm,
} from '../types';

const DEFAULT_AUTHN_CONTEXT =
  'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport';
const DEFAULT_SIG_ALG: SignatureAlgorithm =
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const DEFAULT_DIGEST_ALG: DigestAlgorithm = 'http://www.w3.org/2001/04/xmlenc#sha256';
const DEFAULT_NAMEID_FORMAT: NameIdFormat =
  'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';

export interface BuildResponseOptions {
  user: {
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
  };
  spEntityId: string;
  acsUrl: string;
  inResponseTo?: string;
  statusCode?: StatusCode;
  statusMessage?: string;
  sessionDuration?: number;
  notBefore?: Date;
  notOnOrAfter?: Date;
}

export interface BuildLogoutResponseOptions {
  destination?: string;
  inResponseTo?: string;
  statusCode?: StatusCode;
}

function makeId(): string {
  return `_${uuidv4().replace(/-/g, '')}`;
}

function toIsoUtc(d: Date): string {
  return d.toISOString();
}

/**
 * Build and sign a SAML AuthnResponse XML string.
 */
export function buildAuthnResponse(
  options: BuildResponseOptions,
  config: IdpConfig,
): string {
  const now = new Date();
  const sessionDurationSec =
    options.sessionDuration ?? config.sessionDuration ?? 3600;
  const notBefore = options.notBefore ?? now;
  const notOnOrAfter =
    options.notOnOrAfter ?? new Date(now.getTime() + sessionDurationSec * 1000);

  const responseId = makeId();
  const assertionId = makeId();
  const issuer = config.issuer ?? config.entityId;
  const statusCode =
    options.statusCode ?? 'urn:oasis:names:tc:SAML:2.0:status:Success';
  const nameIdFormat =
    options.user.nameIdFormat ?? config.nameIdFormat ?? DEFAULT_NAMEID_FORMAT;
  const sessionIndex = options.user.sessionIndex ?? makeId();
  const authnContextClassRef =
    config.authnContextClassRef ?? DEFAULT_AUTHN_CONTEXT;
  const sigAlg = config.signatureAlgorithm ?? DEFAULT_SIG_ALG;
  const digestAlg = config.digestAlgorithm ?? DEFAULT_DIGEST_ALG;
  const signAssertion = config.signAssertion !== false;
  const signResponse = config.signResponse === true;

  // ---- Build attribute values ----------------------------------------
  const allAttributes: Record<string, string[]> = {};

  const addAttr = (name: string, value: string | string[] | undefined) => {
    if (value === undefined) return;
    allAttributes[name] = Array.isArray(value) ? value : [value];
  };

  if (options.user.attributes) {
    for (const [k, v] of Object.entries(options.user.attributes)) {
      addAttr(k, v);
    }
  }

  // ---- Build XML tree ------------------------------------------------
  const doc = create({ version: '1.0', encoding: 'UTF-8' });
  const response = doc
    .ele('samlp:Response', {
      'xmlns:samlp': 'urn:oasis:names:tc:SAML:2.0:protocol',
      'xmlns:saml': 'urn:oasis:names:tc:SAML:2.0:assertion',
      ID: responseId,
      Version: '2.0',
      IssueInstant: toIsoUtc(now),
      Destination: options.acsUrl,
      ...(options.inResponseTo ? { InResponseTo: options.inResponseTo } : {}),
    });

  response.ele('saml:Issuer').txt(issuer);

  const status = response.ele('samlp:Status');
  const statusCodeEle = status.ele('samlp:StatusCode', { Value: statusCode });
  if (options.statusMessage) {
    status.ele('samlp:StatusMessage').txt(options.statusMessage);
  }
  // Sub-status codes for non-success responses
  if (
    statusCode !== 'urn:oasis:names:tc:SAML:2.0:status:Success' &&
    statusCode.startsWith('urn:oasis:names:tc:SAML:2.0:status:')
  ) {
    const topLevel = 'urn:oasis:names:tc:SAML:2.0:status:Responder';
    statusCodeEle.att('Value', topLevel);
    statusCodeEle.ele('samlp:StatusCode', { Value: statusCode });
  }

  // Only include Assertion on success
  if (statusCode === 'urn:oasis:names:tc:SAML:2.0:status:Success') {
    const assertion = response.ele('saml:Assertion', {
      'xmlns:saml': 'urn:oasis:names:tc:SAML:2.0:assertion',
      ID: assertionId,
      Version: '2.0',
      IssueInstant: toIsoUtc(now),
    });

    assertion.ele('saml:Issuer').txt(issuer);

    const subject = assertion.ele('saml:Subject');
    subject
      .ele('saml:NameID', { Format: nameIdFormat })
      .txt(options.user.nameId);
    const subjConf = subject.ele('saml:SubjectConfirmation', {
      Method: 'urn:oasis:names:tc:SAML:2.0:cm:bearer',
    });
    subjConf.ele('saml:SubjectConfirmationData', {
      NotOnOrAfter: toIsoUtc(notOnOrAfter),
      Recipient: options.acsUrl,
      ...(options.inResponseTo
        ? { InResponseTo: options.inResponseTo }
        : {}),
    });

    assertion.ele('saml:Conditions', {
      NotBefore: toIsoUtc(notBefore),
      NotOnOrAfter: toIsoUtc(notOnOrAfter),
    }).ele('saml:AudienceRestriction').ele('saml:Audience').txt(options.spEntityId);

    assertion
      .ele('saml:AuthnStatement', {
        AuthnInstant: toIsoUtc(now),
        SessionIndex: sessionIndex,
        SessionNotOnOrAfter: toIsoUtc(notOnOrAfter),
      })
      .ele('saml:AuthnContext')
      .ele('saml:AuthnContextClassRef')
      .txt(authnContextClassRef);

    if (Object.keys(allAttributes).length > 0) {
      const attrStatement = assertion.ele('saml:AttributeStatement');
      for (const [name, values] of Object.entries(allAttributes)) {
        const attr = attrStatement.ele('saml:Attribute', {
          Name: name,
          NameFormat:
            'urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified',
        });
        for (const val of values) {
          attr
            .ele('saml:AttributeValue', {
              'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
              'xsi:type': 'xs:string',
              'xmlns:xs': 'http://www.w3.org/2001/XMLSchema',
            })
            .txt(val);
        }
      }
    }
  }

  let xml = doc.end({ prettyPrint: false });

  if (
    statusCode === 'urn:oasis:names:tc:SAML:2.0:status:Success' &&
    signAssertion
  ) {
    xml = signXml(
      xml,
      config.privateKey,
      config.certificate,
      sigAlg,
      digestAlg,
      assertionId,
    );
  }

  if (signResponse) {
    xml = signXml(
      xml,
      config.privateKey,
      config.certificate,
      sigAlg,
      digestAlg,
      responseId,
    );
  }

  return xml;
}

/**
 * Build a SAML LogoutResponse XML string.
 */
export function buildLogoutResponse(
  options: BuildLogoutResponseOptions,
  config: IdpConfig,
): string {
  const now = new Date();
  const responseId = makeId();
  const issuer = config.issuer ?? config.entityId;
  const statusCode =
    options.statusCode ?? 'urn:oasis:names:tc:SAML:2.0:status:Success';
  const sigAlg = config.signatureAlgorithm ?? DEFAULT_SIG_ALG;
  const digestAlg = config.digestAlgorithm ?? DEFAULT_DIGEST_ALG;

  const doc = create({ version: '1.0', encoding: 'UTF-8' });
  doc
    .ele('samlp:LogoutResponse', {
      'xmlns:samlp': 'urn:oasis:names:tc:SAML:2.0:protocol',
      'xmlns:saml': 'urn:oasis:names:tc:SAML:2.0:assertion',
      ID: responseId,
      Version: '2.0',
      IssueInstant: toIsoUtc(now),
      ...(options.destination ? { Destination: options.destination } : {}),
      ...(options.inResponseTo
        ? { InResponseTo: options.inResponseTo }
        : {}),
    })
    .ele('saml:Issuer')
    .txt(issuer)
    .up()
    .ele('samlp:Status')
    .ele('samlp:StatusCode', { Value: statusCode });

  let xml = doc.end({ prettyPrint: false });

  // Always sign logout responses
  xml = signXml(
    xml,
    config.privateKey,
    config.certificate,
    sigAlg,
    digestAlg,
    responseId,
  );

  return xml;
}

/** Strip PEM cert headers for embedding in metadata/KeyInfo */
export { stripPemHeaders };
