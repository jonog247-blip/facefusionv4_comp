/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_FF_API_BASE?: string;
	readonly VITE_FF_API_KEY?: string;
	readonly VITE_FF_TRANSPORT?: string;
	readonly VITE_FF_LANDMARKER_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
