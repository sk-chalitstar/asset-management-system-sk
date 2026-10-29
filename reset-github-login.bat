@echo off
title Reset GitHub Login
cls

echo ========================================================
echo   Resetting GitHub Credentials in Windows...
echo ========================================================
echo.

cmdkey /delete:git:https://github.com

echo.
echo ========================================================
echo   [OK] GitHub login cleared successfully!
echo.
echo   Next step:
echo   Please run "upload-to-github.bat" now.
echo   A browser will prompt you to sign in with:
echo   sk-chalitstar
echo ========================================================
echo.
pause
