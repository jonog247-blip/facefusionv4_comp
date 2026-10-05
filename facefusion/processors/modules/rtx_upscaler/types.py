from typing import List, Literal, TypedDict

from facefusion.types import Mask, VisionFrame

RtxUpscalerInputs = TypedDict('RtxUpscalerInputs',
{
	'target_vision_frames' : List[VisionFrame],
	'temp_vision_frame' : VisionFrame,
	'temp_vision_mask' : Mask
})

RtxUpscalerScale = Literal[1, 2, 3, 4]

RtxUpscalerQuality = Literal\
[
	'bicubic',
	'low',
	'medium',
	'high',
	'ultra',
	'highbitrate_low',
	'highbitrate_medium',
	'highbitrate_high',
	'highbitrate_ultra',
	'denoise_low',
	'denoise_medium',
	'denoise_high',
	'denoise_ultra',
	'deblur_low',
	'deblur_medium',
	'deblur_high',
	'deblur_ultra',
	'streaming_medium',
	'streaming_ultra'
]
