@echo off
setlocal
set "REPO=C:\Users\luist\OneDrive\Desktop\PROYECTOS WEBS\KADOSH\SISTEMA MUSICAL"
set "PATCH=%~dp0"

echo ==============================================
echo KADOSH - RVC + PREVISUALIZACION VIDEO MOVIL
echo ==============================================

if not exist "%REPO%\package.json" (
  echo ERROR: No se encontro el proyecto en:
  echo %REPO%
  pause
  exit /b 1
)

if not exist "%REPO%\bibles-source\xml" mkdir "%REPO%\bibles-source\xml"
copy /Y "%PATCH%Reina-Valera Contemporanea.xml" "%REPO%\bibles-source\xml\Reina-Valera Contemporanea.xml" >nul
copy /Y "%PATCH%scripts\import-rvc-xml.mjs" "%REPO%\scripts\import-rvc-xml.mjs" >nul

cd /d "%REPO%"
node "%PATCH%apply-rvc-mobile-preview-patch.mjs" "%REPO%"
if errorlevel 1 goto :error

node scripts\import-rvc-xml.mjs "bibles-source\xml\Reina-Valera Contemporanea.xml" "public\bibles\rvc"
if errorlevel 1 goto :error

echo.
echo PARCHE APLICADO LOCALMENTE.
echo NO se hizo git push, deploy, release ni APK.
echo Ahora ejecuta: npm.cmd run build
pause
exit /b 0

:error
echo.
echo ERROR aplicando el parche. No publiques el APK.
pause
exit /b 1
