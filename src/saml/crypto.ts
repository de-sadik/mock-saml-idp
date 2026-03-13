import { SignedXml } from 'xml-crypto';
import type { SignatureAlgorithm, DigestAlgorithm } from '../types';

/**
 * Strip PEM headers/footers and whitespace from a certificate or key.
 */
export function stripPemHeaders(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
}

/**
 * Wrap a raw base64 string in PEM certificate headers with 64-char line breaks.
 */
export function formatCertificate(cert: string): string {
  const stripped = stripPemHeaders(cert);
  const lines = stripped.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

/**
 * Sign an XML string using xml-crypto.
 *
 * The Signature element is inserted after the first Issuer child of the signed
 * element, matching the position required by the SAML 2.0 Core specification.
 * Uses the `ds:` namespace prefix for the Signature element.
 *
 * @param xml - The XML string to sign
 * @param privateKey - RSA private key in PEM format
 * @param publicCert - X.509 certificate in PEM format (used for KeyInfo)
 * @param algorithm - Signature algorithm URI
 * @param digestAlgorithm - Digest algorithm URI
 * @param referenceId - The ID attribute value of the element to sign (without #)
 */
export function signXml(
  xml: string,
  privateKey: string,
  publicCert: string,
  algorithm: SignatureAlgorithm,
  digestAlgorithm: DigestAlgorithm,
  referenceId: string,
): string {
  const sig = new SignedXml({
    privateKey,
    publicCert: formatCertificate(publicCert),
    signatureAlgorithm: algorithm,
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });

  sig.addReference({
    xpath: `//*[@ID='${referenceId}']`,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
    digestAlgorithm,
  });

  // Insert Signature after the Issuer child element (SAML spec §5.4.2).
  // Using local-name() avoids namespace-prefix issues in the XPath.
  const issuerRef = `//*[@ID='${referenceId}']/*[local-name(.)='Issuer']`;
  sig.computeSignature(xml, {
    prefix: 'ds',
    location: {
      reference: issuerRef,
      action: 'after',
    },
  });

  return sig.getSignedXml();
}

/**
 * Generate a self-signed RSA key pair for testing purposes.
 * Requires node-forge to be installed as a devDependency.
 */
export function generateKeyPair(): { privateKey: string; certificate: string } {
  // Dynamically require node-forge so it stays a devDependency
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const forge = require('node-forge') as typeof import('node-forge');
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keypair.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [{ name: 'commonName', value: 'Test IdP' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keypair.privateKey, forge.md.sha256.create());
  return {
    privateKey: forge.pki.privateKeyToPem(keypair.privateKey),
    certificate: forge.pki.certificateToPem(cert),
  };
}
