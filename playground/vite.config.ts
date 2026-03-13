import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/slang/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@slang': resolve(__dirname, '../src'),
    },
  },
  server: {
    port: 5174,
  },
}));
