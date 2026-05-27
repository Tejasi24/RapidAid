// Nova Gemini AI Service File
// Communicates directly with the Google Gemini API using frontend environment variable VITE_GEMINI_API_KEY

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Generates a dynamic, empathetic emergency response from Google Gemini API.
 * 
 * @param {string} currentMessage - The latest user spoken transcription text
 * @param {Array} chatHistory - The array of previous messages in active session { role, text }
 * @param {string} systemInstruction - The strict system instruction guidelines for emergency response
 * @returns {Promise<string>} - The dynamic AI generated voice script
 */
export async function generateNovaResponse(currentMessage, chatHistory = [], systemInstruction = "") {
  try {
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
      console.warn("Gemini API Key is not set or is using the placeholder. Falling back to local emergency engine.");
      throw new Error("Missing or unconfigured VITE_GEMINI_API_KEY");
    }

    // Format previous conversation history for Gemini context memory
    // Gemini expects roles: 'user' and 'model' (we map 'nova' to 'model')
    const contents = chatHistory.map(msg => ({
      role: msg.role === 'nova' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: currentMessage }]
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: contents,
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        maxOutputTokens: 200,
        temperature: 0.7
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini HTTP error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!replyText) {
      throw new Error("Invalid response format received from Google Gemini API");
    }

    return replyText.trim();
  } catch (err) {
    console.error("Error in geminiService.js:", err.message);
    throw err;
  }
}
