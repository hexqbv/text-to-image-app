import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Avoid browser CORS to Hugging Face while developing
      '/huggingface-inference': {
        target: 'https://router.huggingface.co',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/huggingface-inference/, ''),
      },
    },
  },
})
