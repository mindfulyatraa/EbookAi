import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Sparkles, Key, X, Check, FileText, Image, Settings } from 'lucide-react';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isSending: boolean;
  onOpenSettings: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isSending, onOpenSettings }) => {
  const [input, setInput] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isSending) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-brand-200 relative">
      
      {/* Header */}
      <div className="p-6 border-b border-brand-100 flex items-center justify-between bg-brand-50/50">
        <div className="flex items-center gap-3">
          <div className="bg-brand-800 p-2 rounded-lg text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-serif font-bold text-brand-900">Editor AI</h2>
            <p className="text-xs text-brand-600">Powered by Gemini</p>
          </div>
        </div>
        
        <button 
          onClick={onOpenSettings}
          className="p-2 text-brand-400 hover:text-brand-800 hover:bg-white rounded-lg transition-all shadow-sm border border-transparent hover:border-brand-100"
          title="AI Key Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-brand-50/30">
        {messages.length === 0 && (
           <div className="text-center py-10 px-4 text-brand-400 text-sm">
             <p>Hi! I'm your ebook consultant.</p>
             <p className="mt-2">I use <strong>Google Gemini</strong> for everything.</p>
             <p className="mt-4 text-xs">Tell me what you want to write about!</p>
           </div>
        )}
        
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex items-start gap-3 max-w-full ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.role === 'user' ? 'bg-brand-200 text-brand-800' : 'bg-brand-800 text-white'
            }`}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            
            <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed max-w-[85%] shadow-sm ${
              msg.role === 'user' 
                ? 'bg-white text-gray-800 rounded-tr-sm border border-brand-100' 
                : 'bg-white text-gray-800 rounded-tl-sm border border-brand-100'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isSending && (
           <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-800 text-white flex items-center justify-center flex-shrink-0">
                 <Bot className="w-4 h-4" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-sm border border-brand-100 shadow-sm flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 bg-brand-600 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-brand-600 rounded-full animate-bounce delay-75"></div>
                  <div className="w-1.5 h-1.5 bg-brand-600 rounded-full animate-bounce delay-150"></div>
                </div>
                <span className="text-[10px] text-brand-500 font-bold ml-1 tracking-tight animate-pulse">AI is thinking...</span>
              </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-brand-100">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your ebook idea..."
            className="flex-1 p-3 pr-12 bg-white border border-brand-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm text-black font-medium placeholder:text-brand-400 transition-all shadow-inner"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            className="absolute right-2 p-2 bg-brand-800 text-white rounded-lg hover:bg-brand-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};