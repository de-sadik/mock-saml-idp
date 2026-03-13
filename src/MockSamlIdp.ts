import type {
  IdpConfig,
  SamlBinding,
  SamlMetadataOptions,
  SamlPostResponse,
  SamlRedirectResponse,
  AuthnRequestOptions,
  LogoutRequestOptions,
  ParsedAuthnRequest,
  ParsedLogoutRequest,
} from './types';
import { generateMetadata } from './saml/metadata';
import { buildAuthnResponse, buildLogoutResponse } from './saml/response';
import { parseAuthnRequest, parseLogoutRequest } from './saml/request';
import {
  encodePostBinding,
  encodeRedirectBinding,
  buildRedirectUrl,
} from './saml/bindings';

export class MockSamlIdp {
  constructor(private readonly config: IdpConfig) {}

  /** Generate IdP metadata XML. */
  getMetadata(options?: SamlMetadataOptions): string {
    return generateMetadata(this.config, options);
  }

  /** Parse an incoming SP AuthnRequest. */
  parseAuthnRequest(
    samlRequest: string,
    binding?: SamlBinding,
  ): ParsedAuthnRequest {
    return parseAuthnRequest(samlRequest, binding);
  }

  /** Parse an incoming SP LogoutRequest. */
  parseLogoutRequest(
    samlRequest: string,
    binding?: SamlBinding,
  ): ParsedLogoutRequest {
    return parseLogoutRequest(samlRequest, binding);
  }

  /** Get the raw signed AuthnResponse XML. */
  createAuthnResponseXml(options: AuthnRequestOptions): string {
    return buildAuthnResponse(
      {
        user: options.user,
        spEntityId: options.spEntityId,
        acsUrl: options.acsUrl,
        inResponseTo: options.inResponseTo,
        statusCode: options.statusCode,
        statusMessage: options.statusMessage,
        sessionDuration: options.sessionDuration,
        notBefore: options.notBefore,
        notOnOrAfter: options.notOnOrAfter,
      },
      this.config,
    );
  }

  /** Create an AuthnResponse delivered via HTTP-POST. */
  createPostResponse(options: AuthnRequestOptions): SamlPostResponse {
    const xml = this.createAuthnResponseXml(options);
    return {
      type: 'POST',
      url: options.acsUrl,
      samlResponse: encodePostBinding(xml),
      ...(options.relayState ? { relayState: options.relayState } : {}),
    };
  }

  /** Create an AuthnResponse delivered via HTTP-Redirect. */
  createRedirectResponse(options: AuthnRequestOptions): SamlRedirectResponse {
    const xml = this.createAuthnResponseXml(options);
    const url = buildRedirectUrl(options.acsUrl, 'SAMLResponse', xml, options.relayState);
    return {
      type: 'REDIRECT',
      url,
      ...(options.relayState ? { relayState: options.relayState } : {}),
    };
  }

  /** Get the raw signed LogoutResponse XML. */
  createLogoutResponseXml(options: LogoutRequestOptions): string {
    const sloUrl = this.config.sloUrl ?? options.spEntityId;
    return buildLogoutResponse(
      {
        destination: sloUrl,
        inResponseTo: options.inResponseTo,
      },
      this.config,
    );
  }

  /** Create a LogoutResponse delivered via HTTP-POST. */
  createPostLogoutResponse(options: LogoutRequestOptions): SamlPostResponse {
    const xml = this.createLogoutResponseXml(options);
    const url = this.config.sloUrl ?? '';
    return {
      type: 'POST',
      url,
      samlResponse: encodePostBinding(xml),
      ...(options.relayState ? { relayState: options.relayState } : {}),
    };
  }

  /** Create a LogoutResponse delivered via HTTP-Redirect. */
  createRedirectLogoutResponse(
    options: LogoutRequestOptions,
  ): SamlRedirectResponse {
    const xml = this.createLogoutResponseXml(options);
    const sloUrl = this.config.sloUrl ?? '';
    const url = buildRedirectUrl(sloUrl, 'SAMLResponse', xml, options.relayState);
    return {
      type: 'REDIRECT',
      url,
      ...(options.relayState ? { relayState: options.relayState } : {}),
    };
  }

  /** Encode an XML string for HTTP-Redirect binding (utility). */
  encodeRedirect(xml: string): string {
    return encodeRedirectBinding(xml);
  }
}
