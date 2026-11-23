import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this repository under /COFDEE-MARKET-ETHIOPIA-/.
export default defineConfig({
  plugins: [react()],
  base: '/COFDEE-MARKET-ETHIOPIA-/',
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
})
