@echo off
setlocal EnableExtensions EnableDelayedExpansion
title FaceFusion Studio

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "ENV_NAME=facefusion"
set "CONDA_ROOT="

if not exist "%ROOT%\facefusion.py" (
	echo  [ERROR] facefusion.py was not found next to this script.
	echo          keep windows_launch.bat inside the FaceFusion folder.
	echo.
	pause
	exit /b 1
)

cd /d "%ROOT%"

if exist "%ROOT%\.ff_env.bat" call "%ROOT%\.ff_env.bat" >nul 2>nul
if defined FF_CONDA_ROOT set "CONDA_ROOT=%FF_CONDA_ROOT%"
if defined FF_ENV_NAME set "ENV_NAME=%FF_ENV_NAME%"

if not defined CONDA_ROOT if defined CONDA_PREFIX if exist "%CONDA_PREFIX%\Scripts\activate.bat" set "CONDA_ROOT=%CONDA_PREFIX%"

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

if not defined CONDA_ROOT (
	echo  [ERROR] conda was not found.
	echo          run windows_install.bat first.
	echo.
	pause
	exit /b 1
)

call "!CONDA_ROOT!\Scripts\activate.bat" "!CONDA_ROOT!"
call conda activate "%ENV_NAME%"
if errorlevel 1 (
	echo  [ERROR] the conda environment "%ENV_NAME%" could not be activated.
	echo          run windows_install.bat first.
	echo.
	pause
	exit /b 1
)

python -c "import gradio, onnxruntime" >nul 2>nul
if errorlevel 1 (
	echo  [ERROR] the libraries are missing in the environment "%ENV_NAME%".
	echo          run windows_install.bat first.
	echo.
	pause
	exit /b 1
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
	echo  [WARN] ffmpeg was not found in this environment.
	echo         run windows_install.bat again to install it.
	echo.
)

set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "OMP_NUM_THREADS=1"
set "GRADIO_ANALYTICS_ENABLED=0"

echo.
echo  ================================================================
echo    FaceFusion Studio
echo ----------------------------------------------------------------
echo    interface:  http://127.0.0.1:7860
echo    the hardware is detected on startup and the preset is applied
echo    missing models are downloaded on the first start
echo ----------------------------------------------------------------
echo    close this window or press Ctrl+C to stop the app
echo  ================================================================
echo.

python facefusion.py run --ui-layouts studio --open-browser %*

echo.
echo  FaceFusion Studio has stopped.
pause
exit /b 0
