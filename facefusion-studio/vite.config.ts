import { cpSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

/**
 * Copies the MediaPipe Tasks Vision wasm runtime out of node_modules and into
 * `public/` so the landmarker never depends on a CDN for its WebAssembly.
 * The `.task` model itself is large (~3.7 MB) and is intentionally *not*
 * vendored: drop one at `public/models/face_landmarker.task` to run fully
 * offline, otherwise the CDN copy is used.
 */
function copyMediapipeRuntime() {
	const source = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')

	if (existsSync(source)) {
		cpSync(source, resolve(root, 'public/mediapipe'), { recursive: true })
	}
}

function mediapipeAssets() {
	return {
		name: 'facefusion-studio:mediapipe-assets',
		buildStart: copyMediapipeRuntime,
		configureServer: copyMediapipeRuntime
	}
}

export default defineConfig({
	plugins: [react(), tailwindcss(), mediapipeAssets()],
	server: {
		host: '0.0.0.0',
		port: 5173,
		strictPort: true,
		// The studio is often opened through a proxy or a LAN address, so the
		// Host header cannot be restricted to localhost.
		allowedHosts: true
	},
	preview: {
		host: '0.0.0.0',
		port: 4173,
		strictPort: true,
		allowedHosts: true
	},
	build: {
		target: 'es2022',
		chunkSizeWarningLimit: 1400
	}
})
