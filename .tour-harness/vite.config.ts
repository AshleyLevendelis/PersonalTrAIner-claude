import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
const repo = path.resolve(__dirname, '..')
export default defineConfig({
  // Root is the REPO, not this folder. Tailwind v4 auto-detects its sources
  // from the vite root; rooted here it never scanned src/, so utilities used
  // only inside AppTour.tsx (inset-0, z-[60]) were absent from the bundle and
  // the overlay rendered unpositioned. The harness has to be built the way the
  // app is or its verdict is about the harness.
  root: repo,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(repo, 'src') } },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: [path.resolve(__dirname, 'tour-harness.html'), path.resolve(__dirname, 'real.html')] },
  },
})
