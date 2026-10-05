@echo off
REM Stops the NeuralDocker Selective stack (data volumes are kept).
setlocal
cd /d "%~dp0"
title NeuralDocker Selective - Stop

docker info >nul 2>&1
if errorlevel 1 (
    echo Docker is not running - nothing to stop.
    pause
    exit /b 0
)

echo Stopping NeuralDocker Selective...
docker compose down
echo.
echo Stopped. Your database and recordings are preserved.
pause
endlocal
