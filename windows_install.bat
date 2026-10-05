@echo off
setlocal EnableExtensions EnableDelayedExpansion
title FaceFusion Studio - installer

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "ENV_NAME=facefusion"
set "PY_VERSION=3.12"
set "HAS_NVIDIA=0"
set "MINI_ROOT=%USERPROFILE%\miniconda3"

echo.
echo  ================================================================
echo    FaceFusion Studio - Windows installer
echo    conda environment + ffmpeg + NVIDIA CUDA runtime
echo  ================================================================
echo.

cd /d "%ROOT%"

if not exist "%ROOT%\facefusion.py" (
	echo  [ERROR] facefusion.py was not found next to this script.
	echo          Keep windows_install.bat inside the FaceFusion folder.
	echo.
	pause
	exit /b 1
)
if not exist "%ROOT%\requirements.txt" (
	echo  [ERROR] requirements.txt was not found next to this script.
	echo.
	pause
	exit /b 1
)

rem ---------------------------------------------------------------- conda
set "CONDA_ROOT="

if defined CONDA_PREFIX (
	if exist "%CONDA_PREFIX%\Scripts\activate.bat" set "CONDA_ROOT=%CONDA_PREFIX%"
)

for %%D in (
	"%USERPROFILE%\miniconda3"
	"%USERPROFILE%\Miniconda3"
	"%USERPROFILE%\anaconda3"
	"%USERPROFILE%\Anaconda3"
	"%LOCALAPPDATA%\miniconda3"
	"%LOCALAPPDATA%\Continuum\anaconda3"
	"%ProgramData%\miniconda3"
	"%ProgramData%\Anaconda3"
	"%ProgramFiles%\miniconda3"
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

if defined CONDA_ROOT echo  [OK]   conda found at !CONDA_ROOT!

if not defined CONDA_ROOT (
	echo  [INFO] conda was not found, Miniconda will be installed.
	echo         Miniconda is a small Python distribution, it takes a few minutes.
	echo.
	if not "%USERPROFILE%"=="%USERPROFILE: =%" set "MINI_ROOT=C:\miniconda3"
	echo  [INFO] installing Miniconda into !MINI_ROOT! ...
	curl -L --fail --output "%TEMP%\miniconda_installer.exe" https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe
	if errorlevel 1 (
		echo  [ERROR] the Miniconda download failed, check the internet connection.
		echo          Manual download: https://docs.conda.io/en/latest/miniconda.html
		echo.
		pause
		exit /b 1
	)
	start /wait "" "%TEMP%\miniconda_installer.exe" /InstallationType=JustMe /RegisterPython=0 /AddToPath=0 /S /D=!MINI_ROOT!
	del /q "%TEMP%\miniconda_installer.exe" >nul 2>nul
	if not exist "!MINI_ROOT!\Scripts\activate.bat" (
		echo  [ERROR] the Miniconda installation failed.
		echo          Install Miniconda manually and run this script again.
		echo.
		pause
		exit /b 1
	)
	set "CONDA_ROOT=!MINI_ROOT!"
	echo  [OK]   Miniconda installed.
)

call "!CONDA_ROOT!\Scripts\activate.bat" "!CONDA_ROOT!"
if errorlevel 1 (
	echo  [ERROR] conda could not be activated.
	echo.
	pause
	exit /b 1
)

rem ---------------------------------------------------------- environment
call conda env list | findstr /r /c:"^%ENV_NAME% " >nul
if errorlevel 1 (
	echo  [INFO] creating the conda environment "%ENV_NAME%" with Python %PY_VERSION% ...
	call conda create -y -n "%ENV_NAME%" python=%PY_VERSION% pip
	if errorlevel 1 (
		echo  [ERROR] conda could not create the environment.
		echo.
		pause
		exit /b 1
	)
) else (
	echo  [OK]   the conda environment "%ENV_NAME%" already exists.
)

call conda activate "%ENV_NAME%"
if errorlevel 1 (
	echo  [ERROR] the conda environment "%ENV_NAME%" could not be activated.
	echo.
	pause
	exit /b 1
)

python -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)"
if errorlevel 1 (
	echo  [ERROR] Python 3.12 or newer is required inside the environment.
	echo.
	pause
	exit /b 1
)

python -m pip install --upgrade --quiet pip wheel setuptools
if errorlevel 1 (
	echo  [ERROR] pip could not be updated.
	echo.
	pause
	exit /b 1
)
echo  [OK]   the environment is active: !CONDA_PREFIX!

rem --------------------------------------------------------------- ffmpeg
where ffmpeg >nul 2>nul
if errorlevel 1 (
	echo  [INFO] installing ffmpeg ...
	call conda install -y -q -c conda-forge --override-channels ffmpeg
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
	echo  [ERROR] ffmpeg could not be installed.
	echo          Install it with:  winget install -e --id Gyan.FFmpeg --version 7.0.2
	echo          or with:          conda install -c conda-forge ffmpeg
	echo.
	pause
	exit /b 1
)
echo  [OK]   ffmpeg is available.

rem ------------------------------------------------------------ cuda gpu
nvidia-smi >nul 2>nul
if errorlevel 1 goto :no_gpu

set "HAS_NVIDIA=1"
echo  [OK]   NVIDIA driver detected.
nvidia-smi -L

echo  [INFO] installing the CUDA 12.9.1 runtime and cuDNN 9.10.0, this downloads around 2 GB ...
call conda tos accept --override-channels --channel nvidia >nul 2>nul
call conda tos accept --override-channels --channel conda-forge >nul 2>nul
call conda tos accept --override-channels --channel defaults >nul 2>nul
call conda install -y -c nvidia/label/cuda-12.9.1::cuda-runtime nvidia/label/cudnn-9.10.0::cudnn
if errorlevel 1 (
	echo  [WARN] the CUDA runtime could not be installed from the conda channel.
	echo         installing the pip CUDA wheels as a fallback ...
	python -m pip install nvidia-cuda-runtime-cu12==12.8.90 nvidia-cublas-cu12==12.8.4.1 nvidia-cudnn-cu12==9.8.0.87
	if errorlevel 1 (
		echo  [ERROR] the CUDA runtime could not be installed.
		echo.
		pause
		exit /b 1
	)
)

echo  [INFO] installing the Python libraries ...
python install.py cuda@12
if errorlevel 1 (
	echo  [ERROR] the Python libraries could not be installed.
	echo.
	pause
	exit /b 1
)
goto :self_test

:no_gpu
echo  [WARN] nvidia-smi was not found - no NVIDIA driver detected.
echo         The CPU runtime will be installed, the app will still run.
python install.py default
if errorlevel 1 (
	echo  [ERROR] the Python libraries could not be installed.
	echo.
	pause
	exit /b 1
)

rem ------------------------------------------------------------ self test
:self_test
echo.
echo  [INFO] verifying the installation ...
python -c "import onnxruntime, cv2, gradio, numpy, scipy; print('onnxruntime', onnxruntime.__version__); print('providers', ', '.join(onnxruntime.get_available_providers()))"
if errorlevel 1 (
	echo  [ERROR] the self test failed.
	echo.
	pause
	exit /b 1
)

python -c "import onnxruntime, sys; sys.exit(0 if 'CUDAExecutionProvider' in onnxruntime.get_available_providers() else 1)"
if errorlevel 1 goto :no_cuda
echo  [OK]   CUDA inference is ready.
goto :write_env

:no_cuda
if "%HAS_NVIDIA%"=="1" (
	echo.
	echo  [WARN] CUDAExecutionProvider is not available.
	echo         Update to the latest NVIDIA driver and run windows_install.bat again.
)

:write_env

> "%ROOT%\.ff_env.bat" echo set "FF_CONDA_ROOT=!CONDA_ROOT!"
>> "%ROOT%\.ff_env.bat" echo set "FF_ENV_NAME=%ENV_NAME%"

echo.
echo  ================================================================
echo    Installation finished
echo ----------------------------------------------------------------
echo    start the app with:  windows_launch.bat
echo  ================================================================
echo.
set "DOWNLOAD_MODELS=N"
set /p "DOWNLOAD_MODELS=Download all models now (about 1-2 GB) [y/N]: "
if /i "%DOWNLOAD_MODELS%"=="y" (
	echo  [INFO] downloading models, this takes a while ...
	python facefusion.py force-download --download-scope full
)
echo.
echo  Done.
echo.
pause
exit /b 0
