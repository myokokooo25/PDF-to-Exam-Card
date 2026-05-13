
import { GoogleGenAI, Type } from "@google/genai";
import { StudyCardData, TranslationItem, VocabItem } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    cards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          questionJP: { type: Type.STRING, description: "Japanese text with HTML <ruby> tags. Example: <ruby>建築<rt>けんちく</rt></ruby>" },
          questionMY: { type: Type.STRING, description: "Burmese translation" },
          options: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                textJP: { type: Type.STRING, description: "Japanese text with HTML <ruby> tags." },
                textMY: { type: Type.STRING, description: "Burmese translation" }
              },
              required: ["id", "textJP", "textMY"]
            }
          },
          correctOptionId: { type: Type.INTEGER },
          explanation: {
            type: Type.OBJECT,
            properties: {
              titleMY: { type: Type.STRING },
              reasonMY: { type: Type.STRING },
              memoryTipMY: { type: Type.STRING }
            },
            required: ["titleMY", "reasonMY", "memoryTipMY"]
          }
        },
        required: ["id", "questionJP", "questionMY", "options", "correctOptionId", "explanation"]
      }
    }
  },
  required: ["cards"]
};

export const processPageImages = async (base64Images: string[]): Promise<StudyCardData[]> => {
  const parts = base64Images.map(img => ({
    inlineData: {
      mimeType: 'image/jpeg',
      data: img.split(',')[1]
    }
  }));

  const prompt = `
    You are a specialized OCR and translator for Japanese Architecture Exams.
    
    CRITICAL RULE: FURIGANA GENERATION
    You MUST detect Kanji in the image and wrap it with <ruby> tags based on the reading (Furigana) shown in the image.
    If Furigana is NOT shown in the image, you MUST predict the correct reading and add it anyway.
    
    STRICT OUTPUT FORMAT FOR JAPANESE TEXT:
    Do NOT output plain Japanese text. Every Kanji MUST be wrapped.
    
    WRONG: 建築基準法
    CORRECT: <ruby>建築<rt>けんちく</rt></ruby><ruby>基準<rt>きじゅん</rt></ruby><ruby>法<rt>ほう</rt></ruby>
    
    WRONG: 最も不適当なものはどれか。
    CORRECT: <ruby>最<rt>もっと</rt></ruby>も<ruby>不適当<rt>ふてきとう</rt></ruby>なものはどれか。
    
    TASK:
    1. Extract questions and options.
    2. Identify the marked/correct answer from the image.
    3. Translate to natural technical Burmese.
    4. Provide a clear explanation in Burmese.
    5. Return valid JSON only.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [...parts, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.1,
    },
  });

  if (!response.text) {
    throw new Error("No response text from Gemini");
  }

  try {
    let text = response.text.trim();
    if (text.startsWith('```json')) {
      text = text.substring(7);
    } else if (text.startsWith('```')) {
      text = text.substring(3);
    }
    if (text.endsWith('```')) {
      text = text.substring(0, text.length - 3);
    }
    const parsed = JSON.parse(text.trim());
    return parsed.cards || [];
  } catch (e) {
    console.error("Failed to parse JSON:", response.text);
    throw new Error("Invalid JSON format received from AI");
  }
};

export const processGeneralTranslation = async (
  input: { text?: string; images?: string[] }
): Promise<TranslationItem[]> => {
  const parts: any[] = [];
  
  if (input.images && input.images.length > 0) {
    input.images.forEach(img => {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: img.split(',')[1]
        }
      });
    });
  }

  const prompt = `
    You are an expert Japanese to Burmese translator.
    I will provide you with either Japanese text or images containing Japanese text.
    Your task is to extract the text, add Furigana to ALL Kanji characters, and translate it into Burmese.
    
    CRITICAL INSTRUCTION FOR FURIGANA:
    You MUST wrap EVERY Kanji word with HTML <ruby> and <rt> tags.
    Example: <ruby>漢字<rt>かんじ</rt></ruby>
    Do not use parentheses for furigana. Use the <ruby> tag.
    
    Break the text down into logical sentences or short paragraphs.
    For each segment, provide:
    1. The Japanese text with <ruby> tags.
    2. The Burmese translation.
    
    Here is the input text to translate:
    ${input.text || ""}
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      translations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "Unique ID (e.g., '1', '2')" },
            japanese: { type: Type.STRING, description: "Japanese text with <ruby> tags for Kanji" },
            burmese: { type: Type.STRING, description: "Burmese translation" }
          },
          required: ["id", "japanese", "burmese"]
        }
      }
    },
    required: ["translations"]
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [...parts, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.1,
    },
  });

  if (!response.text) {
    throw new Error("No response text from Gemini");
  }

  try {
    let text = response.text.trim();
    if (text.startsWith('```json')) {
      text = text.substring(7);
    } else if (text.startsWith('```')) {
      text = text.substring(3);
    }
    if (text.endsWith('```')) {
      text = text.substring(0, text.length - 3);
    }
    const parsed = JSON.parse(text.trim());
    return parsed.translations || [];
  } catch (e) {
    console.error("Failed to parse JSON:", response.text);
    throw new Error("Invalid JSON format received from AI");
  }
};

export const extractVocabulary = async (text: string): Promise<VocabItem[]> => {
  const prompt = `
    Analyze the following Japanese text and extract 10 to 15 key vocabulary words or phrases.
    For each word, provide:
    1. The word itself (in Kanji or Kana as it appears).
    2. Its reading (in Hiragana or Katakana).
    3. Its meaning in Burmese.
    
    Text to analyze:
    ${text}
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      vocab: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING, description: "The Japanese word (Kanji/Kana)" },
            reading: { type: Type.STRING, description: "The reading in Hiragana/Katakana" },
            meaning: { type: Type.STRING, description: "The meaning in Burmese" }
          },
          required: ["word", "reading", "meaning"]
        }
      }
    },
    required: ["vocab"]
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.1,
    },
  });

  if (!response.text) {
    throw new Error("No response text from Gemini");
  }

  try {
    let text = response.text.trim();
    if (text.startsWith('```json')) {
      text = text.substring(7);
    } else if (text.startsWith('```')) {
      text = text.substring(3);
    }
    if (text.endsWith('```')) {
      text = text.substring(0, text.length - 3);
    }
    const parsed = JSON.parse(text.trim());
    return parsed.vocab || [];
  } catch (e) {
    console.error("Failed to parse JSON:", response.text);
    throw new Error("Invalid JSON format received from AI");
  }
};
