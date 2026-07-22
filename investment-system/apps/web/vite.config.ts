import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        equityProjectApplication: fileURLToPath(new URL('./equity-project-application.html', import.meta.url)),
        equityGroupApproval: fileURLToPath(new URL('./equity-group-approval.html', import.meta.url))
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
