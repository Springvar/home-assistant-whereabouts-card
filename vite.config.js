import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/whereabouts-card.ts',
      formats: ['es'],
      fileName: 'home-assistant-whereabouts-card'
    },
    outDir: 'dist',
    rollupOptions: {
      external: [],
    },
    minify: 'esbuild',
  }
});