import { convert } from 'xmlbuilder2';
import { decodePostBinding, decodeRedirectBinding } from './bindings';
import type { ParsedAuthnRequest, ParsedLogoutRequest, SamlBinding } from '../types';

type XmlNode = Record<string, unknown>;

/**
 * Get an attribute value from an xmlbuilder2 JSON object node.
 * Attributes are stored with the "@" prefix, e.g. "@ID".
 */
function attr(node: XmlNode, name: string): string {
  const val = node[`@${name}`];
  if (typeof val === 'string') return val;
  return '';
}

/**
 * Get a child node or raw value by key, following arrays to their first element.
 */
function child(node: XmlNode, ...keys: string[]): XmlNode | string | undefined {
  let cur: unknown = node;
  for (const key of keys) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    const next = (cur as XmlNode)[key];
    if (Array.isArray(next)) {
      cur = next[0];
    } else {
      cur = next;
    }
  }
  if (cur === undefined) return undefined;
  if (typeof cur === 'string') return cur;
  if (typeof cur === 'object' && cur !== null) return cur as XmlNode;
  return undefined;
}

/**
 * Get text content from a node or string value.
 */
function textContent(node: XmlNode | string | undefined): string {
  if (node === undefined) return '';
  if (typeof node === 'string') return node;
  const t = node['#'] ?? node['#text'];
  if (typeof t === 'string') return t;
  return '';
}

function rawChildText(parent: XmlNode, ...keys: string[]): string {
  return textContent(child(parent, ...keys));
}

function decodeRequest(samlRequest: string, binding?: SamlBinding): string {
  if (binding === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect') {
    return decodeRedirectBinding(samlRequest);
  }
  return decodePostBinding(samlRequest);
}

/**
 * Parse a SAML AuthnRequest from a base64 (POST) or deflate-base64 (Redirect) string.
 */
export function parseAuthnRequest(
  samlRequest: string,
  binding?: SamlBinding,
): ParsedAuthnRequest {
  const xml = decodeRequest(samlRequest, binding);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = convert(xml, { format: 'object' }) as any;

  const root: XmlNode =
    obj['samlp:AuthnRequest'] ??
    obj['AuthnRequest'] ??
    obj['samlp:authnrequest'] ??
    (obj as XmlNode);

  const id = attr(root, 'ID') || attr(root, 'Id') || attr(root, 'id');
  const destination = attr(root, 'Destination');
  const acsUrl =
    attr(root, 'AssertionConsumerServiceURL') ||
    attr(root, 'AssertionConsumerServiceUrl');

  const issuer = rawChildText(root, 'saml:Issuer') || rawChildText(root, 'Issuer');

  const forceAuthnStr = attr(root, 'ForceAuthn');
  const isPassiveStr = attr(root, 'IsPassive');

  const nameIdPolicyRaw =
    child(root, 'samlp:NameIDPolicy') ??
    child(root, 'NameIDPolicy') ??
    child(root, 'samlp:nameidpolicy');
  const nameIdPolicyNode =
    typeof nameIdPolicyRaw === 'object' ? nameIdPolicyRaw as XmlNode : undefined;

  let nameIdPolicy: ParsedAuthnRequest['nameIdPolicy'];
  if (nameIdPolicyNode) {
    const format = attr(nameIdPolicyNode, 'Format');
    const allowCreateStr = attr(nameIdPolicyNode, 'AllowCreate');
    nameIdPolicy = {
      ...(format ? { format } : {}),
      ...(allowCreateStr
        ? { allowCreate: allowCreateStr.toLowerCase() === 'true' }
        : {}),
    };
  }

  return {
    id,
    issuer,
    acsUrl,
    ...(destination ? { destination } : {}),
    ...(nameIdPolicy ? { nameIdPolicy } : {}),
    ...(forceAuthnStr
      ? { forceAuthn: forceAuthnStr.toLowerCase() === 'true' }
      : {}),
    ...(isPassiveStr
      ? { isPassive: isPassiveStr.toLowerCase() === 'true' }
      : {}),
    raw: xml,
  };
}

/**
 * Parse a SAML LogoutRequest from a base64 (POST) or deflate-base64 (Redirect) string.
 */
export function parseLogoutRequest(
  samlRequest: string,
  binding?: SamlBinding,
): ParsedLogoutRequest {
  const xml = decodeRequest(samlRequest, binding);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = convert(xml, { format: 'object' }) as any;

  const root: XmlNode =
    obj['samlp:LogoutRequest'] ??
    obj['LogoutRequest'] ??
    obj['samlp:logoutrequest'] ??
    (obj as XmlNode);

  const id = attr(root, 'ID') || attr(root, 'Id') || attr(root, 'id');
  const destination = attr(root, 'Destination');
  const issuer = rawChildText(root, 'saml:Issuer') || rawChildText(root, 'Issuer');

  const nameIdRaw =
    child(root, 'saml:NameID') ??
    child(root, 'NameID') ??
    child(root, 'saml:nameid');
  const nameIdNode = typeof nameIdRaw === 'object' ? nameIdRaw as XmlNode : undefined;
  const nameId = nameIdNode ? textContent(nameIdNode) : (typeof nameIdRaw === 'string' ? nameIdRaw : '');
  const nameIdFormat = nameIdNode ? attr(nameIdNode, 'Format') : undefined;

  const sessionIndexRaw =
    child(root, 'samlp:SessionIndex') ??
    child(root, 'SessionIndex') ??
    child(root, 'saml:SessionIndex');
  const sessionIndex = textContent(sessionIndexRaw as XmlNode | string | undefined);

  return {
    id,
    issuer,
    nameId,
    ...(nameIdFormat ? { nameIdFormat } : {}),
    ...(sessionIndex ? { sessionIndex } : {}),
    ...(destination ? { destination } : {}),
    raw: xml,
  };
}

/** Decode a raw XML string – convenience helper for tests. */
export function decodeAndParseXml(
  encoded: string,
  binding?: SamlBinding,
): string {
  return decodeRequest(encoded, binding);
}

/** Build a minimal base64-encoded AuthnRequest (for testing). */
export function buildMinimalAuthnRequest(opts: {
  id: string;
  issuer: string;
  acsUrl: string;
  destination?: string;
}): string {
  const xml = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${opts.id}" Version="2.0" IssueInstant="${new Date().toISOString()}" AssertionConsumerServiceURL="${opts.acsUrl}"${opts.destination ? ` Destination="${opts.destination}"` : ''}><saml:Issuer>${opts.issuer}</saml:Issuer><samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/></samlp:AuthnRequest>`;
  return Buffer.from(xml, 'utf8').toString('base64');
}

/** Build a minimal base64-encoded LogoutRequest (for testing). */
export function buildMinimalLogoutRequest(opts: {
  id: string;
  issuer: string;
  nameId: string;
  nameIdFormat?: string;
  sessionIndex?: string;
  destination?: string;
}): string {
  const sessionIndexXml = opts.sessionIndex
    ? `<samlp:SessionIndex>${opts.sessionIndex}</samlp:SessionIndex>`
    : '';
  const xml = `<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${opts.id}" Version="2.0" IssueInstant="${new Date().toISOString()}"${opts.destination ? ` Destination="${opts.destination}"` : ''}><saml:Issuer>${opts.issuer}</saml:Issuer><saml:NameID Format="${opts.nameIdFormat ?? 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'}">${opts.nameId}</saml:NameID>${sessionIndexXml}</samlp:LogoutRequest>`;
  return Buffer.from(xml, 'utf8').toString('base64');
}
