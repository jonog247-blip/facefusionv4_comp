from facefusion.types import Locales

LOCALES : Locales =\
{
	'en':
	{
		'help':
		{
			'platform': 'super resolution of the images and videos on a NVIDIA RTX graphics card',
			'scale': 'upscale the frame by this factor, 1 keeps the resolution and cleans up the frame',
			'quality': 'quality level of the super resolution, denoise and deblur require a scale of 1',
			'strength': 'strength of the super resolution in the final frame',
			'blend': 'blend the upscaled into the previous frame'
		},
		'uis':
		{
			'scale_dropdown': 'RTX UPSCALER SCALE',
			'quality_dropdown': 'RTX UPSCALER QUALITY',
			'strength_slider': 'RTX UPSCALER STRENGTH',
			'blend_slider': 'RTX UPSCALER BLEND'
		}
	}
}
