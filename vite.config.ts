import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` sets mode "https": self-signed cert, exposed on the LAN
// so an iPhone/iPad on the same Wi-Fi can open it (getUserMedia needs HTTPS).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: mode === 'https' ? { host: true } : undefined,
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.ts', 'test/**/*.test.ts'] },
}));
