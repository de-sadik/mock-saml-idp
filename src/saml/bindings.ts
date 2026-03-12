import { deflateRawSync, inflateRawSync } from 'zlib';

/** Encode XML as base64 (HTTP-POST binding). */
export function encodePostBinding(xml: string): string {
  return Buffer.from(xml, 'utf8').toString('base64');
}

/** Decode base64 to XML (HTTP-POST binding). */
export function decodePostBinding(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

/** Deflate-compress, base64-encode, and URL-encode XML (HTTP-Redirect binding). */
export function encodeRedirectBinding(xml: string): string {
  const deflated = deflateRawSync(Buffer.from(xml, 'utf8'));
  return encodeURIComponent(deflated.toString('base64'));
}

/** URL-decode, base64-decode, and inflate XML (HTTP-Redirect binding). */
export function decodeRedirectBinding(encoded: string): string {
  const base64 = decodeURIComponent(encoded);
  const buf = Buffer.from(base64, 'base64');
  return inflateRawSync(buf).toString('utf8');
}

/** Build an HTML auto-submit POST form for the HTTP-POST binding. */
export function buildPostFormHtml(
  url: string,
  samlParam: string,
  samlValue: string,
  relayState?: string,
): string {
  const relayStateInput = relayState
    ? `<input type="hidden" name="RelayState" value="${escapeHtml(relayState)}"/>`
    : '';
  return `<!DOCTYPE html>
<html>
<head><title>SAML POST</title></head>
<body onload="document.forms[0].submit()">
<form method="POST" action="${escapeHtml(url)}">
  <input type="hidden" name="${escapeHtml(samlParam)}" value="${escapeHtml(samlValue)}"/>
  ${relayStateInput}
  <noscript><button type="submit">Submit</button></noscript>
</form>
</body>
</html>`;
}

/** Build a redirect URL with SAML parameters for the HTTP-Redirect binding. */
export function buildRedirectUrl(
  url: string,
  samlParam: string,
  xml: string,
  relayState?: string,
): string {
  const params = new URLSearchParams();
  const deflated = deflateRawSync(Buffer.from(xml, 'utf8'));
  params.set(samlParam, deflated.toString('base64'));
  if (relayState) {
    params.set('RelayState', relayState);
  }
  return `${url}?${params.toString()}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
