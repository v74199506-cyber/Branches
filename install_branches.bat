@echo off
setlocal EnableExtensions
title Branches - ComfyUI Installer
echo.
echo Branches - ComfyUI custom node installer
echo.
set "SOURCE_DIR=%~dp0"
set "DEFAULT_DIR=%~dp0..\ComfyUI"
set "COMFY_DIR="
if exist "%DEFAULT_DIR%\main.py" set "COMFY_DIR=%DEFAULT_DIR%"
if defined COMFY_DIR (
    echo Detected ComfyUI at "%COMFY_DIR%"
    choice /M "Use this folder"
    if errorlevel 2 set "COMFY_DIR="
)
if not defined COMFY_DIR set /p "COMFY_DIR=Enter the full path to your ComfyUI folder: "
if "%COMFY_DIR%"=="" goto :cancel
rem Accept the ComfyUI root, its custom_nodes folder, or an existing custom node folder.
if exist "%COMFY_DIR%\..\main.py" set "COMFY_DIR=%COMFY_DIR%\.."
if exist "%COMFY_DIR%\..\..\main.py" set "COMFY_DIR=%COMFY_DIR%\..\.."
if not exist "%COMFY_DIR%\main.py" (
    echo Could not find main.py in the selected folder or its parent folders.
    echo Please select the main ComfyUI folder, not only the custom_nodes folder.
    goto :cancel
)
for %%I in ("%COMFY_DIR%") do set "COMFY_DIR=%%~fI"
set "TARGET_DIR=%COMFY_DIR%\custom_nodes\Branches"
if not exist "%COMFY_DIR%\custom_nodes" mkdir "%COMFY_DIR%\custom_nodes"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
echo Installing to "%TARGET_DIR%"...
robocopy "%SOURCE_DIR%" "%TARGET_DIR%" /E /XD "%SOURCE_DIR%.git" /XF "install_branches.bat" >nul
if %ERRORLEVEL% GEQ 8 (
    echo Installation failed.
    pause
    exit /b 1
)
echo Installation complete. Restart ComfyUI and refresh the browser.
pause
exit /b 0
:cancel
echo Installation cancelled.
pause
exit /b 1
