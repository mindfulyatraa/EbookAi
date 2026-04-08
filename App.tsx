import React, { useState, useEffect, useRef } from 'react';
import { streamEbookContent, createConsultantChat } from './services/gemini';
import { EbookReader } from './components/EbookReader';
import { ChatInterface } from './components/ChatInterface';
import { Chat } from "@google/genai";
import { SettingsModal } from './components/SettingsModal';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const App = () => {
  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  
  // Ebook State
  const [ebookContent, setEbookContent] = useState('');
  const [isGeneratingEbook, setIsGeneratingEbook] = useState(false);
  const [currentTopic, setCurrentTopic] = useState('');
  const [currentAuthor, setCurrentAuthor] = useState('');

  // UI State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Gemini Chat Instance Ref
  const chatSessionRef = useRef<Chat | null>(null);

  // Initialize Chat Session on Mount
  useEffect(() => {
    if (!chatSessionRef.current) {
      chatSessionRef.current = createConsultantChat();
    }
  }, []);

  const handleSendMessage = async (text: string) => {
    if (!chatSessionRef.current) return;

    // Optimistic Update
    setMessages(prev => [...prev, { role: 'user', text }]);
    setIsSending(true);

    try {
      // Send to Gemini
      const response = await chatSessionRef.current.sendMessage({ message: text });
      
      // Handle Function Calls (Trigger Ebook Generation or Editing)
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        
        if (call.name === 'generate_ebook') {
          const args = call.args as any;
          const { topic, details, language, authorName, section } = args;
          
          const selectedLang = language || "English";
          const selectedAuthor = authorName || "Unknown Author";

          setCurrentTopic(topic);
          setCurrentAuthor(selectedAuthor);
          
          const statusText = section 
            ? `Generating ${section} for "${topic}"...`
            : `Starting your ${selectedLang} ebook on "${topic}" by ${selectedAuthor}...`;

          setMessages(prev => [...prev, { 
            role: 'model', 
            text: statusText 
          }]);
          
          setIsGeneratingEbook(true);
          
          // If it's a specific chapter/section (not front matter), we append.
          // If it's front matter or a full book, we clear.
          const isAppending = section && section.toLowerCase() !== 'front matter';
          if (!isAppending) {
            setEbookContent(''); 
          } else {
            setEbookContent(prev => prev + "\n\n"); // Add spacing before new section
          }

          // Start Streaming Ebook
          await streamEbookContent(topic, details, selectedLang, selectedAuthor, (chunk) => {
            setEbookContent(prev => prev + chunk);
          }, undefined, section);
          
          setIsGeneratingEbook(false);
          setMessages(prev => [...prev, { 
            role: 'model', 
            text: section 
              ? `${section} complete! What's next?` 
              : "Done! You can now download the complete PDF with visuals." 
          }]);
        }
        else if (call.name === 'edit_ebook') {
            const args = call.args as any;
            const { instruction } = args;
            
            if (!ebookContent) {
                setMessages(prev => [...prev, { 
                    role: 'model', 
                    text: "I can't edit an ebook that hasn't been created yet. What would you like to write about first?" 
                }]);
                setIsSending(false);
                return;
            }

            setMessages(prev => [...prev, { 
                role: 'model', 
                text: `Updating the ebook: "${instruction}"...` 
            }]);
            
            setIsGeneratingEbook(true);
            const prevContent = ebookContent;
            setEbookContent(''); // Clear for rewrite

            // Stream Edited Ebook
            await streamEbookContent(
                currentTopic, 
                instruction, 
                "English", 
                currentAuthor, // Pass existing author
                (chunk) => {
                   setEbookContent(prev => prev + chunk);
                },
                prevContent // Pass existing content for context
            );
            
            setIsGeneratingEbook(false);
             setMessages(prev => [...prev, { 
                role: 'model', 
                text: "Updates applied!" 
            }]);
        }

      } else {
        // Standard Text Response
        const responseText = response.text || "I didn't quite catch that.";
        setMessages(prev => [...prev, { role: 'model', text: responseText }]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "I encountered an error. Please try again or check your API Keys in Settings." }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-brand-50">
      {/* Left Panel: Chat Interface */}
      <div className={`w-full md:w-[35%] lg:w-[30%] h-full flex flex-col z-10 shadow-xl ${isGeneratingEbook || ebookContent ? 'hidden md:flex' : 'flex'}`}>
        <ChatInterface 
          messages={messages} 
          onSendMessage={handleSendMessage}
          isSending={isSending}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </div>

      {/* Right Panel: Ebook Preview */}
      <div className={`w-full md:w-[65%] lg:w-[70%] h-full relative ${!isGeneratingEbook && !ebookContent ? 'hidden md:block' : 'block'}`}>
        <EbookReader 
          content={ebookContent} 
          isGenerating={isGeneratingEbook}
          topic={currentTopic}
        />
      </div>

      {/* Modals */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
};

export default App;