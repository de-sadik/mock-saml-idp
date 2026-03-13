#!/usr/bin/env node

import { startServer } from './server';

const port = parseInt(process.env.PORT ?? '7000', 10);
const host = process.env.HOST ?? 'localhost';

startServer({ port, host })
  .then(({ url }) => {
    console.log(`\n  🔐 Mock SAML IdP running at ${url}\n`);
    console.log(`  Endpoints:`);
    console.log(`    Landing page:  ${url}/`);
    console.log(`    Metadata:      ${url}/metadata`);
    console.log(`    SSO URL:       ${url}/sso`);
    console.log(`    SLO URL:       ${url}/slo\n`);
  })
  .catch((err: Error) => {
    console.error('Failed to start Mock SAML IdP server:', err.message);
    process.exit(1);
  });
