import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En production, le chemin de base (/web-app-ihme/) est passé au build par le
// Dockerfile avec l'option --base. En local, l'application reste servie à la racine.
export default defineConfig({
  plugins: [react()],
  server: {
    // En développement, Vite (port 5173) redirige les appels /api vers Express (port 3000).
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
