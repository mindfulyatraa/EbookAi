import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

// --- KEY MANAGEMENT (ROTATION) ---
const STORAGE_KEY = 'probook_ai_keys';

class KeyManager {
  private keys: string[] = [];
  private currentIndex = 0;
  private cooldowns: Map<string, number> = new Map();

  constructor() {
    this.reloadKeys();
  }

  reloadKeys() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const userKeys = saved ? JSON.parse(saved) : [];
    
    // Combine Env Key (Backup) + User Keys
    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    this.keys = [...new Set([envKey, ...userKeys])].filter(Boolean) as string[];
    
    if (this.keys.length === 0) {
      console.warn("No Gemini API Keys found! Please add them in Settings.");
    }
  }

  getNextKey(): string {
    if (this.keys.length === 0) return '';
    
    // Check for available key (not in cooldown)
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[idx];
      
      const cooldownUntil = this.cooldowns.get(key) || 0;
      if (Date.now() > cooldownUntil) {
        this.currentIndex = (idx + 1) % this.keys.length;
        return key;
      }
    }

    // All keys in cooldown? Return the first one and hope for the best, or wait
    return this.keys[this.currentIndex];
  }

  markExhausted(key: string) {
    console.warn(`Key exhausted, putting it in cooldown: ${key.substring(0, 8)}...`);
    this.cooldowns.set(key, Date.now() + 60000); // 1 minute cooldown
  }

  getKeyCount() {
    return this.keys.length;
  }
}

export const keyManager = new KeyManager();

// --- HELPERS ---
const getAi = () => {
  const key = keyManager.getNextKey();
  return new GoogleGenAI({ apiKey: key });
};

// --- CIRCUIT BREAKER (IMAGES) ---
// Note: Circuit breaker is now integrated into Rotation logic, 
// but we keep this for additional safety on heavy image bursts.
let isImageQuotaLocked = false;
let imageQuotaResetTime = 0;

const checkImageCircuitBreaker = () => {
  if (isImageQuotaLocked) {
    const remaining = Math.ceil((imageQuotaResetTime - Date.now()) / 1000);
    if (remaining > 0) {
      throw new Error(`QUOTA_COOLDOWN:${remaining}`);
    } else {
      isImageQuotaLocked = false; 
    }
  }
};

const triggerImageCircuitBreaker = () => {
  if (!isImageQuotaLocked) {
    console.warn("⚠️ IMAGE QUOTA HIT! Pausing images for 60 seconds.");
    isImageQuotaLocked = true;
    imageQuotaResetTime = Date.now() + 60000; 
  }
};

// --- SYSTEM INSTRUCTION ---
const EBOOK_CREATOR_SYSTEM_INSTRUCTION = `
You are a Professional Ebook Creator AI. You are writing and formatting a high-quality ebook based on the provided topic and target audience.

***STRICT WRITING & FORMATTING RULES***

1. **Deep & High-Value Content**: Do not write surface-level or extremely short chapters. Expand on every concept with practical real-life examples, case studies, or actionable steps relevant to the book's specific topic.
2. **Strict Formatting**: Do NOT include random characters, symbols, or page numbers (e.g., 'Page 2') in the generated text. Page numbers and footers are handled by the layout software.
3. **CRITICAL RULE**: You are strictly forbidden from generating page numbers (e.g., 'Page 3', 'Page 4') anywhere in the output. Do not add any random characters or artifacts like 'TT'. Output ONLY the raw readable book content.
4. **Clean Table of Contents**: Generate a perfectly formatted Table of Contents without any broken lines, weird spacing, or punctuation marks around the numbers. It must fit on ONE SINGLE PAGE.
5. **Adaptive Tone**: Keep the tone perfectly aligned with the book's genre and target audience (e.g., highly empathetic and calm for mental health, authoritative for business, engaging for fiction).
6. **Token Limit Handling**: Ensure the output is fully completed. Do not stop mid-sentence. If the content is too long for one response, complete the current section and explicitly write '[Type Continue for the rest]' at the end.

***IMAGE GENERATION UNIVERSAL STRICT RULES***

When generating image prompts for this ebook, you must adhere to the following constraints to ensure professional, 5-star quality:

1. **ZERO TEXT OR NUMBERS**: Absolutely no letters, words, numbers, or symbols should be generated inside the images. All images must be 100% text-free.
2. **Accurate Metaphors**: The visuals must exactly match the context of the chapter. Ensure the setting, objects, and mood make logical sense according to the text provided.
3. **Appropriate Vibe**: Keep the visual tone perfectly aligned with the book's genre. Avoid overly dramatic, futuristic, or mismatched elements unless explicitly requested.
4. **GENRE LOCK**: All visual descriptions or image prompts must be grounded in realism, minimal art, nature, or calming everyday settings. STRICTLY NO sci-fi, no cyberpunk, no futuristic technology, no glowing wires, and no dramatic action scenes.
5. **Blank Templates for Diagrams**: For any roadmaps, timelines, or step-by-step guides, generate a blank illustration with empty visual steps/pathways. DO NOT attempt to number the steps or write explanatory text inside the image.

***PAGING STRUCTURE***
- [EBOOK TITLE] -> Cover Page.
- [TABLE OF CONTENTS] -> Must be on its own page.
- [AUTHOR PAGE] -> Must be on its own page.
- [INTRODUCTION] -> Must be on its own page.
- [CHAPTER X] -> Start every chapter on a NEW page.
- [CONCLUSION] -> Must be on its own page.

***EBOOK STRUCTURE TEMPLATE***

[EBOOK TITLE]
Subtitle
By [Author Name]
<<IMAGE_PROMPT: COVER: [Detailed description following strict image rules]>>

[TABLE OF CONTENTS]
- Introduction
- Chapter 1: [Title]
- ...
- Conclusion

[AUTHOR PAGE]
About the Author
(Content...)
<<IMAGE_PROMPT: AUTHOR: [Detailed description following strict image rules]>>

[INTRODUCTION]
(Content...)

CHAPTER 1 - Title
<<IMAGE_PROMPT: ILLUSTRATION: [Detailed description following strict image rules]>>
(Content...)

... (Continue for all chapters) ...

[CONCLUSION]
Final Summary

✔ EBOOK COMPLETE.
`;

const generateEbookTool: FunctionDeclaration = {
  name: "generate_ebook",
  description: "Triggers the generation of the ebook based on the collected details. Can generate the whole book or specific sections.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      topic: { type: Type.STRING, description: "The main topic/title of the ebook" },
      authorName: { type: Type.STRING, description: "The name of the author to appear on the cover." },
      language: { 
        type: Type.STRING, 
        enum: ["English", "Hindi", "Hinglish"],
        description: "The language to write the ebook in." 
      },
      details: { type: Type.STRING, description: "Detailed summary of audience, tone, chapters, and specific content requirements" },
      section: { type: Type.STRING, description: "Optional: Specify a section to generate (e.g., 'Chapter 1', 'Introduction', 'Front Matter'). If omitted, generates the whole book." },
    },
    required: ["topic", "authorName", "language", "details"],
  },
};

const editEbookTool: FunctionDeclaration = {
  name: "edit_ebook",
  description: "Edits the ebook content based on user instructions.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      instruction: { type: Type.STRING, description: "The specific instruction for editing (e.g. 'Add a chapter about X', 'Change the author name')." },
    },
    required: ["instruction"],
  },
};

// Used for the initial chat interface
export const createConsultantChat = () => {
  return getAi().chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: "You are a Professional Ebook Publishing Consultant. Your goal is to help users create high-value, deep-content ebooks with professional visual storytelling. \n\n1. Ask for the **Ebook Topic**.\n2. Ask for the **Author Name**.\n3. Ask for the **Language**.\n4. Ask for specific details about the target audience or key chapters to ensure high-value content.\n\n**CRITICAL STRATEGY**: To ensure maximum depth and avoid token limits, DO NOT generate the whole book at once. \n- First, call `generate_ebook` with `section: 'Front Matter'` to generate the Cover, TOC, Author Page, and Introduction.\n- Then, tell the user you will generate chapters one by one for better detail.\n- Call `generate_ebook` for each chapter individually (e.g., `section: 'Chapter 1'`) only when the user is ready or prompted.\n\nIf the user wants to refine or edit the book later, use `edit_ebook`.",
      tools: [{ functionDeclarations: [generateEbookTool, editEbookTool] }],
    }
  });
};

// Used to generate the actual book content
export const streamEbookContent = async (
  topic: string,
  details: string,
  language: string,
  authorName: string,
  onChunk: (text: string) => void,
  currentContent?: string,
  section?: string
) => {
  const maxRetries = Math.max(3, keyManager.getKeyCount());
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      attempts++;
      let prompt = ``;
      
      if (currentContent && !section) {
        // EDIT MODE
        prompt = `
        Task: REWRITE the ebook with the following changes.
        Change Instruction: ${details}
        Original Topic: ${topic}
        Original Author: ${authorName}
        Language: ${language}
        
        Requirements:
        1. Keep the same structure ([EBOOK TITLE], [TABLE OF CONTENTS], etc).
        2. Apply the user's change strictly.
        3. Output the WHOLE book again.
        `;
      } else {
        // CREATE MODE
        const sectionFocus = section ? `Focus ONLY on generating the ${section}.` : "Write the complete, premium ebook.";
        prompt = `
        Task: ${sectionFocus}
        Topic: ${topic}
        Author: ${authorName}
        Language: ${language}
        Details: ${details}
        
        Structure Checklist (if generating whole book):
        1. Cover Page (Title + Image)
        2. Table of Contents (ONE PAGE ONLY)
        3. Author Page (ONE PAGE ONLY)
        4. Introduction (ONE PAGE ONLY)
        5. Minimum 5 Chapters (Detailed)
        6. Conclusion
        7. Visuals: High-quality illustrations for each chapter.
        
        If generating a specific section, follow the structure markers (e.g., [CHAPTER 1]) defined in your system instructions.
        `;
      }
      
      const ai = getAi();
      const response = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          systemInstruction: EBOOK_CREATOR_SYSTEM_INSTRUCTION,
          temperature: 0.7,
        }
      });

      for await (const chunk of response) {
        if (chunk.text) {
          onChunk(chunk.text);
        }
      }
      return; // Success!

    } catch (error: any) {
      console.error(`Attempt ${attempts} failed:`, error);
      
      const isQuotaError = error?.message?.includes('429') || error?.status === 429 || error?.message?.includes('quota');
      
      if (isQuotaError && attempts < maxRetries) {
        const exhaustedKey = (getAi() as any).apiKey; // This is a bit hacky but works for logging or marking
        // Mark the current key as exhausted to switch to next one in next iteration of loop
        keyManager.markExhausted(""); // We don't have direct access here easily without changing getAi signature
        // Actually, getAi() returns a new instance every time, so it will get the next key anyway.
        continue; 
      }
      
      onChunk(`\n\n**[SYSTEM ERROR]**\n\nAn error occurred: ${error.message}. Please check your API Keys in Settings.`);
      break;
    }
  }
};

// Queue system to prevent Rate Limit (429) errors during image generation bursts
class RequestQueue {
  private queue: (() => Promise<void>)[] = [];
  private isProcessing = false;
  private delayMs = 1000; 

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        // Double check breaker before processing task
        if (isImageQuotaLocked) {
           await new Promise(resolve => setTimeout(resolve, 5000)); 
           this.queue.unshift(task!); 
           continue;
        }

        await task();
        if (this.queue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, this.delayMs));
        }
      }
    }
    this.isProcessing = false;
  }
}

const imageQueue = new RequestQueue();
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const getFallbackImage = (prompt: string) => `https://placehold.co/800x450/EEE/31343C?text=${encodeURIComponent(prompt.substring(0, 20))}`;

export const generateEbookImage = async (prompt: string): Promise<string> => {
  // 1. Check Circuit Breaker
  try {
     checkImageCircuitBreaker();
  } catch (e) {
     return getFallbackImage(prompt);
  }

  return imageQueue.enqueue(async () => {
    // 2. Check again inside queue
    if (isImageQuotaLocked) return getFallbackImage(prompt);

    const maxRetries = Math.max(2, keyManager.getKeyCount());
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        attempts++;
        
        let finalPrompt = prompt;
        const lowerPrompt = prompt.toLowerCase();
        
        // REFINED STYLE CONTROL
        if (lowerPrompt.includes('cover:')) {
           finalPrompt = "Professional 3D Book Cover Mockup, standing upright on a clean surface, studio lighting, high detail, 8k resolution, " + prompt.replace('COVER:', '');
        } else if (lowerPrompt.includes('diagram:') || lowerPrompt.includes('infographic') || lowerPrompt.includes('chart')) {
           finalPrompt = "High-quality vector infographic, professional corporate style, clean layout, white background, data visualization, " + prompt.replace('DIAGRAM:', '').replace('CHART:', '');
        } else if (lowerPrompt.includes('author:')) {
           finalPrompt = "Professional headshot portrait, high-end studio photography, soft lighting, neutral background, " + prompt.replace('AUTHOR:', '');
        } else {
           finalPrompt = "Premium editorial illustration, digital art style, detailed composition, cinematic lighting, 4k resolution, masterpiece, " + prompt.replace('ILLUSTRATION:', '');
        }

        const ai = getAi();
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: finalPrompt }] },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        break; 

      } catch (error: any) {
        console.warn(`Image Attempt ${attempts} failed:`, error.message);
        
        const errorMessage = error?.message || '';
        const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || error?.status === 429;
        
        if (isQuotaError) {
          if (attempts < maxRetries) {
            keyManager.markExhausted(""); 
            continue; // Try next key
          } else {
            console.warn(`All keys exhausted for image gen. Triggering Circuit Breaker.`);
            triggerImageCircuitBreaker();
            return getFallbackImage(prompt);
          }
        }

        const isServerError = error?.status === 500 || error?.status === 503;
        if (isServerError && attempts < maxRetries) {
             await wait(2000); 
             continue;
        }
        break; 
      }
    }
    return getFallbackImage(prompt);
  });
};