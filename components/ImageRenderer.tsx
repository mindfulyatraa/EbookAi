import React, { useState, useEffect, useRef } from 'react';
import { generateEbookImage } from '../services/gemini';
import { Loader2, RefreshCw } from 'lucide-react';

interface ImageRendererProps {
  prompt: string;
  className?: string;
  variant?: 'default' | 'cover' | 'author';
}

export const ImageRenderer: React.FC<ImageRendererProps> = ({ prompt, className = "", variant = 'default' }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const hasFetched = useRef(false);

  const fetchImage = async () => {
    if (!prompt) return;
    setStatus('loading');
    try {
      const url = await generateEbookImage(prompt);
      setImageUrl(url);
      setStatus('success');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  useEffect(() => {
    if (prompt && !hasFetched.current) {
      hasFetched.current = true;
      fetchImage();
    }
  }, [prompt]);

  // Determine base styles based on variant
  let baseStyles = 'overflow-hidden transition-all duration-300';
  let placeholderStyles = 'bg-brand-100 border border-brand-200 text-brand-800';
  
  if (variant === 'author') {
    baseStyles += ' aspect-square rounded-full w-48 h-48 mx-auto shadow-xl border-4 border-white';
  } else if (variant === 'cover') {
    baseStyles += ' w-full rounded-sm shadow-2xl aspect-[2/3] md:aspect-[16/9]';
  } else {
    baseStyles += ' w-full rounded-lg aspect-video shadow-md my-8';
  }

  const containerClasses = `${baseStyles} ${className}`;

  if (status === 'loading') {
    return (
      <div className={`${containerClasses} ${placeholderStyles} flex flex-col items-center justify-center animate-pulse`}>
        <Loader2 className="w-8 h-8 animate-spin mb-2 text-brand-600" />
        {variant !== 'author' && <span className="text-xs font-medium font-serif opacity-75">Visualizing...</span>}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={`${containerClasses} bg-red-50 flex flex-col items-center justify-center text-red-500 border border-red-200`}>
        <p className="text-xs font-medium mb-2">Image Error</p>
        <button 
          onClick={fetchImage}
          className="p-1 bg-white border border-red-200 rounded-full hover:bg-red-50 transition-colors shadow-sm"
          title="Retry"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (status === 'success' && imageUrl) {
    return (
      <div className={`${containerClasses} relative group`}>
        <img 
          src={imageUrl} 
          alt={prompt} 
          className="w-full h-full object-cover" 
        />
        {variant !== 'author' && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
            <p className="text-white text-xs font-light truncate w-full">{prompt}</p>
          </div>
        )}
      </div>
    );
  }

  return null;
};
