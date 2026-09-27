KADOSH - PARCHE RVC + PREVISUALIZACION DE VIDEO EN MOVIL

Que hace:
1) Copia el XML fuente a bibles-source/xml/Reina-Valera Contemporanea.xml
   (bibles-source ya esta ignorado por Git).
2) Genera public/bibles/rvc/metadata.json + 66 archivos JSON (uno por libro).
3) Registra local:rvc en src/utils/bibleService.js.
4) Corrige la miniatura de videos en Control movil/Boveda:
   - usa miniatura real de Cloudinary cuando existe o se puede derivar;
   - conserva fallback de video para URLs no Cloudinary;
   - guarda thumbnailUrl en nuevas subidas.
5) Crea backups .pre-chatgpt de los 3 archivos modificados.

NO hace:
- git commit / push
- Vercel deploy
- Firebase deploy
- GitHub Release
- generar APK/EXE

Despues de aplicar:
  npm.cmd run build
  npx.cmd cap sync android
  cd android
  gradlew.bat assembleDebug

Antes de distribuir el texto biblico en una app publica, verifica que cuentas con derechos/licencia de redistribucion del XML RVC.
