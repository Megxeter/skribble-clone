import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@skribbl/shared': path.resolve(__dirname, '../shared/index.ts')
    }
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      },
      '/health': {
        target: 'http://localhost:3000'
      }
    }
  }
});
