import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    // GitHub Pages base path (update with your repo name)
    base: '/storybot/',
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
    server: {
        port: 3000,
        host: true,
    },
    // CSS Modules configuration
    css: {
        modules: {
            localsConvention: 'camelCase',
        },
    },
});
