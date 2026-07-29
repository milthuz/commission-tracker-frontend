import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the long-lived dependencies out of the app chunk. Before this everything was one
        // content-hashed file, so changing a single line of app code invalidated the whole
        // ~690 KB gzip download for every returning user. These groups only change on a
        // dependency bump, so they stay in the browser cache across deploys.
        //
        // `charts` is pinned so apexcharts isn't duplicated into each of the 4 lazy route chunks
        // that import it.
        //
        // pdfjs is deliberately NOT pinned here. Giving it a manualChunks group made Vite emit a
        // `<link rel="modulepreload">` for it from the entry, so all ~478 KB was fetched on first
        // load anyway — exactly what lazy-loading Proposals was meant to avoid. Left unpinned, it
        // lands inside the lazy Proposals chunk and is only fetched when that route opens.
        // (Its 1.2 MB worker was already a separate on-demand file and is untouched.)
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          i18n: ['i18next', 'react-i18next'],
          charts: ['apexcharts', 'react-apexcharts'],
        },
      },
    },
    // Raised now that the bundle is actually split — the remaining warnings would be for the
    // deliberately-large vendor/charts/pdf groups, which are cached separately.
    chunkSizeWarningLimit: 900,
  },
})
