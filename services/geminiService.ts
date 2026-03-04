import { GoogleGenAI, Type } from "@google/genai";
import { WordData } from "../types";

const apiKey = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

// Helper for retrying async operations
async function withRetry<T>(operation: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const errString = error?.message || JSON.stringify(error);
    
    // Check for Quota limits immediately and trigger UI redirect
    if (errString.includes('429') || errString.includes('RESOURCE_EXHAUSTED')) {
        console.warn("Quota exceeded, triggering paywall.");
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('gemini-quota-exceeded'));
        }
        throw error; // Stop execution
    }

    // Other fatal errors
    const isFatal = errString.includes('PERMISSION_DENIED') ||
                    errString.includes('API_KEY_INVALID');

    if (retries > 0 && !isFatal) {
      console.warn(`Operation failed, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

export const generateWordData = async (word: string): Promise<WordData> => {
  return withRetry(async () => {
    const model = 'gemini-3-flash-preview';
    
    const response = await ai.models.generateContent({
      model,
      contents: `Generate detailed vocabulary data for the English word: "${word}". 
      Target audience: Elementary school students learning English. 
      
      1. "parts": Break the word into **Spelling Chunks** using a **Right-to-Left** analysis strategy.
         - **Rule 1 (V/CV)**: If there is ONE consonant between two vowels, split BEFORE the consonant. The consonant goes to the right. (e.g., 'tiger' -> ['ti', 'ger'], 'paper' -> ['pa', 'per']).
         - **Rule 2 (VC/CV)**: If there are TWO consonants between vowels, split BETWEEN them. (e.g., 'rabbit' -> ['rab', 'bit']).
         - **Rule 3 (Ends)**: Keep suffixes intact where possible (e.g., 'ment', 'tion', 'ing').
         - **Rule 4 (Silent E)**: Silent 'e' at the end is not a separate chunk. It belongs to the preceding vowel group.
         - **Rule 5 (Vowel Teams)**: Vowel digraphs (e.g., 'ai', 'ea', 'oa', 'ou') count as ONE vowel sound and are NOT split.
         - **Rule 6 (Single Vowel Sound)**: If a word has only one vowel sound (like 'cake', 'make', 'bike'), do NOT split it. It is a single chunk.
         - **Specific Override**: For "cake", use ["cake"].
         - **Specific Override**: For "education", use ["e", "du", "ca", "tion"].
         - **Specific Override**: For "helicopter", use ["he", "li", "cop", "ter"].
         - **Specific Override**: For "argument", use ["ar", "gu", "ment"].
         - **Specific Override**: For "bucket", use ["bu", "cket"].
         - **Specific Override**: For "slime", use ["s", "lime"].
         - **Specific Override**: For "bait", use ["bait"].
         - **Goal**: Every part should be a pronounceable chunk, ideally following "One Vowel One Consonant" flow where the consonant leads the next vowel.
      2. "partsPronunciation": An array of simple English strings mirroring "parts" to help a TTS engine pronounce the syllable correctly in isolation.
         - **Crucial**: The goal is standard American pronunciation.
         - **Specific Override**: "ti" in tiger -> "tie". "ger" in tiger -> "gur".
         - **Specific Override**: "gu" in argument -> "gyou".
         - **Specific Override**: "bu" in bucket -> "buck". "cket" in bucket -> "it".
         - **Specific Override**: "s" in slime -> "ss". "lime" in slime -> "lime".
         - **Specific Override**: "bait" in bait -> "bate".
         - **Specific Override**: "cake" in cake -> "cake".
         - **Specific Override**: "ca" in education -> "kay". "du" in education -> "jew".
         - Example: "tiger" -> ["tie", "gur"]
         - Example: "education" -> ["eh", "jew", "kay", "shun"]
         - Example: "helicopter" -> ["heh", "lih", "cop", "tur"]
         - Example: "argument" -> ["are", "gyou", "ment"]
         - Example: "apple" -> ["ap", "pull"]
      3. "root": A very simple etymology or memory aid (e.g. "From Latin 'educare' meaning to lead out").
      4. "phonetic": **Standard US English IPA** (International Phonetic Alphabet). Ensure it is accurate.
      5. "translation": Chinese translation.
      6. "sentence": Simple example sentence.
      7. "phrases": List 3 short, simple, and common phrases/collocations using this word (max 3-4 words each) to help understand usage (e.g. "red apple", "big apple").
      8. "relatedWords": List of 3 English words that share similar spelling patterns, roots, or are compound words containing this word (e.g. for 'seven' -> 'seventeen', 'seventy', 'seventh'). If none exist, use rhyming words.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            parts: { type: Type.ARRAY, items: { type: Type.STRING } },
            partsPronunciation: { type: Type.ARRAY, items: { type: Type.STRING } },
            root: { type: Type.STRING },
            phonetic: { type: Type.STRING },
            translation: { type: Type.STRING },
            sentence: { type: Type.STRING },
            phrases: { type: Type.ARRAY, items: { type: Type.STRING } },
            relatedWords: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["word", "parts", "partsPronunciation", "root", "phonetic", "translation", "sentence", "phrases", "relatedWords"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No data returned from Gemini");
    
    return JSON.parse(text) as WordData;
  });
};

export const generateWordImage = async (word: string): Promise<string> => {
  try {
    // Explicitly using gemini-2.5-flash-image for image generation
    const model = 'gemini-2.5-flash-image';
    const prompt = `A cute, colorful, cartoon-style illustration for children representing the word: "${word}". Simple background, vector art style.`;
    
    // Attempt generation with retry
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model,
        contents: { parts: [{ text: prompt }] },
      });

      const candidates = response.candidates;
      if (candidates && candidates.length > 0) {
         const parts = candidates[0].content.parts;
         for (const part of parts) {
           // Check for inlineData (base64 image)
           if (part.inlineData && part.inlineData.data) {
             return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
           }
         }
      }
      throw new Error("No image data found in response");
    }, 2); // Retry 2 times
    
  } catch (error: any) {
    const errString = error?.message || JSON.stringify(error);
    
    // If it was a quota error, it would have been caught in withRetry and dispatched the event.
    // If we are here, it's a different error (e.g., content policy, network).
    
    console.error("Image generation failed:", error);
    
    // Return a consistent fallback image based on the word seed
    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><rect width='400' height='400' fill='%23e0f2fe'/><text x='50%' y='50%' font-family='sans-serif' font-size='80' fill='%237dd3fc' text-anchor='middle' dominant-baseline='middle'>🖼️</text><text x='50%' y='65%' font-family='sans-serif' font-size='20' fill='%237dd3fc' text-anchor='middle' dominant-baseline='middle'>No Image</text></svg>`;
  }
};