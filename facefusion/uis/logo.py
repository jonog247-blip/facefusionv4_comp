import base64
from functools import lru_cache
from io import BytesIO
from typing import Optional, Tuple

from facefusion.filesystem import is_file, resolve_relative_path

LOGO_FILE_NAME_SET =\
{
	'facefusion.png': 'image/png',
	'facefusion.svg': 'image/svg+xml',
	'facefusion.ico': 'image/x-icon'
}


@lru_cache()
def get_logo_data_url(dimension : int = 128) -> Optional[str]:
	for logo_file_name in LOGO_FILE_NAME_SET.keys():
		logo_path = resolve_relative_path('../' + logo_file_name)

		if is_file(logo_path):
			logo_data_url = create_logo_data_url(logo_path, LOGO_FILE_NAME_SET.get(logo_file_name), dimension)

			if logo_data_url:
				return logo_data_url
	return None


def create_logo_data_url(logo_path : str, mime_type : str, dimension : int) -> Optional[str]:
	logo_data, logo_mime_type = create_logo_data(logo_path, mime_type, dimension)

	if logo_data:
		return 'data:' + logo_mime_type + ';base64,' + base64.b64encode(logo_data).decode('ascii')
	return None


def create_logo_data(logo_path : str, mime_type : str, dimension : int) -> Tuple[Optional[bytes], str]:
	if logo_path.endswith('.svg'):
		with open(logo_path, 'rb') as logo_file:
			return logo_file.read(), mime_type

	try:
		from PIL import Image

		with Image.open(logo_path) as logo_image:
			logo_image = logo_image.convert('RGBA')

			if dimension and logo_image.width > dimension:
				logo_image = logo_image.resize((dimension, dimension), Image.Resampling.LANCZOS)

			logo_buffer = BytesIO()
			logo_image.save(logo_buffer, 'PNG', optimize = True)
			return logo_buffer.getvalue(), 'image/png'
	except ImportError:
		with open(logo_path, 'rb') as logo_file:
			return logo_file.read(), mime_type
	except Exception:
		return None, mime_type


def get_logo_markup() -> str:
	logo_data_url = get_logo_data_url()

	if logo_data_url:
		return '<img class="ff-logo" src="' + logo_data_url + '" alt="' + 'logo' + '">'
	return '<span class="ff-logo ff-logo-fallback">🎭</span>'
