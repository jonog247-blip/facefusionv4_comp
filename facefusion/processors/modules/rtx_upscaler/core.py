from argparse import ArgumentParser
from functools import lru_cache
from importlib.util import find_spec
from threading import Lock
from types import ModuleType
from typing import Any, List, Optional, Tuple

import cv2
import numpy

import facefusion.jobs.job_store
from facefusion import config, logger, state_manager, translator
from facefusion.common_helper import get_first
from facefusion.filesystem import in_directory, is_image, is_video, same_file_extension
from facefusion.processors.modules.rtx_upscaler import choices as rtx_upscaler_choices
from facefusion.processors.modules.rtx_upscaler.types import RtxUpscalerInputs
from facefusion.processors.types import ProcessorOutputs
from facefusion.program_helper import find_argument_group
from facefusion.types import ApplyStateItem, Args, InferencePool, ProcessMode, VisionFrame
from facefusion.vision import blend_frame

RTX_UPSCALER : Optional[Any] = None
RTX_UPSCALER_CONTEXT : Optional[Tuple[int, int, int, str, float, int]] = None
RTX_UPSCALER_LOCK : Lock = Lock()
RTX_UPSCALER_FAILED : bool = False
RTX_MAX_RESOLUTION : int = 8192


def get_inference_pool() -> InferencePool:
	return {}


def clear_inference_pool() -> None:
	release_rtx_upscaler()


def register_args(program : ArgumentParser) -> None:
	group_processors = find_argument_group(program, 'processors')
	if group_processors:
		group_processors.add_argument('--rtx-upscaler-scale', help = translator.get('help.scale', __package__), type = int, default = config.get_int_value('processors', 'rtx_upscaler_scale', '2'), choices = rtx_upscaler_choices.rtx_upscaler_scales)
		group_processors.add_argument('--rtx-upscaler-quality', help = translator.get('help.quality', __package__), default = config.get_str_value('processors', 'rtx_upscaler_quality', 'high'), choices = rtx_upscaler_choices.rtx_upscaler_quality_levels)
		group_processors.add_argument('--rtx-upscaler-strength', help = translator.get('help.strength', __package__), type = float, default = config.get_float_value('processors', 'rtx_upscaler_strength', '1.0'), choices = rtx_upscaler_choices.rtx_upscaler_strength_range)
		group_processors.add_argument('--rtx-upscaler-blend', help = translator.get('help.blend', __package__), type = int, default = config.get_int_value('processors', 'rtx_upscaler_blend', '100'), choices = rtx_upscaler_choices.rtx_upscaler_blend_range)
		facefusion.jobs.job_store.register_step_keys([ 'rtx_upscaler_scale', 'rtx_upscaler_quality', 'rtx_upscaler_strength', 'rtx_upscaler_blend' ])


def apply_args(args : Args, apply_state_item : ApplyStateItem) -> None:
	apply_state_item('rtx_upscaler_scale', args.get('rtx_upscaler_scale'))
	apply_state_item('rtx_upscaler_quality', args.get('rtx_upscaler_quality'))
	apply_state_item('rtx_upscaler_strength', args.get('rtx_upscaler_strength'))
	apply_state_item('rtx_upscaler_blend', args.get('rtx_upscaler_blend'))


def get_common_modules() -> List[ModuleType]:
	return []


def pre_check() -> bool:
	global RTX_UPSCALER_FAILED

	RTX_UPSCALER_FAILED = False

	if not is_rtx_upscaler_available():
		logger.error(get_unavailable_message(), __name__)
		return False
	return True


def pre_process(mode : ProcessMode) -> bool:
	global RTX_UPSCALER_FAILED

	if mode in [ 'output', 'preview' ] and not is_image(state_manager.get_item('target_path')) and not is_video(state_manager.get_item('target_path')):
		logger.error(translator.get('choose_image_or_video_target') + translator.get('exclamation_mark'), __name__)
		return False

	if mode == 'output' and not in_directory(state_manager.get_item('output_path')):
		logger.error(translator.get('specify_image_or_video_output') + translator.get('exclamation_mark'), __name__)
		return False

	if mode == 'output' and not same_file_extension(state_manager.get_item('target_path'), state_manager.get_item('output_path')):
		logger.error(translator.get('match_target_and_output_extension') + translator.get('exclamation_mark'), __name__)
		return False

	if mode == 'output':
		RTX_UPSCALER_FAILED = False
		stretch_output_scale()
	return True


def post_process() -> None:
	release_rtx_upscaler()


def stretch_output_scale() -> None:
	scale = resolve_scale()

	if scale < 2:
		return

	output_image_scale = state_manager.get_item('output_image_scale') or 1
	output_video_scale = state_manager.get_item('output_video_scale') or 1

	if output_image_scale < scale:
		logger.info(translator.get('rtx_upscaler_output_image_scale').format(scale = str(scale)), __name__)
		state_manager.set_item('output_image_scale', scale)

	if output_video_scale < scale:
		logger.info(translator.get('rtx_upscaler_output_video_scale').format(scale = str(scale)), __name__)
		state_manager.set_item('output_video_scale', scale)


def upscale_frame(temp_vision_frame : VisionFrame) -> VisionFrame:
	global RTX_UPSCALER_FAILED

	if RTX_UPSCALER_FAILED:
		return temp_vision_frame

	scale = resolve_scale()
	quality = resolve_quality(scale)
	strength = resolve_strength()
	blend = resolve_blend()
	device_id = resolve_device_id()
	height, width = temp_vision_frame.shape[:2]
	output_width = width * scale
	output_height = height * scale

	if output_width > RTX_MAX_RESOLUTION or output_height > RTX_MAX_RESOLUTION:
		logger.error(translator.get('rtx_upscaler_resolution_exceeded').format(resolution = str(output_width) + 'x' + str(output_height)), __name__)
		return temp_vision_frame

	padded_vision_frame = pad_vision_frame(temp_vision_frame)

	try:
		with RTX_UPSCALER_LOCK:
			tensor_backend = get_tensor_backend()

			if tensor_backend is None:
				RTX_UPSCALER_FAILED = True
				logger.error(get_unavailable_message(), __name__)
				return temp_vision_frame

			rtx_upscaler = get_rtx_upscaler(padded_vision_frame.shape[1], padded_vision_frame.shape[0], scale, quality, strength, device_id)
			input_tensor = create_input_tensor(padded_vision_frame, tensor_backend, device_id)
			rtx_upscaler_output = rtx_upscaler.run(input_tensor)
			output_tensor = copy_output_tensor(rtx_upscaler_output.image, tensor_backend)
			rtx_vision_frame = create_vision_frame(output_tensor, tensor_backend)
	except Exception as exception:
		logger.error(translator.get('rtx_upscaler_failed'), __name__)
		logger.debug(str(exception), __name__)
		RTX_UPSCALER_FAILED = True
		return temp_vision_frame

	rtx_vision_frame = numpy.ascontiguousarray(rtx_vision_frame[:output_height, :output_width])
	return blend_rtx_frame(temp_vision_frame, rtx_vision_frame, blend)


def blend_rtx_frame(temp_vision_frame : VisionFrame, rtx_vision_frame : VisionFrame, blend : int) -> VisionFrame:
	if blend >= 100:
		return rtx_vision_frame

	base_vision_frame = cv2.resize(temp_vision_frame, rtx_vision_frame.shape[:2][::-1])
	return blend_frame(base_vision_frame, rtx_vision_frame, blend / 100)


def pad_vision_frame(temp_vision_frame : VisionFrame) -> VisionFrame:
	height, width = temp_vision_frame.shape[:2]
	pad_width = (8 - width % 8) % 8
	pad_height = (8 - height % 8) % 8

	if pad_width or pad_height:
		return cv2.copyMakeBorder(temp_vision_frame, 0, pad_height, 0, pad_width, cv2.BORDER_REPLICATE)
	return temp_vision_frame


def resolve_scale() -> int:
	scale = state_manager.get_item('rtx_upscaler_scale')

	if isinstance(scale, int) and scale in rtx_upscaler_choices.rtx_upscaler_scales:
		return scale
	return 2


def resolve_quality(scale : int) -> str:
	quality = state_manager.get_item('rtx_upscaler_quality')

	if not isinstance(quality, str) or quality not in rtx_upscaler_choices.rtx_upscaler_quality_levels:
		quality = 'high'

	if scale <= 1 and quality not in rtx_upscaler_choices.rtx_upscaler_cleanup_quality_levels:
		return 'denoise_high'
	if scale >= 2 and quality in rtx_upscaler_choices.rtx_upscaler_cleanup_quality_levels:
		return 'high'
	return quality


def resolve_strength() -> float:
	strength = state_manager.get_item('rtx_upscaler_strength')

	if isinstance(strength, float) or isinstance(strength, int):
		return min(max(float(strength), 0.0), 1.0)
	return 1.0


def resolve_blend() -> int:
	blend = state_manager.get_item('rtx_upscaler_blend')

	if isinstance(blend, int):
		return min(max(blend, 0), 100)
	return 100


def resolve_device_id() -> int:
	execution_device_ids = state_manager.get_item('execution_device_ids')
	execution_device_id = get_first(execution_device_ids or [ 0 ])

	if isinstance(execution_device_id, int):
		return max(execution_device_id, 0)
	return 0


@lru_cache()
def get_tensor_backend() -> Optional[str]:
	try:
		import cupy

		if cupy.cuda.runtime.getDeviceCount() > 0:
			return 'cupy'
	except Exception:
		pass

	try:
		import torch

		if torch.cuda.is_available():
			return 'torch'
	except Exception:
		pass

	return None


@lru_cache()
def is_nvvfx_installed() -> bool:
	try:
		return find_spec('nvvfx') is not None
	except Exception:
		return False


@lru_cache()
def is_rtx_upscaler_available() -> bool:
	return is_nvvfx_installed() and get_tensor_backend() is not None


def get_unavailable_message() -> str:
	if not is_nvvfx_installed():
		return translator.get('rtx_upscaler_not_installed')

	if get_tensor_backend() is None:
		return translator.get('rtx_upscaler_no_gpu')
	return translator.get('rtx_upscaler_not_supported')


def get_rtx_upscaler(input_width : int, input_height : int, scale : int, quality : str, strength : float, device_id : int) -> Any:
	global RTX_UPSCALER
	global RTX_UPSCALER_CONTEXT

	context = (input_width, input_height, scale, quality, strength, device_id)

	if RTX_UPSCALER is not None and RTX_UPSCALER_CONTEXT == context:
		return RTX_UPSCALER

	release_rtx_upscaler()

	from nvvfx import VideoSuperRes #type:ignore[import-not-found]

	quality_level = getattr(VideoSuperRes.QualityLevel, quality.upper(), None)
	rtx_upscaler = VideoSuperRes(device = device_id, quality = quality_level, strength = strength)

	for attribute_name, attribute_value in [ ('input_width', input_width), ('input_height', input_height), ('output_width', input_width * scale), ('output_height', input_height * scale) ]:
		try:
			setattr(rtx_upscaler, attribute_name, attribute_value)
		except Exception:
			pass

	rtx_upscaler.load()
	RTX_UPSCALER = rtx_upscaler
	RTX_UPSCALER_CONTEXT = context
	logger.debug(translator.get('rtx_upscaler_loaded').format(resolution = str(input_width) + 'x' + str(input_height), scale = str(scale)), __name__)
	return RTX_UPSCALER


def release_rtx_upscaler() -> None:
	global RTX_UPSCALER
	global RTX_UPSCALER_CONTEXT

	if RTX_UPSCALER is not None:
		try:
			RTX_UPSCALER.close()
		except Exception:
			pass
	RTX_UPSCALER = None
	RTX_UPSCALER_CONTEXT = None


def create_input_tensor(padded_vision_frame : VisionFrame, tensor_backend : str, device_id : int) -> Any:
	channel_first_frame = numpy.ascontiguousarray(padded_vision_frame[:, :, ::-1].transpose(2, 0, 1), dtype = numpy.float32) / 255.0

	if tensor_backend == 'cupy':
		import cupy

		with cupy.cuda.Device(device_id):
			return cupy.asarray(channel_first_frame)

	import torch

	return torch.as_tensor(channel_first_frame, device = 'cuda:' + str(device_id))


def copy_output_tensor(output_image : Any, tensor_backend : str) -> Any:
	if tensor_backend == 'cupy':
		import cupy

		return cupy.from_dlpack(output_image).copy()

	import torch

	return torch.from_dlpack(output_image).clone()


def create_vision_frame(output_tensor : Any, tensor_backend : str) -> VisionFrame:
	if tensor_backend == 'cupy':
		import cupy

		channel_last_frame = cupy.asnumpy(output_tensor)
	else:
		channel_last_frame = output_tensor.detach().cpu().numpy()

	channel_last_frame = channel_last_frame.transpose(1, 2, 0)
	channel_last_frame = (channel_last_frame.clip(0.0, 1.0) * 255.0).round().astype(numpy.uint8)
	return numpy.ascontiguousarray(channel_last_frame[:, :, ::-1])


def process_frame(inputs : RtxUpscalerInputs) -> ProcessorOutputs:
	temp_vision_frame = inputs.get('temp_vision_frame')
	temp_vision_mask = inputs.get('temp_vision_mask')
	rtx_vision_frame = upscale_frame(temp_vision_frame)
	temp_vision_mask = cv2.resize(temp_vision_mask, rtx_vision_frame.shape[:2][::-1])
	return rtx_vision_frame, temp_vision_mask
