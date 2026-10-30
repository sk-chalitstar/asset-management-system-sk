@echo off
title GitHub Uploader - sk-chalitstar
cls

cd /d "%~dp0"

echo ========================================================
echo   Asset and Maintenance Management System
echo   Target: https://github.com/sk-chalitstar/asset-management-system-sk.git
echo ========================================================
echo.

echo [*] Setting Git remote target...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/sk-chalitstar/asset-management-system-sk.git
git remote set-url origin https://github.com/sk-chalitstar/asset-management-system-sk.git
echo   - Remote URL set to: https://github.com/sk-chalitstar/asset-management-system-sk.git
echo.

echo [*] Staging and committing files...
git add .
git commit -m "Remove demo login buttons and update system" >nul 2>&1
git branch -M main

echo.
echo [*] Pushing files to GitHub...
echo   If a browser window opens, please sign in with: sk-chalitstar
echo.
git push -u origin main --force

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   [SUCCESS] Code pushed to GitHub successfully!
    echo   Check your repository at:
    echo   https://github.com/sk-chalitstar/asset-management-system-sk
    echo ========================================================
    echo.
    echo Next: Enable GitHub Pages to get your live website:
    echo 1. Go to: https://github.com/sk-chalitstar/asset-management-system-sk/settings/pages
    echo 2. Set Branch to 'main' and folder to '/(root)'
    echo 3. Click Save. Your website will be live in 1-2 minutes!
    echo.
) else (
    echo.
    echo ========================================================
    echo   [ERROR] Push failed.
    echo   Please make sure:
    echo   1. You ran "reset-github-login.bat" first
    echo   2. You signed in with account: sk-chalitstar
    echo ========================================================
    echo.
)

pause
