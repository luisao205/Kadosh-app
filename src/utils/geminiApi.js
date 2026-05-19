/**
 * Función para comunicarse con la API de Gemini (Google AI Studio)
 * Extrae y formatea canciones con nuestro formato estructurado.
 */


export const buscarSugerenciasIA = async (busqueda) => {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  if (!API_KEY) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          { titulo: "Quien Podrá", artista: "Averly Morillo" },
          { titulo: "Quien Podrá", artista: "Hillsong Worship" }
        ]);
      }, 1500);
    });
  }

  const prompt = `Busca hasta 5 opciones de canciones (preferiblemente cristianas o de adoración) que coincidan con la búsqueda: "${busqueda}".
  Devuelve ÚNICAMENTE un arreglo de objetos JSON con esta estructura exacta, sin texto adicional ni formato markdown:
  [{"titulo": "Nombre de la canción", "artista": "Nombre del artista"}]`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (response.status === 429) {
      throw new Error("Límite de peticiones alcanzado. Por favor, espera 1 minuto antes de volver a buscar.");
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let textoLimpio = data.candidates[0].content.parts[0].text.trim();
    // Limpiar etiquetas de código si Gemini las agrega (ej. ```json ... ```)
    textoLimpio = textoLimpio.replace(/^```(json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    return JSON.parse(textoLimpio);
  } catch (error) {
    console.error("Error en sugerencias Gemini:", error);
    throw error;
  }
};

export const buscarMetadatosIA = async (titulo, artista) => {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  if (!API_KEY) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ tono: "G", bpm: "120" });
      }, 2500);
    });
  }

  const prompt = `Actúa como un director musical. BUSCA EN INTERNET (es obligatorio usar la herramienta de búsqueda) el tono original y el BPM (tempo) de la canción "${titulo}" de "${artista}".
  IMPORTANTE: No adivines ni inventes los datos. Si no los encuentras en internet, déjalos vacíos.
  Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta, sin formato markdown ni texto adicional:
  {"tono": "Tono o vacío", "bpm": 120 o 0}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearchRetrieval: {} }]
      })
    });

    if (response.status === 429) {
      throw new Error("Límite de peticiones de IA alcanzado. Espera 1 minuto.");
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    let textoLimpio = data.candidates[0].content.parts[0].text.trim();
    textoLimpio = textoLimpio.replace(/^```(json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    return JSON.parse(textoLimpio);

  } catch (error) {
    console.error("Error en Gemini API:", error);
    throw error;
  }
};