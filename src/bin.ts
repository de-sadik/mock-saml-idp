#!/usr/bin/env node

import { startServer } from './server';

const port = parseInt(process.env.PORT ?? '7000', 10);
const host = process.env.HOST ?? 'localhost';
const baseUrl = process.env.IDP_BASE_URL;

const idpConfig = baseUrl
  ? {
      entityId: `${baseUrl}/metadata`,
      ssoUrl: `${baseUrl}/sso`,
      sloUrl: `${baseUrl}/slo`,
    }
  : undefined;

startServer({ port, host, idpConfig })
  .then(({ url }) => {
    const publicUrl = baseUrl ?? url;
    console.log(`\n  🔐 Mock SAML IdP running at ${url}\n`);
    console.log(`  Endpoints:`);
    console.log(`    Landing page:  ${publicUrl}/`);
    console.log(`    Metadata:      ${publicUrl}/metadata`);
    console.log(`    SSO URL:       ${publicUrl}/sso`);
    console.log(`    SLO URL:       ${publicUrl}/slo\n`);
    if (baseUrl) {
      console.log(`  External base URL: ${baseUrl}`);
      console.log(`  (Local server listening on ${url})\n`);
    }
  })
  .catch((err: Error) => {
    console.error('Failed to start Mock SAML IdP server:', err.message);
    process.exit(1);
  });