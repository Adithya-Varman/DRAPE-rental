import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './dev/api-plugin'

export default defineConfig({
  plugins: [react(), apiPlugin()],
})
