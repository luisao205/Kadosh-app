# Predica de prueba

`prueba-sistema-predicacion.json` contiene una fixture compatible con el modelo actual de `PreachingManagement`.

No se importa automaticamente y no contiene credenciales. Para mantener las Firestore Rules como autoridad, la carga debe realizarse con una sesion OWNER mediante el flujo administrativo existente:

1. Crear el evento `PRUEBA SISTEMA - Evento de Predicacion` con fecha `2026-09-21`.
2. Crear `PRUEBA SISTEMA - Predicacion de Prueba` en el modulo Predicas.
3. Elegir `Predicador externo` y escribir `Predicador de Prueba`.
4. Asociar la predica al evento de prueba.
5. Reproducir los bloques de la fixture respetando su orden.

La descripcion solicitada esta almacenada como nota compartida porque el contrato actual de predicas no define un campo `description`. La instruccion multimedia no referencia ningun archivo real de la boveda.

Validacion local:

```powershell
node scripts/test-preaching-fixture.mjs
```
