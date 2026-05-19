import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Capacitor packages only exist in the Android build — tell Rollup
      // to leave these dynamic imports alone for the web/Vercel build.
      external: (id) => id.startsWith('@capacitor/app') || id.startsWith('@capacitor/browser'),
    },
  },
})
