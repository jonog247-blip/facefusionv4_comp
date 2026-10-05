/**
 * Frame compositor used by the demo backend.
 *
 * It is *not* a face-swap implementation: it blends the source portrait into
 * the target frame with a soft elliptical mask so the studio can be
 * exercised end to end without a GPU. Every surface that shows this output
 * labels it as a simulation.
 */

export interface CompositeOptions {
	opacity: number;
	scale: number;
	offsetX: number;
	offsetY: number;
}

export const defaultComposite: CompositeOptions = {
	opacity: 0.82,
	scale: 0.46,
	offsetX: 0,
	offsetY: -0.04
};

const cache = new Map<string, ImageBitmap>();

export async function loadBitmap(url: string): Promise<ImageBitmap | null> {
	const cached = cache.get(url);

	if (cached) {
		return cached;
	}

	try {
		const response = await fetch(url);

		if (!response.ok) {
			return null;
		}

		const bitmap = await createImageBitmap(await response.blob());
		cache.set(url, bitmap);
		return bitmap;
	} catch {
		return null;
	}
}

export function dropBitmap(url: string) {
	const bitmap = cache.get(url);

	bitmap?.close?.();
	cache.delete(url);
}

export async function compositeFrame(
	canvas: HTMLCanvasElement,
	target: ImageBitmap,
	source: ImageBitmap | null,
	options: CompositeOptions = defaultComposite
) {
	const width = target.width;
	const height = target.height;

	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}

	const context = canvas.getContext('2d');

	if (!context) {
		return canvas;
	}

	context.globalAlpha = 1;
	context.fillStyle = '#000';
	context.fillRect(0, 0, width, height);
	context.drawImage(target, 0, 0, width, height);

	if (source) {
		const targetSize = Math.min(width, height);
		const drawWidth = targetSize * options.scale * (source.width / Math.max(source.height, 1));
		const drawHeight = targetSize * options.scale;
		const centerX = width / 2 + options.offsetX * width;
		const centerY = height * (0.42 + options.offsetY);
		const x = centerX - drawWidth / 2;
		const y = centerY - drawHeight / 2;

		context.save();
		context.globalAlpha = options.opacity;
		context.globalCompositeOperation = 'lighter';

		context.beginPath();
		context.ellipse(centerX, centerY, drawWidth * 0.56, drawHeight * 0.68, 0, 0, Math.PI * 2);
		context.clip();

		context.drawImage(source, x, y, drawWidth, drawHeight);
		context.restore();
	}

	// A faint scan line sells the "live signal" read-out without hiding content.
	context.globalAlpha = 0.04;
	context.fillStyle = '#0a84ff';

	for (let y = 0; y < height; y += 4) {
		context.fillRect(0, y, width, 1);
	}

	context.globalAlpha = 1;
	return canvas;
}

export async function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85) {
	return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}
