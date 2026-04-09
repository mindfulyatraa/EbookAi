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

// --- CONTENT SANITIZER (Post-Processing) ---
// Strips garbage characters, stray page numbers, broken symbols from AI output
const sanitizeContent = (text: string): string => {
  let cleaned = text;
  
  // Remove stray page number references like "Page 2", "Page 10", "page 3" etc.
  cleaned = cleaned.replace(/\bPage\s*\d+\b/gi, '');
  
  // Remove isolated garbage character clusters (2+ non-word chars not part of markdown)
  // This catches things like: ??  ##~~  **##  ~~** etc. that appear on their own lines
  cleaned = cleaned.replace(/^[\s]*[?#~@$%^&*=+|<>{}\[\]]{2,}[\s]*$/gm, '');
  
  // Remove lone symbols that aren't valid markdown (stray ? # ~ at start/end of lines with no context)
  cleaned = cleaned.replace(/^[\s]*[?~]{1,}[\s]*$/gm, '');
  
  // Remove "TT" artifacts that AI sometimes injects
  cleaned = cleaned.replace(/\bTT\b/g, '');
  
  // Remove stray backtick artifacts
  cleaned = cleaned.replace(/^[\s]*`{1,3}[\s]*$/gm, '');
  
  // Clean up excessive blank lines (more than 2 consecutive)
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
  
  // Remove zero-width characters and other invisible garbage
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
  
  // Remove stray isolated special chars that make no sense in prose
  cleaned = cleaned.replace(/(?<=[\s\n])([?#~*]{1,2})(?=[\s\n])/g, '');
  
  return cleaned;
};

// --- SYSTEM INSTRUCTION ---
const EBOOK_CREATOR_SYSTEM_INSTRUCTION = `
You are a Professional Ebook Creator AI. You are writing and formatting a high-quality ebook based on the provided topic and target audience.
You must strictly follow ALL rules below without exception.

=== ABSOLUTE TEXT QUALITY RULES (HIGHEST PRIORITY) ===

1. **ZERO GARBAGE CHARACTERS**: You are STRICTLY FORBIDDEN from outputting any random, stray, or decorative symbols in the text. This includes but is not limited to: ??, ##, ~~, **, ##~~, TT, @@, $$, %%, ^^, or ANY combination of special characters that is not valid English/Hindi punctuation or standard markdown formatting. Every single character you output must serve a purpose in the readable text.

2. **NO PAGE NUMBERS**: Do NOT write "Page 1", "Page 2", "Page 3", etc. anywhere in the output. Page numbering is handled by the layout software. This is an absolute rule with zero exceptions.

3. **CLEAN MARKDOWN ONLY**: The only markdown you may use is:
   - **bold text** (double asterisks)
   - Headings with # ## ###
   - Lists with - or 1. 2. 3.
   - [SECTION MARKERS] in square brackets
   - <<IMAGE_PROMPT>> tags
   Do NOT use any other special formatting, decorative separators, or symbol art.

4. **PROOFREAD BEFORE OUTPUT**: Before outputting any line, mentally verify it contains ZERO stray symbols. If a line would contain ?, #, ~, *, @, $ by themselves without being part of a word or valid formatting — DO NOT OUTPUT THAT LINE.

=== CONTENT QUALITY RULES ===

5. **Deep & High-Value Content**: Do not write surface-level or extremely short chapters. Expand on every concept with practical real-life examples, case studies, or actionable steps relevant to the book's specific topic. Each chapter must be substantial (minimum 800-1000 words).

6. **Clean Table of Contents**: Generate a perfectly formatted Table of Contents. Format MUST be:
   - Introduction
   - Chapter 1: [Clear Title]
   - Chapter 2: [Clear Title]
   - ...
   - Conclusion
   No broken lines, no weird spacing, no extra punctuation around numbers. Simple and clean.

7. **Adaptive Tone**: Keep the tone perfectly aligned with the book's genre and target audience.

8. **Token Limit Handling**: Do not stop mid-sentence. If the content is too long, complete the current section and write '[Type Continue for the rest]' at the end.

=== IMAGE PROMPT RULES (CRITICAL) ===

When you write <<IMAGE_PROMPT>> tags, you MUST follow these rules:

9. **CHAPTER-SPECIFIC IMAGES**: Every image prompt MUST directly describe a visual scene that represents the SPECIFIC content of that chapter. The image must visually explain or illustrate the key concept of the chapter it belongs to.
   - For a chapter about "Morning Meditation": describe a person sitting peacefully in morning light, eyes closed, in a calm room.
   - For a chapter about "Financial Planning": describe a clean desk with organized papers, a plant, coffee cup, symbolizing organized planning.
   - NEVER generate a generic or random image. The image MUST make sense if someone reads the chapter and then sees the image.

10. **ZERO TEXT IN IMAGES**: Absolutely no letters, words, numbers, labels, or symbols should appear in the image. The image must be 100% text-free.

11. **REALISTIC STYLE**: All images must be grounded in realism, minimal art, nature, or calming everyday settings. NO sci-fi, NO cyberpunk, NO futuristic technology, NO glowing wires, NO dramatic action scenes.

12. **IMAGE PROMPT FORMAT**: Use this exact format:
    <<IMAGE_PROMPT: TYPE: CHAPTER_CONTEXT: [chapter title or topic] | SCENE: [detailed visual description of a realistic scene that illustrates this specific chapter's content, including setting, objects, colors, mood, lighting]>>
    
    Types: COVER, AUTHOR, ILLUSTRATION
    
    Example for a chapter about stress relief:
    <<IMAGE_PROMPT: ILLUSTRATION: CHAPTER_CONTEXT: Managing Daily Stress | SCENE: A serene living room bathed in warm golden sunset light, a comfortable armchair near a window with sheer curtains gently blowing, a cup of herbal tea on a side table, a small green plant, soft neutral color palette, peaceful and calming atmosphere, no people, photorealistic style>>

=== PAGING STRUCTURE ===
- [EBOOK TITLE] -> Cover Page.
- [TABLE OF CONTENTS] -> Must be on its own page.
- [AUTHOR PAGE] -> Must be on its own page.
- [INTRODUCTION] -> Must be on its own page.
- [CHAPTER X] -> Start every chapter on a NEW page.
- [CONCLUSION] -> Must be on its own page.

=== EBOOK STRUCTURE TEMPLATE ===

[EBOOK TITLE]
Subtitle
By [Author Name]
<<IMAGE_PROMPT: COVER: CHAPTER_CONTEXT: Book Cover | SCENE: [Premium 3D book mockup scene relevant to the book's topic, clean professional setting, studio lighting]>>

[TABLE OF CONTENTS]
- Introduction
- Chapter 1: [Title]
- ...
- Conclusion

[AUTHOR PAGE]
About the Author
(Content...)
<<IMAGE_PROMPT: AUTHOR: CHAPTER_CONTEXT: Author Portrait | SCENE: [Professional headshot description, soft studio lighting, neutral background]>>

[INTRODUCTION]
(Content...)

CHAPTER 1 - Title
<<IMAGE_PROMPT: ILLUSTRATION: CHAPTER_CONTEXT: [Chapter 1 Title] | SCENE: [Detailed scene that visually explains this specific chapter's content]>>
(Content...)

... (Continue for all chapters) ...

[CONCLUSION]
Final Summary
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
        
        CRITICAL REMINDERS:
        1. Keep the same structure ([EBOOK TITLE], [TABLE OF CONTENTS], etc).
        2. Apply the user's change strictly.
        3. Output the WHOLE book again.
        4. DO NOT output any garbage characters, stray symbols, or page numbers.
        5. Every <<IMAGE_PROMPT>> must include CHAPTER_CONTEXT and SCENE tags.
        6. Images must visually represent the specific chapter they belong to.
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
        1. Cover Page (Title + TOPIC-RELEVANT Cover Image)
        2. Table of Contents (ONE PAGE ONLY, clean formatting, no extra symbols)
        3. Author Page (ONE PAGE ONLY)
        4. Introduction (ONE PAGE ONLY)
        5. Minimum 5 Chapters (800-1000 words each, DETAILED with real examples)
        6. Conclusion
        7. Visuals: Each chapter MUST have an <<IMAGE_PROMPT>> that SPECIFICALLY illustrates that chapter's content. The image must visually explain what the chapter is about.
        
        CRITICAL REMINDERS:
        - DO NOT output garbage characters like ??, ##, ~~, **, TT, or any stray symbols.
        - DO NOT write "Page 1", "Page 2", etc.
        - Every image prompt MUST contain CHAPTER_CONTEXT and SCENE tags.
        - Each image must be a realistic visual representation of that specific chapter's topic.
        
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
          // Sanitize each chunk to remove garbage characters in real-time
          const cleanedText = sanitizeContent(chunk.text);
          if (cleanedText.trim().length > 0 || chunk.text.includes('\n')) {
            onChunk(cleanedText);
          }
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

// Extract CHAPTER_CONTEXT and SCENE from enhanced image prompts
const parseImagePrompt = (rawPrompt: string): { type: string; chapterContext: string; scene: string; raw: string } => {
  const typeMatch = rawPrompt.match(/^\s*(COVER|AUTHOR|ILLUSTRATION|DIAGRAM)\s*:/i);
  const contextMatch = rawPrompt.match(/CHAPTER_CONTEXT:\s*([^|]+)/i);
  const sceneMatch = rawPrompt.match(/SCENE:\s*(.+)/i);
  
  return {
    type: typeMatch ? typeMatch[1].toUpperCase() : 'ILLUSTRATION',
    chapterContext: contextMatch ? contextMatch[1].trim() : '',
    scene: sceneMatch ? sceneMatch[1].trim() : rawPrompt.replace(/^\s*(COVER|AUTHOR|ILLUSTRATION|DIAGRAM)\s*:/i, '').trim(),
    raw: rawPrompt
  };
};

// Build a high-quality, chapter-aware image prompt
const buildImagePrompt = (parsed: { type: string; chapterContext: string; scene: string; raw: string }): string => {
  const { type, chapterContext, scene } = parsed;
  
  // Common quality suffix for all images
  const qualitySuffix = 'absolutely no text, no letters, no words, no numbers, no labels, no symbols, no watermarks in the image';
  
  if (type === 'COVER') {
    const contextPart = chapterContext ? `, theme related to ${chapterContext}` : '';
    return `Professional 3D book cover mockup, standing upright on a clean surface, premium studio lighting, high detail, 8k resolution, photorealistic${contextPart}. ${scene}. ${qualitySuffix}`;
  }
  
  if (type === 'AUTHOR') {
    return `Professional headshot portrait, high-end studio photography, soft lighting, neutral background, sharp focus. ${scene}. ${qualitySuffix}`;
  }
  
  if (type === 'DIAGRAM') {
    return `Clean minimalist infographic illustration, professional flat design, white background, simple geometric shapes and pathways, blank template without any text or numbers. ${scene}. ${qualitySuffix}`;
  }
  
  // ILLUSTRATION (default) — chapter-specific
  const contextEnrichment = chapterContext 
    ? `This illustration must visually represent the concept of "${chapterContext}". ` 
    : '';
  
  return `Premium editorial illustration, ${contextEnrichment}realistic style, detailed composition, warm natural lighting, 4k resolution, professional quality. Scene: ${scene}. ${qualitySuffix}`;
};

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
        
        // Parse the structured image prompt and build a high-quality, context-aware prompt
        const parsed = parseImagePrompt(prompt);
        const finalPrompt = buildImagePrompt(parsed);
        
        console.log(`🎨 Image Gen [${parsed.type}] Context: "${parsed.chapterContext || 'none'}"`);
        console.log(`   Final prompt: ${finalPrompt.substring(0, 120)}...`);

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