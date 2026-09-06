import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const CERT_KEY = path.join(ROOT, '.certs', 'localhost-key.pem')
const CERT_FILE = path.join(ROOT, '.certs', 'localhost.pem')
// Use the mkcert-signed certificate (trusted by the local browser → green padlock)
// when the .certs files exist; otherwise fall back to the auto-generated self-signed cert.
const useMkcert = fs.existsSync(CERT_KEY) && fs.existsSync(CERT_FILE)

// Dev-only endpoint (/__lan-info) that tells the client which LAN URLs to use,
// so teachers can open the app from a phone for HTTPS + GPS geofence attendance.
function lanInfoPlugin() {
  return {
    name: 'lan-info-middleware',
    configureServer(server) {
      server.middlewares.use('/__lan-info', (_req, res) => {
        const interfaces = os.networkInterfaces();
        const ips = Object.values(interfaces)
          .flat()
          .filter((i) => i && i.family === 'IPv4' && !i.internal)
          .map((i) => i.address);
        const addr = server.httpServer && server.httpServer.address();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ips,
          port: addr && typeof addr === 'object' ? addr.port : 5174,
        }));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    ...(useMkcert ? [] : [basicSsl()]),
    lanInfoPlugin(),
  ],
  server: {
    port: 5174,
    host: true,
    https: useMkcert
      ? { key: fs.readFileSync(CERT_KEY), cert: fs.readFileSync(CERT_FILE) }
      : true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Student card photos uploaded to and served by the backend
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})