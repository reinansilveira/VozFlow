import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Painel administrativo de licenças (SPEC, seção de licenciamento). Variáveis em admin/.env.
export default defineConfig({
  root: 'admin',
  publicDir: 'public',
  plugins: [react()],
  server: {
    port: 5190,
  },
  preview: {
    port: 5191,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
});
