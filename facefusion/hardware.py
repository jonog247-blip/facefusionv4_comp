import ctypes
import os
import platform
import re
import shutil
import subprocess
from typing import Any, Dict, List, Optional, Tuple, cast

import facefusion.choices
from facefusion import config, state_manager
from facefusion.common_helper import get_first, is_linux, is_macos, is_windows
from facefusion.execution import detect_execution_devices, get_available_execution_providers
from facefusion.types import ExecutionProvider, HardwareGpu, HardwareMemory, HardwarePreset, HardwarePresetMode, HardwareProfile

PRESET_STATE_KEY_SET : Dict[str, Tuple[str, str]] =\
{
	'execution_providers': ('execution', 'execution_providers'),
	'execution_thread_count': ('execution', 'execution_thread_count'),
	'video_memory_strategy': ('memory', 'video_memory_strategy'),
	'face_detector_model': ('face_detector', 'face_detector_model'),
	'face_detector_size': ('face_detector', 'face_detector_size'),
	'face_landmarker_model': ('face_landmarker', 'face_landmarker_model'),
	'face_swapper_model': ('processors', 'face_swapper_model'),
	'face_swapper_pixel_boost': ('processors', 'face_swapper_pixel_boost'),
	'face_swapper_weight': ('processors', 'face_swapper_weight'),
	'face_enhancer_model': ('processors', 'face_enhancer_model'),
	'face_enhancer_blend': ('processors', 'face_enhancer_blend'),
	'temp_frame_format': ('frame_extraction', 'temp_frame_format'),
	'output_image_quality': ('output_creation', 'output_image_quality'),
	'output_video_quality': ('output_creation', 'output_video_quality'),
	'output_video_encoder': ('output_creation', 'output_video_encoder'),
	'output_video_preset': ('output_creation', 'output_video_preset')
}

HARDWARE_PRESET_MODE_LABELS : Dict[str, str] =\
{
	'auto': 'Automatic (recommended)',
	'quality': 'Maximum quality',
	'balanced': 'Balanced',
	'speed': 'Maximum speed',
	'low_vram': 'Low VRAM'
}
TIER_LABELS : Dict[str, str] =\
{
	'none': 'CPU only',
	'entry': 'Entry GPU',
	'mainstream': 'Mainstream GPU',
	'high': 'High end GPU',
	'ultra': 'Enthusiast GPU'
}


def resolve_preset_mode(preset_mode : Any) -> HardwarePresetMode:
	if preset_mode in facefusion.choices.hardware_preset_modes:
		return cast(HardwarePresetMode, preset_mode)
	return 'auto'


def detect_cpu_name() -> str:
	if is_windows():
		try:
			import winreg

			registry_key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, 'HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0') #type:ignore[attr-defined]
			cpu_name, _ = winreg.QueryValueEx(registry_key, 'ProcessorNameString') #type:ignore[attr-defined]
			winreg.CloseKey(registry_key) #type:ignore[attr-defined]

			if cpu_name:
				return ' '.join(str(cpu_name).split())
		except Exception:
			pass

	if is_linux() and os.path.isfile('/proc/cpuinfo'):
		try:
			with open('/proc/cpuinfo') as cpuinfo_file:
				for cpuinfo_line in cpuinfo_file:
					if cpuinfo_line.startswith('model name'):
						return cpuinfo_line.split(':', 1)[1].strip()
					if cpuinfo_line.startswith('Model') or cpuinfo_line.startswith('Hardware'):
						return cpuinfo_line.split(':', 1)[1].strip()
		except Exception:
			pass

	if is_macos() and shutil.which('sysctl'):
		try:
			cpu_name = subprocess.check_output([ shutil.which('sysctl'), '-n', 'machdep.cpu.brand_string' ], stderr = subprocess.DEVNULL).decode().strip()

			if cpu_name:
				return cpu_name
		except Exception:
			pass

	cpu_name = platform.processor() or platform.machine()
	return cpu_name if cpu_name else 'Unknown CPU'


def detect_cpu_cores() -> Dict[str, int]:
	logical_cores = os.cpu_count() or 1
	physical_cores = logical_cores

	try:
		import psutil

		physical_cores = psutil.cpu_count(logical = False) or physical_cores
	except ImportError:
		if is_linux() and os.path.isfile('/proc/cpuinfo'):
			try:
				with open('/proc/cpuinfo') as cpuinfo_file:
					cpuinfo_content = cpuinfo_file.read()
				physical_cores = len(re.findall(r'^physical id', cpuinfo_content, re.MULTILINE)) or physical_cores
			except Exception:
				pass

	return\
	{
		'physical_cores': max(1, int(physical_cores)),
		'logical_cores': max(1, int(logical_cores))
	}


def detect_memory_size() -> HardwareMemory:
	if is_windows():
		try:
			class MEMORYSTATUSEX(ctypes.Structure):
				_fields_ =\
				[
					('dwLength', ctypes.c_ulong),
					('dwMemoryLoad', ctypes.c_ulong),
					('ullTotalPhys', ctypes.c_ulonglong),
					('ullAvailPhys', ctypes.c_ulonglong),
					('ullTotalPageFile', ctypes.c_ulonglong),
					('ullAvailPageFile', ctypes.c_ulonglong),
					('ullTotalVirtual', ctypes.c_ulonglong),
					('ullAvailVirtual', ctypes.c_ulonglong),
					('ullExtendedVirtual', ctypes.c_ulonglong)
				]

			memory_status = MEMORYSTATUSEX()
			memory_status.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
			ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory_status)) #type:ignore[attr-defined]

			return\
			{
				'total_gb': round(memory_status.ullTotalPhys / 1024 ** 3, 1),
				'available_gb': round(memory_status.ullAvailPhys / 1024 ** 3, 1)
			}
		except Exception:
			pass

	if is_linux() and os.path.isfile('/proc/meminfo'):
		try:
			with open('/proc/meminfo') as meminfo_file:
				meminfo_content = meminfo_file.read()
			total_kb = int(re.search(r'MemTotal:\s+(\d+)', meminfo_content).group(1))
			available_kb = int(re.search(r'MemAvailable:\s+(\d+)', meminfo_content).group(1))

			return\
			{
				'total_gb': round(total_kb / 1024 ** 2, 1),
				'available_gb': round(available_kb / 1024 ** 2, 1)
			}
		except Exception:
			pass

	return\
	{
		'total_gb': 0.0,
		'available_gb': 0.0
	}


def run_nvidia_smi_query(fields : List[str]) -> Optional[List[List[str]]]:
	nvidia_smi_path = shutil.which('nvidia-smi')

	if not nvidia_smi_path:
		return None

	try:
		process = subprocess.run([ nvidia_smi_path, '--query-gpu=' + ','.join(fields), '--format=csv,noheader,nounits' ], stdout = subprocess.PIPE, stderr = subprocess.DEVNULL, timeout = 10)

		if process.returncode != 0:
			return None
		return [ [ value.strip() for value in line.split(',') ] for line in process.stdout.decode(errors = 'ignore').strip().splitlines() if line.strip() ]
	except Exception:
		return None


def detect_gpus() -> List[HardwareGpu]:
	gpus : List[HardwareGpu] = []

	for execution_device in detect_execution_devices():
		video_memory_total = execution_device.get('video_memory').get('total')
		video_memory_free = execution_device.get('video_memory').get('free')
		gpus.append(
		{
			'name': execution_device.get('product').get('name'),
			'vendor': execution_device.get('product').get('vendor'),
			'driver_version': execution_device.get('driver_version'),
			'cuda_version': execution_device.get('framework').get('version'),
			'vram_total_gb': round(video_memory_total.get('value') / 1024, 1) if video_memory_total else 0.0,
			'vram_free_gb': round(video_memory_free.get('value') / 1024, 1) if video_memory_free else 0.0,
			'compute_capability': ''
		})

	compute_capabilities = run_nvidia_smi_query([ 'compute_cap' ])

	if compute_capabilities and len(compute_capabilities) == len(gpus):
		for gpu_index, gpu in enumerate(gpus):
			gpu['compute_capability'] = compute_capabilities[gpu_index][0]

	return gpus


def detect_video_encoders() -> List[str]:
	try:
		from facefusion.ffmpeg import get_available_encoder_set

		return list(get_available_encoder_set().get('video'))
	except Exception:
		return []


HARDWARE_CACHE : Dict[str, Any] = {}


def detect_hardware_profile(refresh : bool = False) -> HardwareProfile:
	if not refresh and HARDWARE_CACHE:
		return HARDWARE_CACHE.get('profile')

	cpu_cores = detect_cpu_cores()
	profile : HardwareProfile =\
	{
		'platform': platform.system() + ' ' + platform.release(),
		'cpu':
		{
			'name': detect_cpu_name(),
			'physical_cores': cpu_cores.get('physical_cores'),
			'logical_cores': cpu_cores.get('logical_cores')
		},
		'memory': detect_memory_size(),
		'gpus': detect_gpus(),
		'execution_providers': get_available_execution_providers(),
		'video_encoders': detect_video_encoders()
	}
	HARDWARE_CACHE['profile'] = profile
	return profile


def resolve_hardware_tier(vram_total_gb : float, execution_providers : List[ExecutionProvider]) -> str:
	has_gpu_provider = 'cuda' in execution_providers or 'tensorrt' in execution_providers or 'rocm' in execution_providers or 'migraphx' in execution_providers or 'directml' in execution_providers or 'coreml' in execution_providers or 'openvino' in execution_providers

	if not has_gpu_provider:
		return 'none'
	if vram_total_gb <= 0.0:
		return 'mainstream'
	if vram_total_gb < 6.0:
		return 'entry'
	if vram_total_gb < 12.0:
		return 'mainstream'
	if vram_total_gb < 20.0:
		return 'high'
	return 'ultra'


def pick_video_encoder(video_encoders : List[str], tier : str, mode : HardwarePresetMode) -> Optional[str]:
	preferred_encoders : List[str] = []

	if tier != 'none':
		preferred_encoders.extend([ 'h264_nvenc', 'hevc_nvenc' ])
	preferred_encoders.extend([ 'libx264', 'h264_qsv', 'h264_amf', 'libx265' ])

	for preferred_encoder in preferred_encoders:
		if preferred_encoder in video_encoders:
			return preferred_encoder
	return get_first(video_encoders) if video_encoders else None


def pick_execution_providers(profile : HardwareProfile, mode : HardwarePresetMode) -> List[ExecutionProvider]:
	available_execution_providers = profile.get('execution_providers') or [ 'cpu' ]

	if 'tensorrt' in available_execution_providers and mode in [ 'quality', 'speed' ] and (profile.get('gpus') and profile.get('gpus')[0].get('vram_total_gb') >= 12.0):
		execution_providers : List[ExecutionProvider] = [ 'tensorrt' ]
	else:
		execution_providers = []

	for execution_provider in [ 'cuda', 'rocm', 'migraphx', 'directml', 'coreml', 'openvino', 'qnn' ]:
		if execution_provider in available_execution_providers:
			execution_providers.append(execution_provider)
			break

	if 'cpu' in available_execution_providers:
		execution_providers.append('cpu')
	if not execution_providers:
		execution_providers = [ get_first(available_execution_providers) ]
	return execution_providers


def create_hardware_preset(profile : HardwareProfile, mode : HardwarePresetMode = 'auto') -> HardwarePreset:
	gpus = profile.get('gpus') or []
	vram_total_gb = max([ gpu.get('vram_total_gb') for gpu in gpus ] or [ 0.0 ])
	physical_cores = profile.get('cpu').get('physical_cores')
	logical_cores = profile.get('cpu').get('logical_cores')
	execution_providers = pick_execution_providers(profile, mode)
	tier = resolve_hardware_tier(vram_total_gb, execution_providers)
	video_encoder = pick_video_encoder(profile.get('video_encoders'), tier, mode)
	notes : List[str] = []
	settings : Dict[str, Any] =\
	{
		'execution_device_ids': [ 0 ],
		'execution_providers': execution_providers,
		'execution_thread_count': min(16, max(4, logical_cores)) if tier != 'none' else min(32, max(1, physical_cores)),
		'video_memory_strategy': 'strict',
		'face_detector_model': 'yolo_face',
		'face_detector_size': '640x640',
		'face_detector_score': 0.5,
		'face_landmarker_model': '2dfan4',
		'face_swapper_model': 'inswapper_128_fp16',
		'face_swapper_pixel_boost': '256x256',
		'face_swapper_weight': 0.5,
		'face_enhancer_model': 'gfpgan_1.4',
		'face_enhancer_blend': 80,
		'face_enhancer_weight': 0.5,
		'temp_frame_format': 'png',
		'output_image_quality': 95,
		'output_video_quality': 85,
		'output_video_preset': 'medium',
		'target_frame_amount': 2,
		'workflow_strategy': 'memory'
	}

	if tier == 'entry':
		settings.update(
		{
			'face_detector_model': 'yunet',
			'face_swapper_pixel_boost': '256x256',
			'video_memory_strategy': 'tolerant',
			'temp_frame_format': 'jpeg'
		})
		notes.append('Low VRAM detected - the light weight detector and a small pixel boost keep memory usage safe.')
	if tier == 'mainstream':
		settings.update(
		{
			'face_swapper_model': 'hififace_unofficial_256',
			'face_swapper_pixel_boost': '512x512',
			'video_memory_strategy': 'moderate'
		})
		notes.append('Mainstream GPU detected - balanced quality and speed with a 512x512 pixel boost.')
	if tier == 'high':
		settings.update(
		{
			'face_swapper_model': 'hififace_unofficial_256',
			'face_swapper_pixel_boost': '768x768',
			'video_memory_strategy': 'strict'
		})
		notes.append('High end GPU detected - 768x768 pixel boost for crisp face swaps.')
	if tier == 'ultra':
		settings.update(
		{
			'face_swapper_model': 'hififace_unofficial_256',
			'face_swapper_pixel_boost': '1024x1024',
			'video_memory_strategy': 'strict'
		})
		notes.append('Enthusiast GPU detected - maximum quality with a 1024x1024 pixel boost.')
	if tier == 'none':
		settings.update(
		{
			'face_detector_model': 'yunet',
			'face_swapper_model': 'inswapper_128_fp16',
			'face_swapper_pixel_boost': '256x256',
			'video_memory_strategy': 'tolerant',
			'temp_frame_format': 'jpeg',
			'output_image_quality': 90
		})
		notes.append('No GPU inference provider found - settings are tuned to run on the CPU.')

	if mode == 'quality':
		max_pixel_boost = '1024x1024' if tier in [ 'high', 'ultra' ] else '768x768' if tier == 'mainstream' else '512x512' if tier == 'entry' else '256x256'
		settings.update(
		{
			'face_swapper_model': 'hififace_unofficial_256' if tier != 'none' else 'inswapper_128_fp16',
			'face_swapper_pixel_boost': max_pixel_boost,
			'face_enhancer_blend': 100,
			'temp_frame_format': 'png',
			'output_image_quality': 100,
			'output_video_quality': 95,
			'output_video_preset': 'slow',
			'target_frame_amount': 3,
			'workflow_strategy': 'memory'
		})
		notes.append('Quality preset - highest pixel boost and lossless temp frames at the cost of processing time.')
	if mode == 'speed':
		settings.update(
		{
			'face_swapper_model': 'inswapper_128_fp16',
			'face_swapper_pixel_boost': '256x256' if tier in [ 'none', 'entry' ] else '512x512',
			'face_detector_model': 'yunet',
			'face_enhancer_blend': 60,
			'temp_frame_format': 'jpeg',
			'output_image_quality': 90,
			'output_video_quality': 80,
			'output_video_preset': 'fast',
			'target_frame_amount': 1,
			'workflow_strategy': 'memory'
		})
		notes.append('Speed preset - smallest models and JPEG temp frames for the fastest turnaround.')
		notes.append('Switch the workflow strategy to disk if you run out of RAM on very long videos.')
	if mode == 'low_vram' or tier == 'entry':
		settings.update(
		{
			'face_detector_model': 'yunet',
			'face_swapper_model': 'inswapper_128_fp16',
			'face_swapper_pixel_boost': '256x256',
			'video_memory_strategy': 'tolerant',
			'temp_frame_format': 'jpeg',
			'output_image_quality': 90
		})
		if mode == 'low_vram':
			notes.append('Low VRAM preset - memory usage is reduced aggressively, drop the resolution if needed.')

	if video_encoder:
		settings['output_video_encoder'] = video_encoder
		if video_encoder in [ 'h264_nvenc', 'hevc_nvenc' ]:
			notes.append('NVIDIA video encoder available - final videos are encoded on the GPU.')
	elif 'output_video_encoder' in settings:
		del settings['output_video_encoder']

	if 'tensorrt' in execution_providers:
		notes.append('TensorRT is enabled - the first run builds engines and can take a few minutes.')

	preset : HardwarePreset =\
	{
		'mode': mode,
		'tier': tier,
		'settings': settings,
		'notes': notes
	}
	return preset


def apply_auto_preset() -> bool:
	if not state_manager.get_item('hardware_auto_preset'):
		return False

	hardware_profile = detect_hardware_profile(refresh = True)
	preset_mode = resolve_preset_mode(state_manager.get_item('hardware_preset_mode'))
	hardware_preset = create_hardware_preset(hardware_profile, preset_mode)
	# settings that are written into the config file are respected, the preset only fills in what is left open
	preset_settings =\
	{
		state_key: state_value for state_key, state_value in hardware_preset.get('settings').items() if not is_preset_state_key_customized(state_key)
	}
	apply_hardware_preset(cast(HardwarePreset, { **hardware_preset, 'settings': preset_settings }))
	return True


def is_preset_state_key_customized(state_key : str) -> bool:
	config_section, config_option = PRESET_STATE_KEY_SET.get(state_key, (None, None))

	if config_section and config_option:
		return bool(config.get_str_value(config_section, config_option))
	return False


def apply_hardware_preset(preset : HardwarePreset) -> None:
	# writes into the cli and the ui state, so that the preset is used by the interface and by the processing
	for state_key, state_value in preset.get('settings').items():
		state_manager.init_item(state_key, state_value)


def format_hardware_report(profile : HardwareProfile, preset : Optional[HardwarePreset] = None, plain : bool = False) -> str:
	lines : List[str] = []
	cpu = profile.get('cpu')
	memory = profile.get('memory')
	gpus = profile.get('gpus')
	cpu_name = cpu.get('name')
	cpu_cores = str(cpu.get('physical_cores')) + ' cores / ' + str(cpu.get('logical_cores')) + ' threads'
	if plain:
		lines.append('cpu: ' + cpu_name + ' (' + cpu_cores + ')')
	else:
		lines.append('**CPU** &nbsp; ' + cpu_name + ' &nbsp;`' + cpu_cores + '`')

	if memory.get('total_gb'):
		memory_text = str(memory.get('total_gb')) + ' GB'
		if memory.get('available_gb'):
			memory_text += ' (' + str(memory.get('available_gb')) + ' GB free)'
		if plain:
			lines.append('memory: ' + memory_text)
		else:
			lines.append('**Memory** &nbsp; ' + memory_text)

	if gpus:
		for gpu in gpus:
			gpu_text = gpu.get('name')

			if gpu.get('vram_total_gb'):
				gpu_text += ' · ' + str(gpu.get('vram_total_gb')) + ' GB VRAM'
			if gpu.get('driver_version'):
				gpu_text += ' · driver ' + str(gpu.get('driver_version'))
			if gpu.get('cuda_version'):
				gpu_text += ' · CUDA ' + str(gpu.get('cuda_version'))
			if gpu.get('compute_capability'):
				gpu_text += ' · compute ' + str(gpu.get('compute_capability'))
			if plain:
				lines.append('gpu: ' + gpu_text)
			else:
				lines.append('**GPU** &nbsp; ' + gpu_text)
	else:
		lines.append('gpu: none detected - running on the CPU' if plain else '**GPU** &nbsp; none detected - running on the CPU')

	execution_providers = profile.get('execution_providers') or []
	lines.append(('inference: ' if plain else '**Inference** &nbsp; ') + (', '.join(execution_providers) if execution_providers else 'cpu'))

	video_encoders = [ video_encoder for video_encoder in profile.get('video_encoders') or [] if 'nvenc' in video_encoder ]
	lines.append(('video encoder: ' if plain else '**Video encoder** &nbsp; ') + (', '.join(video_encoders) if video_encoders else 'software (libx264)'))

	if preset:
		settings = preset.get('settings')
		tier_label = TIER_LABELS.get(preset.get('tier'), preset.get('tier'))
		lines.append('')
		lines.append(('recommended profile: ' + tier_label + ' / ' + HARDWARE_PRESET_MODE_LABELS.get(preset.get('mode'), preset.get('mode'))) if plain else ('**Recommended profile** &nbsp; ' + tier_label + ' · ' + HARDWARE_PRESET_MODE_LABELS.get(preset.get('mode'), preset.get('mode'))))
		lines.append('')
		if plain:
			lines.append('face detector: ' + str(settings.get('face_detector_model')) + ' at ' + str(settings.get('face_detector_size')))
			lines.append('face swapper: ' + str(settings.get('face_swapper_model')) + ' at ' + str(settings.get('face_swapper_pixel_boost')))
			lines.append('executor: ' + ', '.join(settings.get('execution_providers')) + ' with ' + str(settings.get('execution_thread_count')) + ' threads')
			lines.append('memory strategy: ' + str(settings.get('video_memory_strategy')) + ' / encoder: ' + str(settings.get('output_video_encoder')))
		else:
			lines.append('- Face detector `' + str(settings.get('face_detector_model')) + '` at `' + str(settings.get('face_detector_size')) + '`')
			lines.append('- Face swapper `' + str(settings.get('face_swapper_model')) + '` at `' + str(settings.get('face_swapper_pixel_boost')) + '`')
			lines.append('- Executor `' + ', '.join(settings.get('execution_providers')) + '` with ' + str(settings.get('execution_thread_count')) + ' threads')
			lines.append('- Memory strategy `' + str(settings.get('video_memory_strategy')) + '` · encoder `' + str(settings.get('output_video_encoder')) + '`')

		if preset.get('notes'):
			lines.append('')
			lines.append(' > '.join([ ('* ' if plain else '· ') + note for note in preset.get('notes') ]))

	return '\n'.join(lines)
