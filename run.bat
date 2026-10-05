@echo off
REM ============================================================
REM  NeuralDocker Selective - one-click launcher (Windows)
REM
REM  Usage:
REM    run.bat           default (pinned NVIDIA config)
REM    run.bat cpu       CPU-only
REM    run.bat nvidia    NVIDIA with custom CUDA (set by setup.sh)
REM
REM  What it does: makes sure .env has strong secrets, starts
REM  Docker Desktop if needed, builds/starts the stack in the
REM  background, waits until it responds, then opens the frontend
REM  in your default browser.
REM ============================================================
setlocal
cd /d "%~dp0"
title NeuralDocker Selective

set "MODE=%~1"
set "COMPOSE=docker compose"
if /i "%MODE%"=="cpu"    set "COMPOSE=docker compose -f docker-compose.yml -f docker-compose.cpu.yml"
if /i "%MODE%"=="nvidia" set "COMPOSE=docker compose -f docker-compose.yml -f docker-compose.nvidia.yml"

set "FRONTEND_URL=http://localhost:3000"
set "BACKEND_URL=http://localhost:8081"

echo ==================================================
echo  NeuralDocker Selective
echo ==================================================

REM --- 1. Docker installed? ---
where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker was not found. Install Docker Desktop first:
    echo         https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

REM --- 2. .env present with strong secrets? ---
REM     Creates .env if missing and generates JWT_SECRET / SERVICE_TOKEN when they
REM     are blank or still a publicly known default. Custom values are left alone.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-env.ps1"
if errorlevel 1 (
    echo [ERROR] Could not prepare .env - see the message above.
    pause
    exit /b 1
)
echo [INFO] Add your NGROK_AUTHTOKEN to .env if you want cluster/tunnel features.

REM --- 3. Docker daemon running? Start Docker Desktop if not. ---
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

echo [INFO] Docker is not running - starting Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else (
    echo [ERROR] Could not find Docker Desktop. Please start Docker manually and re-run.
    pause
    exit /b 1
)

set /a TRIES=0
:wait_docker
set /a TRIES+=1
if %TRIES% GTR 60 (
    echo [ERROR] Docker did not become ready within ~3 minutes.
    pause
    exit /b 1
)
timeout /t 3 /nobreak >nul
docker info >nul 2>&1
if errorlevel 1 (
    echo   waiting for Docker... [%TRIES%/60]
    goto wait_docker
)

:docker_ready
echo [OK] Docker is running.

REM --- 4. Build + start the stack in the background ---
echo.
echo [INFO] Starting containers (first run builds images and can take a while)...
%COMPOSE% up -d --build
if errorlevel 1 (
    echo.
    echo [ERROR] docker compose failed. See the output above.
    pause
    exit /b 1
)

REM --- 5. Wait for backend + frontend to answer ---
echo.
echo [INFO] Waiting for the app to come up...
set /a TRIES=0
:wait_app
set /a TRIES+=1
if %TRIES% GTR 60 (
    echo [WARN] App is slow to respond - opening the browser anyway.
    echo        If the backend refuses to start, run: docker compose logs backend
    goto open_browser
)
curl -s -o nul %BACKEND_URL%/ >nul 2>&1
if errorlevel 1 (
    echo   backend not ready yet... [%TRIES%/60]
    timeout /t 3 /nobreak >nul
    goto wait_app
)
curl -s -o nul %FRONTEND_URL%/ >nul 2>&1
if errorlevel 1 (
    echo   frontend not ready yet... [%TRIES%/60]
    timeout /t 3 /nobreak >nul
    goto wait_app
)

:open_browser
echo.
echo [OK] NeuralDocker Selective is up. Opening %FRONTEND_URL%
start "" "%FRONTEND_URL%"

echo.
echo The containers keep running in the background.
echo   Stop them with:  stop.bat
echo   View logs with:  docker compose logs -f
echo.
pause
endlocal
