import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Sentry's release and environment tags (src/instrument.ts), read from the variables Vercel sets on every
  // build: the commit being shipped, and production / preview. Empty locally, where the SDK is off anyway.
  define: {
    'import.meta.env.VITE_APP_RELEASE': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? ''),
    'import.meta.env.VITE_APP_ENV': JSON.stringify(process.env.VERCEL_ENV ?? ''),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // ------------------------------------------------------------------
        // Audit §12. Everything shipped as one 1.55 MB file, so changing a
        // single line of app code re-downloaded React, Supabase and the
        // markdown renderer along with it. They change on a different
        // schedule — roughly never — and pinning them in their own chunk
        // means a returning user fetches only what actually changed.
        //
        // This does NOT make the first visit smaller; the same bytes arrive
        // either way. It makes every visit AFTER a deploy smaller, which is
        // most visits, and it is the half of the problem that splitting
        // screens cannot touch.
        // ------------------------------------------------------------------
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (/react-markdown|remark|micromark|mdast|unist|vfile|hast|bail|trough|decode-named|character-entities|property-information|space-separated|comma-separated|zwitch|html-url|devlop|estree|unified/.test(id)) return 'vendor-markdown'
          if (id.includes('@radix-ui') || id.includes('radix-ui')) return 'vendor-radix'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('@sentry')) return 'vendor-sentry'
          return undefined
        },
      },
    },
  },
})
