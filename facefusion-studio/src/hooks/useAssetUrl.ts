import { useEffect, useState } from 'react';
import { useStudio } from '../store/studio';
import type { Asset } from '../api/types';

const cache = new Map<string, { url: string; token: number }>();
let token = 0;

export const invalidateAssetUrls = () => {
	cache.forEach((entry) => URL.revokeObjectURL(entry.url));
	cache.clear();
};

/**
 * `GET /assets/{id}` is bearer-protected, so media cannot be pointed at with a
 * plain `src`. The blob is fetched through the transport and cached as an
 * object URL for the lifetime of the component tree.
 */
export const useAssetUrl = (asset: Asset | null | undefined) => {
	const api = useStudio((state) => state.api);
	const [url, setUrl] = useState<string | null>(() => (asset ? (cache.get(asset.id)?.url ?? null) : null));

	useEffect(() => {
		let cancelled = false;

		if (!asset || !api) {
			setUrl(null);
			return;
		}

		const cached = cache.get(asset.id);

		if (cached) {
			setUrl(cached.url);
			return;
		}

		setUrl(null);

		void api
			.downloadAsset(asset.id)
			.then(async (blob) => {
				if (cancelled) {
					return;
				}
				const objectUrl = URL.createObjectURL(blob);
				cache.set(asset.id, { url: objectUrl, token: ++token });
				setUrl(objectUrl);
			})
			.catch(() => {
				if (!cancelled) {
					setUrl(null);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [api, asset?.id, asset?.created_at]);

	return url;
};
