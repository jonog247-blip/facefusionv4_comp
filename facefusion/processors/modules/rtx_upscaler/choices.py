from typing import List, Sequence, get_args

from facefusion.common_helper import create_float_range
from facefusion.processors.modules.rtx_upscaler.types import RtxUpscalerQuality, RtxUpscalerScale

rtx_upscaler_scales : List[RtxUpscalerScale] = list(get_args(RtxUpscalerScale))
rtx_upscaler_quality_levels : List[RtxUpscalerQuality] = list(get_args(RtxUpscalerQuality))
rtx_upscaler_cleanup_quality_levels : List[RtxUpscalerQuality] = [ 'denoise_low', 'denoise_medium', 'denoise_high', 'denoise_ultra', 'deblur_low', 'deblur_medium', 'deblur_high', 'deblur_ultra' ]
rtx_upscaler_strength_range : Sequence[float] = create_float_range(0.0, 1.0, 0.05)
rtx_upscaler_blend_range : Sequence[int] = list(range(0, 101, 5))
