@echo off
cd /d "%~dp0"
.\gradlew compileDebugKotlin 2>&1 | findstr /i "error:" > build_errors.txt
type build_errors.txt
pause
