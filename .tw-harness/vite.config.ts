import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
const repo = path.resolve(__dirname, '..')
export default defineConfig({
  root: repo,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(repo, 'src') } },
  build: { outDir: path.resolve(__dirname, 'dist'), emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, 'tw.html') } },
})
