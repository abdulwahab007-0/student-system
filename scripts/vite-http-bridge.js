#!/usr/bin/env node
/*
 * vite-http-bridge.js
 * Plain-HTTP bridge in front of the HTTPS-only Vite dev server (localhost:5174,
 * mkcert/self-signed cert) so any public tunnel (ngrok, localtunnel, serveo, …)
 * can expose the app without caring about our origin's TLS.
 *
 *   Phone --> HTTPS tunnel edge --> http://<bridge>:8090 --> https://localhost:5174
 *                                                              `-- /api --> :3001 (via Vite proxy)
 *
 * Usage:  node scripts/vite-http-bridge.js
 *   Env:   BRIDGE_PORT (default 8090), VITE_URL (default https://localhost:5174)
 */
import http from 'node:http';
import https from 'node:https';

const VITE_URL = process.env.VITE_URL || 'https://localhost:5174';
const PORT = Number(process.env.BRIDGE_PORT || 8090);

const origin = new URL(VITE_URL);

const server = http.createServer((req, res) => {
  const fwd = {
    method: req.method,
    protocol: origin.protocol,
    hostname: origin.hostname,
    port: origin.port || 443,
    path: req.url,
    headers: {
      ...req.headers,
      host: origin.host, // tell Vite we are the origin so app + /api proxy work
    },
    rejectUnauthorized: false, // Vite dev cert is self-signed/mkcert (dev only)
  };

  const upstream = https.request(fwd, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });

  upstream.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`502 Bad Gateway — Vite upstream error: ${err.message}`);
  });

  req.pipe(upstream);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`vite-http-bridge listening on http://0.0.0.0:${PORT}  →  ${VITE_URL}`);
});