import os
import sys
from typing import List

from facefusion.common_helper import is_linux, is_windows


def collect_nvidia_library_paths() -> List[str]:
	library_paths : List[str] = []

	for site_packages_path in filter(os.path.isdir, sys.path):
		nvidia_path = os.path.join(site_packages_path, 'nvidia')

		if os.path.isdir(nvidia_path):
			for nvidia_package in sorted(os.listdir(nvidia_path)):
				for library_directory in [ 'lib', 'bin' ]:
					library_path = os.path.join(nvidia_path, nvidia_package, library_directory)

					if os.path.isdir(library_path):
						library_paths.append(library_path)
	return library_paths


def setup() -> None:
	conda_prefix = os.getenv('CONDA_PREFIX')
	conda_ready = os.getenv('CONDA_READY')

	if conda_prefix and not conda_ready:
		if is_linux():
			python_id = 'python' + str(sys.version_info.major) + '.' + str(sys.version_info.minor)
			library_paths : List[str] =\
			[
				os.path.join(conda_prefix, 'lib'),
				os.path.join(conda_prefix, 'lib', python_id, 'site-packages', 'tensorrt_libs')
			]
			library_paths = list(filter(os.path.exists, library_paths))
			library_paths.extend(collect_nvidia_library_paths())

			if library_paths:
				if os.getenv('LD_LIBRARY_PATH'):
					library_paths.append(os.getenv('LD_LIBRARY_PATH'))
				os.environ['LD_LIBRARY_PATH'] = os.pathsep.join(library_paths)
				os.environ['CONDA_READY'] = '1'
				os.execv(sys.executable, [ sys.executable ] + sys.argv)

		if is_windows():
			library_paths =\
			[
				os.path.join(conda_prefix, 'Lib'),
				os.path.join(conda_prefix, 'Lib', 'site-packages', 'tensorrt_libs')
			]
			library_paths = list(filter(os.path.exists, library_paths))
			library_paths.extend(collect_nvidia_library_paths())

			if library_paths:
				# the nvidia pip wheels ship their libraries in site-packages, make them discoverable for onnxruntime
				if hasattr(os, 'add_dll_directory'):
					for library_path in library_paths:
						try:
							os.add_dll_directory(library_path)
						except OSError:
							pass

				if os.getenv('PATH'):
					library_paths.append(os.getenv('PATH'))
				os.environ['PATH'] = os.pathsep.join(library_paths)
				os.environ['CONDA_READY'] = '1'
