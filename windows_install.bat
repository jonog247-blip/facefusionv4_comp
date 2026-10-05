@echo off
setlocal EnableExtensions EnableDelayedExpansion
title FaceFusion Studio - installer

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "ENV_NAME=facefusion"
set "MINI_PATH=%USERPROFILE%\miniconda3"
set "CONDA_ROOT="
set "HAS_NVIDIA=0"

echo.
echo  ================================================================
echo    FaceFusion Studio - automatic installation
echo ----------------------------------------------------------------
echo    installs a private conda environment with python, ffmpeg,
echo    the CUDA runtime and every python package FaceFusion needs
echo  ================================================================
echo.

if not exist "%ROOT%\facefusion.py" (
	echo  [ERROR] facefusion.py was not found next to this script.
	echo          keep windows_install.bat inside the FaceFusion folder.
	echo.
	pause
	exit /b 1
)

cd /d "%ROOT%"

echo  [..]   looking for conda ...

if defined CONDA_PREFIX if exist "%CONDA_PREFIX%\Scripts\activate.bat" set "CONDA_ROOT=%CONDA_PREFIX%"

for %%D in (
	"%USERPROFILE%\miniconda3"
	"%USERPROFILE%\Miniconda3"
	"%USERPROFILE%\anaconda3"
	"%USERPROFILE%\Anaconda3"
	"%LOCALAPPDATA%\miniconda3"
	"%LOCALAPPDATA%\Continuum\anaconda3"
	"%ProgramData%\miniconda3"
	"%ProgramData%\Anaconda3"
	"C:\miniconda3"
	"C:\anaconda3"
) do (
	if not defined CONDA_ROOT if exist "%%~fD\Scripts\activate.bat" set "CONDA_ROOT=%%~fD"
)

if not defined CONDA_ROOT (
	for /f "delims=" %%I in ('where conda 2^>nul') do (
		if not defined CONDA_ROOT (
			for %%J in ("%%~dpI..") do if exist "%%~fJ\Scripts\activate.bat" set "CONDA_ROOT=%%~fJ"
		)
	)
)

if defined CONDA_ROOT goto :have_conda

echo  [..]   conda was not found, installing Miniconda3 ...
echo.

echo %USERPROFILE% | find " " >nul && set "MINI_PATH=C:\miniconda3"

if exist "%MINI_PATH%\Scripts\activate.bat" (
	set "CONDA_ROOT=%MINI_PATH%"
	goto :have_conda
)

set "MINI_INSTALLER=%TEMP%\facefusion_miniconda.exe"
echo  [..]   downloading the Miniconda3 installer ...
curl -L --fail --retry 3 --max-time 900 -o "%MINI_INSTALLER%" https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe
if errorlevel 1 goto :no_miniconda_download

echo  [..]   installing Miniconda3 into %MINI_PATH% - this takes a few minutes ...
start /wait "" "%MINI_INSTALLER%" /InstallationType=JustMe /RegisterPython=0 /AddToPath=0 /S /D=%MINI_PATH%

if not exist "%MINI_PATH%\Scripts\activate.bat" goto :no_miniconda_install
set "CONDA_ROOT=%MINI_PATH%"
goto :have_conda

:no_miniconda_download
echo  [ERROR] Miniconda3 could not be downloaded.
echo          check the internet connection and run this script again.
echo.
pause
exit /b 1

:no_miniconda_install
echo  [ERROR] the silent Miniconda3 installation failed.
echo          install Miniconda3 manually, then run this script again.
echo.
pause
exit /b 1

:have_conda
echo  [ok]   conda found at %CONDA_ROOT%

call "%CONDA_ROOT%\Scripts\activate.bat" "%CONDA_ROOT%"

echo  [..]   preparing the "%ENV_NAME%" environment ...

conda env list | findstr /r /c:"^%ENV_NAME% " >nul
if errorlevel 1 (
	echo  [..]   creating the conda environment "%ENV_NAME%" with python 3.12 ...
	call conda create -y -n "%ENV_NAME%" python=3.12 pip
) else (
	echo  [ok]   the conda environment "%ENV_NAME%" already exists
)

call conda activate "%ENV_NAME%"
if errorlevel 1 goto :no_env

python -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>nul
if errorlevel 1 (
	echo  [ERROR] the environment "%ENV_NAME%" must use python 3.12 or newer.
	echo          delete it with:  conda env remove -n %ENV_NAME%
	echo          then run this script again.
	echo.
	pause
	exit /b 1
)

python -m pip install --upgrade pip
if errorlevel 1 goto :no_pip

echo.
where ffmpeg >nul 2>nul
if errorlevel 1 goto :no_ffmpeg
where ffprobe >nul 2>nul
if errorlevel 1 goto :no_ffmpeg

echo  [ok]   ffmpeg is available
goto :self_test

:no_ffmpeg
echo  [..]   installing ffmpeg ...
call conda install -y -q -c conda-forge ffmpeg
call conda activate "%ENV_NAME%"
where ffmpeg >nul 2>nul
if errorlevel 1 goto :no_ffprobe
where ffprobe >nul 2>nul
if errorlevel 1 goto :no_ffprobe
echo  [ok]   ffmpeg is available
goto :self_test

:no_ffprobe
echo  [ERROR] ffmpeg could not be installed automatically.
echo          install it manually, then run this script again:
echo            winget install -e --id Gyan.FFmpeg --version 7.0.2
echo.
pause
exit /b 1

:self_test
echo.
where nvidia-smi >nul 2>nul
if errorlevel 1 goto :no_gpu

set "HAS_NVIDIA=1"
echo  [ok]   NVIDIA GPU detected
echo  [..]   installing the CUDA 12.9.1 runtime and cuDNN 9.10.0 - this downloads around 2 GB ...
call conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main >nul 2>nul
call conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r >nul 2>nul
call conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/msys2 >nul 2>nul
call conda install -y -q nvidia/label/cuda-12.9.1::cuda-runtime nvidia/label/cudnn-9.10.0::cudnn
if errorlevel 1 (
	echo  [warn] the CUDA runtime could not be installed from the nvidia channel.
	echo         the python wheels below are used as a fallback instead.
	call python -m pip install nvidia-cuda-runtime-cu12==12.8.90 nvidia-cublas-cu12==12.8.4.1 nvidia-cudnn-cu12==9.8.0.87
)

call conda activate "%ENV_NAME%"
echo  [..]   installing the python packages ...
python install.py cuda@12 --skip-conda
if errorlevel 1 goto :deps_error
goto :self_test_verify

:no_gpu
echo  [warn] nvidia-smi was not found - no NVIDIA driver detected.
echo         the CPU runtime is installed, the app still runs.
echo  [..]   installing the python packages ...
python install.py default --skip-conda
if errorlevel 1 goto :deps_error

:self_test_verify
echo.
echo  [..]   self test ...
python -c "import onnxruntime, cv2, gradio, numpy, scipy; print('       onnxruntime', onnxruntime.__version__); print('       providers', ', '.join(onnxruntime.get_available_providers()))"
if errorlevel 1 goto :deps_error

python -c "import onnxruntime, sys; sys.exit(0 if 'CUDAExecutionProvider' in onnxruntime.get_available_providers() else 1)" >nul 2>nul
if errorlevel 1 goto :no_cuda
echo  [ok]   CUDA inference is ready
goto :rtx_setup

:no_cuda
if "%HAS_NVIDIA%"=="1" (
	echo  [warn] CUDAExecutionProvider is not available.
	echo         update to the latest NVIDIA driver and run this script again.
)

:rtx_setup
if "%HAS_NVIDIA%"=="0" goto :write_env

set "DRV_MAJOR="
for /f "tokens=1 delims=." %%A in ('nvidia-smi --query-gpu=driver_version --format^=csv^,noheader 2^>nul') do set "DRV_MAJOR=%%A"
if defined DRV_MAJOR if %DRV_MAJOR% LSS 570 (
	echo  [warn] the NVIDIA driver is older than 570.65 - the RTX super resolution needs a newer driver.
)

echo.
echo  ----------------------------------------------------------------
echo    RTX super resolution (optional)
echo    upscales images and videos with the AI models of the RTX
echo    graphics card, needs an NVIDIA RTX card with Tensor Cores
echo ----------------------------------------------------------------
set "INSTALL_RTX="
set /p "INSTALL_RTX=Install the RTX super resolution support now [Y/n]: "
if /i "%INSTALL_RTX%"=="n" goto :rtx_skipped
if /i "%INSTALL_RTX%"=="no" goto :rtx_skipped

echo  [..]   installing the nvidia-vfx bindings ...
python -m pip install wheel-stub
python -m pip install nvidia-vfx --index-url https://pypi.nvidia.com --no-build-isolation
if errorlevel 1 (
	echo  [warn] retrying with the standard package index ...
	python -m pip install nvidia-vfx --extra-index-url https://pypi.nvidia.com --no-build-isolation --prefer-binary
)
if errorlevel 1 goto :rtx_failed

python -c "import torch" >nul 2>nul
if errorlevel 1 (
	echo  [..]   installing cupy for the GPU memory exchange ...
	python -m pip install cupy-cuda12x
	if errorlevel 1 goto :rtx_failed
)

python -c "import nvvfx" >nul 2>nul
if errorlevel 1 goto :rtx_warn
echo  [ok]   RTX super resolution is ready
goto :write_env

:rtx_warn
echo  [warn] nvidia-vfx was installed but cannot load on this system.
echo         the RTX upscaler stays unavailable, everything else works.
goto :write_env

:rtx_failed
echo  [warn] the RTX super resolution support could not be installed.
echo         everything else works, the upscaler is not offered in the app.
echo         install it later with:
echo           python -m pip install wheel-stub
echo           python -m pip install nvidia-vfx --index-url https://pypi.nvidia.com --no-build-isolation
echo           python -m pip install cupy-cuda12x
goto :write_env

:rtx_skipped
echo  [warn] the RTX super resolution support is not installed.
echo         it can be added later with:
echo           python -m pip install wheel-stub
echo           python -m pip install nvidia-vfx --index-url https://pypi.nvidia.com --no-build-isolation
echo           python -m pip install cupy-cuda12x

:write_env
echo.
> "%ROOT%\.ff_env.bat" echo set "FF_CONDA_ROOT=%CONDA_ROOT%"
>> "%ROOT%\.ff_env.bat" echo set "FF_ENV_NAME=%ENV_NAME%"

echo  ================================================================
echo    Installation finished
echo ----------------------------------------------------------------
echo    start the app with:  windows_launch.bat
echo  ================================================================
echo.
set "DOWNLOAD_MODELS="
set /p "DOWNLOAD_MODELS=Download the models for the detected hardware now (recommended) [Y/n]: "
if /i "%DOWNLOAD_MODELS%"=="n" goto :models_skipped
if /i "%DOWNLOAD_MODELS%"=="no" goto :models_skipped
echo  [..]   downloading the models, this can take a few minutes ...
python facefusion.py download-models
if errorlevel 1 goto :models_failed
echo  [ok]   the models are ready
goto :finished

:models_failed
echo  [warn] not all models could be downloaded.
echo         they are downloaded automatically on the first start, or later
echo         on with the "DOWNLOAD MODELS" button inside the app.
goto :finished

:models_skipped
echo  [warn] the models are downloaded automatically on the first start.
echo         you can also use the "DOWNLOAD MODELS" button inside the app.
goto :finished

:deps_error
echo.
echo  [ERROR] the python packages could not be installed.
echo          check the internet connection and run this script again.
echo.
pause
exit /b 1

:no_pip
echo.
echo  [ERROR] pip is not available in the environment "%ENV_NAME%".
echo.
pause
exit /b 1

:no_env
echo.
echo  [ERROR] the conda environment "%ENV_NAME%" could not be activated.
echo.
pause
exit /b 1

:finished
echo.
echo  Done.
echo.
pause
exit /b 0
