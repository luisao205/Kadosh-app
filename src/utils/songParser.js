/**
 * Convierte un texto plano con acordes en formato [C] a un objeto estructurado.
 * Utiliza "# NombreSeccion" para dividir los bloques de la canción.
 */
export const parsearCancion = (textoRaw) => {
  if (!textoRaw) return [];
  
  const secciones = [];
  let seccionActual = null;

  const lineas = textoRaw.split('\n');

  lineas.forEach(linea => {
    const lineaLimpia = linea.trim();
    if (!lineaLimpia) return;

    // Detectar nueva sección (ej. "# Verso 1")
    if (lineaLimpia.startsWith('#')) {
      seccionActual = { titulo: lineaLimpia.substring(1).trim(), lineas: [] };
      secciones.push(seccionActual);
    } else {
      // Si hay texto antes de definir una sección, crear una por defecto
      if (!seccionActual) {
        seccionActual = { titulo: 'Inicio', lineas: [] };
        secciones.push(seccionActual);
      }
      
      // Tokenizar: Extrae acordes enteros, espacios, o bloques de texto
      const tokens = lineaLimpia.match(/(\[[^\]]+\]|[^\[\s]+|\s+)/g) || [];
      const lineaEstructurada = [];
      let palabraActual = [];
      let acordeActual = "";

      tokens.forEach(token => {
        if (token.startsWith('[') && token.endsWith(']')) {
          if (acordeActual) {
            palabraActual.push({ acorde: acordeActual, texto: "\u00A0" });
          }
          acordeActual = token.slice(1, -1);
        } else if (token.trim() === '') {
          // Es un espacio en blanco, termina la palabra actual
          if (acordeActual) {
            palabraActual.push({ acorde: acordeActual, texto: "\u00A0" });
            acordeActual = "";
          }
          
          if (palabraActual.length > 0) {
            lineaEstructurada.push(palabraActual);
            palabraActual = [];
          }
        } else {
          // Es texto puro (sílaba/palabra)
          palabraActual.push({ acorde: acordeActual, texto: token });
          acordeActual = "";
        }
      });
      
      // Guardar lo que quede pendiente al final de la línea
      if (palabraActual.length > 0) {
        if (acordeActual) palabraActual.push({ acorde: acordeActual, texto: "\u00A0" });
        lineaEstructurada.push(palabraActual);
      } else if (acordeActual) {
        lineaEstructurada.push([{ acorde: acordeActual, texto: "\u00A0" }]);
      }

      if (lineaEstructurada.length > 0) seccionActual.lineas.push(lineaEstructurada);
    }
  });

  return secciones;
};