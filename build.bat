@echo off
title Build NetMap Bundle
echo ======================================================
echo   Mengompilasi js/bundle.js dengan esbuild...
echo ======================================================
cmd /c "npx --yes esbuild js/app.js --bundle --outfile=js/bundle.js --format=iife"
echo.
echo Kompilasi bundle berhasil!
pause

