/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Mirrored in tsconfig.app.json "paths".
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Vite 8 / rolldown: manualChunks and advancedChunks are deprecated;
        // codeSplitting.groups is the supported API. Higher priority wins, and
        // with the default includeDependenciesRecursively a group also claims
        // the dependencies of the modules it matches. react must therefore
        // outrank charts: otherwise recharts' react/react-dom imports land in
        // the charts chunk, every chunk (including the entry) then statically
        // imports charts, and it is modulepreloaded on every route.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
              priority: 3,
            },
            {
              name: 'supabase',
              test: /node_modules[\\/]@supabase/,
              priority: 2,
            },
            {
              name: 'charts',
              test: /node_modules[\\/](recharts|victory-vendor|d3-|internmap)/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
  test: {
    include: [
      'src/**/*.test.{ts,tsx}',
      'shared/**/*.test.ts',
      'supabase/functions/_shared/**/*.test.ts',
    ],
    environment: 'node',
    passWithNoTests: true,
  },
})
