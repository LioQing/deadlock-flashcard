import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/deadlock-flashcard/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@deadlock-api/') || id.includes('node_modules/@stencil/') || id.includes('node_modules/@floating-ui/')) return 'deadlock-ui';
          if (id.includes('node_modules/zod/')) return 'validation';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
