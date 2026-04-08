import React, { useMemo, useRef, useState } from 'react';
import { ImageRenderer } from './ImageRenderer';
import { Download, BookOpen, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface EbookReaderProps {
  content: string;
  isGenerating: boolean;
  topic?: string;
}

// Helper to determine block type based on content markers
const getBlockType = (line: string): string => {
  if (line.match(/<<IMAGE_PROMPT:\s*(.*?)>>/)) return 'image';
  if (line.includes('[EBOOK TITLE]')) return 'title';
  if (line.includes('[TABLE OF CONTENTS]')) return 'toc_header';
  if (line.includes('[AUTHOR PAGE]')) return 'author_header';
  if (line.includes('[INTRODUCTION]')) return 'intro_header';
  if (line.includes('[CONCLUSION]')) return 'conclusion_header';
  if (line.startsWith('CHAPTER') || line.startsWith('## ')) return 'chapter_header';
  return 'text';
};

// Parse content into logical sections for Page Breaking and PDF generation
const parseContentToSections = (text: string) => {
  const lines = text.split('\n');
  const sections: { type: string; blocks: any[] }[] = [];
  let currentBlocks: any[] = [];
  let currentSectionType = 'front_matter';

  const startNewSection = (type: string) => {
    // Only push if there is actual content in the previous block to avoid blanks
    const hasContent = currentBlocks.some(b => b.content && b.content.trim().length > 0);
    if (currentBlocks.length > 0 && hasContent) {
      sections.push({ type: currentSectionType, blocks: [...currentBlocks] });
    }
    currentBlocks = [];
    currentSectionType = type;
  };

  let currentTextBlock = '';

  const flushText = (idSuffix: string) => {
    if (currentTextBlock.trim()) {
      currentBlocks.push({ type: 'text', content: currentTextBlock, id: `txt-${idSuffix}` });
      currentTextBlock = '';
    }
  };

  lines.forEach((line, index) => {
    const type = getBlockType(line);

    // Major Headers trigger a new section (New Page in PDF)
    if (type === 'title') {
      flushText(`${index}-prev`);
      startNewSection('title_page');
      currentBlocks.push({ type: 'title', content: line.replace('[EBOOK TITLE]', '').trim(), id: `title-${index}` });
    } else if (type === 'toc_header') {
      flushText(`${index}-prev`);
      startNewSection('toc_page');
      currentBlocks.push({ type: 'header_main', content: "Table of Contents", id: `toc-${index}` });
    } else if (type === 'author_header') {
      flushText(`${index}-prev`);
      startNewSection('author_page');
      currentBlocks.push({ type: 'header_main', content: "About the Author", id: `auth-${index}` });
    } else if (type === 'intro_header') {
      flushText(`${index}-prev`);
      startNewSection('intro_page');
      currentBlocks.push({ type: 'header_main', content: "Introduction", id: `intro-${index}` });
    } else if (type === 'conclusion_header') {
      flushText(`${index}-prev`);
      startNewSection('conclusion_page');
      currentBlocks.push({ type: 'header_main', content: "Conclusion", id: `conc-${index}` });
    } else if (type === 'chapter_header') {
      flushText(`${index}-prev`);
      startNewSection('chapter_page');
      const title = line.replace('## ', '').replace(/\*\*/g, '').trim(); 
      currentBlocks.push({ type: 'header_chapter', content: title, id: `chap-${index}` });
    } else if (type === 'image') {
      flushText(`${index}-prev`);
      const match = line.match(/<<IMAGE_PROMPT:\s*(.*?)>>/);
      if (match) {
        currentBlocks.push({ type: 'image', content: match[1], id: `img-${index}` });
      }
    } else {
      currentTextBlock += line + '\n';
    }
  });

  flushText('end');
  
  // Push final section
  const hasContent = currentBlocks.some(b => b.content && b.content.trim().length > 0);
  if (currentBlocks.length > 0 && hasContent) {
    sections.push({ type: currentSectionType, blocks: [...currentBlocks] });
  }

  return sections;
};

export const EbookReader: React.FC<EbookReaderProps> = ({ content, isGenerating, topic }) => {
  const sections = useMemo(() => parseContentToSections(content), [content]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const renderLineWithBold = (line: string) => {
    if (!line.includes('**')) return line;
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return <strong key={idx} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const renderText = (text: string, isTableOfContents: boolean = false, isAuthorPage: boolean = false, isCoverPage: boolean = false) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      if (line.trim().length === 0) {
        return <div key={i} className={isTableOfContents ? "h-1" : "h-4"} />;
      }
      
      if (line.trim().startsWith('Subtitle')) {
        return <p key={i} className="text-xl md:text-2xl text-slate-500 italic text-center mb-8">{line.replace('Subtitle', '').trim()}</p>;
      }

      if (isCoverPage && line.trim().startsWith('By ')) {
        return <p key={i} className="text-lg md:text-xl text-brand-800 font-bold tracking-widest uppercase mt-4 mb-8">{line.trim()}</p>;
      }

      if (line.trim().startsWith('- ') || line.trim().match(/^\d+\./)) {
        const cleanContent = line.replace(/^- /, '').replace(/^\d+\.\s*/, '');
        
        if (isTableOfContents) {
           return (
              <div key={i} className="group flex items-baseline w-full py-2 hover:bg-slate-50 px-2 rounded-lg transition-colors cursor-default">
                  <span className="text-base md:text-lg font-display text-slate-900 font-semibold whitespace-nowrap group-hover:text-brand-700 transition-colors">
                      {renderLineWithBold(cleanContent)}
                  </span>
                  <span className="flex-1 mx-4 border-b border-slate-200 relative -top-1.5 group-hover:border-brand-200 transition-colors"></span>
                  <span className="text-sm font-mono text-slate-400 group-hover:text-brand-500 transition-colors">
                    {i + 1 < 10 ? `0${i + 1}` : i + 1}
                  </span>
              </div>
           );
        }

        const listClasses = 'ml-6 list-disc pl-2 mb-2 text-base';
        return <li key={i} className={`${listClasses} text-slate-800`}>{renderLineWithBold(cleanContent)}</li>;
      }
      
      if (line.startsWith('### ')) {
        return <h3 key={i} className="text-xl font-bold mt-6 mb-3 text-slate-800">{renderLineWithBold(line.replace('### ', ''))}</h3>;
      }

      const pClasses = isAuthorPage 
        ? "mb-6 leading-relaxed text-slate-800 text-lg text-center max-w-2xl mx-auto italic font-medium" 
        : `mb-4 leading-relaxed text-slate-900 text-lg`;

      return <p key={i} className={pClasses}>{renderLineWithBold(line)}</p>;
    });
  };

  const getStatusMessage = () => {
    if (!isGenerating) return null;
    if (sections.length === 0) return "Initializing AI Writer...";
    const lastSection = sections[sections.length - 1];
    const chapterCount = sections.filter(s => s.type === 'chapter_page').length;
    
    switch (lastSection.type) {
      case 'title_page': return "Designing a premium cover...";
      case 'toc_page': return "Structuring the table of contents...";
      case 'author_page': return "Drafting the author profile...";
      case 'intro_page': return "Writing the opening introduction...";
      case 'chapter_page': return `Writing Chapter ${chapterCount}...`;
      case 'conclusion_page': return "Wrapping up with the conclusion...";
      default: return "Polishing the final manuscript...";
    }
  };

  const getProgress = () => {
    if (!isGenerating) return 0;
    if (sections.length === 0) return 5;
    const lastSection = sections[sections.length - 1];
    const chapterCount = sections.filter(s => s.type === 'chapter_page').length;
    
    switch (lastSection.type) {
      case 'title_page': return 15;
      case 'toc_page': return 25;
      case 'author_page': return 35;
      case 'intro_page': return 45;
      case 'chapter_page': return Math.min(45 + (chapterCount * 8), 90);
      case 'conclusion_page': return 95;
      default: return 98;
    }
  };

  const handleDownloadPDF = async () => {
    if (!containerRef.current) return;
    setIsDownloading(true);

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210; 
      const pdfHeight = 297;
      const marginMm = 20;
      
      // Create a hidden staging element for measuring and capturing
      const staging = document.createElement('div');
      staging.className = 'pdf-staging bg-white text-slate-900 font-body'; 
      staging.style.width = `${pdfWidth}mm`;
      staging.style.height = `${pdfHeight}mm`; // Fixed page height
      staging.style.padding = `${marginMm}mm`;
      staging.style.paddingBottom = '25mm'; // Reserve space for footer
      staging.style.position = 'fixed'; // Remove from flow
      staging.style.left = '-10000px';
      staging.style.top = '0';
      staging.style.boxSizing = 'border-box';
      staging.style.overflow = 'hidden';
      document.body.appendChild(staging);

      let globalPageIndex = 0;

      const captureAndAddPage = async () => {
         const canvas = await html2canvas(staging, { 
             scale: 2, 
             useCORS: true,
             logging: false
         });
         const imgData = canvas.toDataURL('image/jpeg', 0.95);
         
         if (globalPageIndex > 0) pdf.addPage();
         pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
         
         // Add Page Number (Skip for Title Page which is usually index 0)
         if (globalPageIndex > 0) {
             pdf.setFontSize(9);
             pdf.setTextColor(150, 150, 150);
             pdf.text(`Page ${globalPageIndex + 1}`, pdfWidth / 2, 285, { align: 'center' });
         }

         globalPageIndex++;
      };

      const hasOverflow = () => {
          return staging.scrollHeight > staging.clientHeight;
      };

      const sections = Array.from(containerRef.current.querySelectorAll('.pdf-section'));
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i] as HTMLElement;
        const type = section.dataset.type || '';
        const isSinglePage = ['title_page', 'toc_page', 'author_page', 'intro_page', 'conclusion_page'].includes(type);
        
        // Clone children but ignore the React-view footer
        const children = Array.from(section.children).filter(c => !c.classList.contains('pdf-footer'));
        
        if (isSinglePage) {
             staging.innerHTML = '';
             children.forEach(c => staging.appendChild(c.cloneNode(true)));
             await captureAndAddPage();
             continue;
        }

        // Multi-page content (Chapters)
        staging.innerHTML = ''; 
        
        for (let j = 0; j < children.length; j++) {
            const child = children[j].cloneNode(true) as HTMLElement;
            staging.appendChild(child);

            if (hasOverflow()) {
                staging.removeChild(child);
                
                if (staging.children.length === 0) {
                     // If a single item is too big, force it (it will be clipped)
                     staging.appendChild(child); 
                     await captureAndAddPage();
                     staging.innerHTML = '';
                } else {
                     // Capture current page
                     await captureAndAddPage();
                     // Prepare next page
                     staging.innerHTML = '';
                     staging.appendChild(child);
                }
            }
        }
        
        // Capture remaining content
        if (staging.children.length > 0) {
            await captureAndAddPage();
        }
      }

      document.body.removeChild(staging);
      pdf.save(`${topic || 'ebook'}.pdf`);

    } catch (error: any) {
      console.error("PDF Generation failed", error);
      const isQuotaError = error?.message?.includes('429') || error?.message?.includes('quota');
      const isPermissionError = error?.message?.includes('403') || error?.message?.includes('permission');
      
      let errorMsg = "Could not generate PDF. Please try again.";
      if (isQuotaError) errorMsg = "API Quota exceeded. Please wait a minute and try again.";
      if (isPermissionError) errorMsg = "API Key permission error. Please check your Gemini API key.";
      
      alert(errorMsg);
    } finally {
      setIsDownloading(false);
    }
  };
  
  let imageCount = 0;

  if (!content && !isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white text-slate-400 p-8 text-center border-l border-brand-200 select-none">
        <BookOpen className="w-20 h-20 mb-6 opacity-30 text-slate-900" />
        <h3 className="text-2xl font-serif font-bold mb-3 text-slate-800">Ebook Preview</h3>
        <p className="max-w-xs text-base text-slate-600">Your professional ebook will appear here.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 border-l border-brand-200">
      <div className="h-16 bg-white border-b border-brand-200 flex items-center justify-between px-6 sticky top-0 z-20 shadow-sm print-hide select-none">
        <span className="font-serif font-bold text-slate-900 truncate max-w-[50%] text-lg">
          {topic || "Untitled Ebook"}
        </span>
        <div className="flex items-center gap-3">
             {isGenerating && (
                <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2 text-brand-700 text-[10px] font-bold tracking-wider uppercase">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {getStatusMessage()}
                    </div>
                    <div className="w-32 h-1 bg-brand-100 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-brand-600 transition-all duration-500 ease-out" 
                            style={{ width: `${getProgress()}%` }}
                        />
                    </div>
                </div>
            )}
            <button 
                onClick={handleDownloadPDF}
                disabled={content.length < 100 || isDownloading}
                className="flex items-center gap-2 px-4 py-2 bg-brand-800 text-white rounded-lg hover:bg-brand-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold text-sm shadow-md"
                title="Download PDF"
            >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Creating PDF...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Download PDF
                  </>
                )}
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth bg-slate-100/50 selection:bg-yellow-200 selection:text-brand-900">
        <div ref={containerRef} className="max-w-[210mm] mx-auto">
          {sections.map((section, secIdx) => {
            const isCoverPage = section.type === 'title_page';
            const isTOC = section.type === 'toc_page';
            const isAuthorPage = section.type === 'author_page';
            const isSinglePage = ['title_page', 'toc_page', 'author_page', 'intro_page', 'conclusion_page'].includes(section.type);
            
            // Visual height for web preview
            const heightClass = isSinglePage ? 'h-[297mm] overflow-hidden' : 'min-h-[297mm]';
            
            return (
            <div 
              key={secIdx} 
              data-type={section.type}
              className={`pdf-section bg-white shadow-sm p-[20mm] rounded-sm text-slate-900 mb-8 ${heightClass} flex flex-col cursor-text relative ${isCoverPage || isAuthorPage ? 'justify-center items-center text-center' : ''}`}
            >
              {section.blocks.map((block) => {
                if (block.type === 'title') {
                  return (
                    <div key={block.id} className="text-center w-full">
                       <h1 className="text-5xl md:text-7xl font-display font-black text-slate-900 mb-8 tracking-tight leading-tight uppercase">
                        {block.content}
                      </h1>
                      <div className="w-32 h-2 bg-brand-600 mx-auto mb-10"></div>
                    </div>
                  );
                }

                if (block.type === 'header_main') {
                    return (
                        <div key={block.id} className="mb-6 border-b-4 border-slate-100 pb-4 w-full text-left">
                            <h2 className="text-4xl font-display font-bold text-slate-900">{block.content}</h2>
                        </div>
                    );
                }

                if (block.type === 'header_chapter') {
                    return (
                        <div key={block.id} className="mb-8 pt-4 w-full text-left">
                            <span className="text-brand-600 font-bold tracking-widest text-sm uppercase block mb-2">Chapter</span>
                            <h2 className="text-4xl font-display font-bold text-slate-900 leading-tight">{block.content}</h2>
                        </div>
                    );
                }
                
                if (block.type === 'image') {
                  imageCount++;
                  const isCover = imageCount === 1;
                  const imageVariant = isAuthorPage ? 'author' : (isCover ? 'cover' : 'default');
                  
                  return (
                    <div key={block.id} className={`${isAuthorPage ? 'w-full mb-8 flex items-center justify-center' : (isCover ? 'w-full my-8 flex-1 flex items-center justify-center' : 'my-6')}`}>
                       <ImageRenderer 
                        prompt={block.content} 
                        variant={imageVariant}
                       />
                    </div>
                  );
                }

                if (block.type === 'text') {
                  return (
                    <div key={block.id} className={`prose prose-slate font-body text-slate-900 max-w-none w-full ${isTOC ? 'prose-lg leading-snug' : 'prose-lg'}`}>
                        {renderText(block.content, isTOC, isAuthorPage, isCoverPage)}
                    </div>
                  );
                }
                return null;
              })}
              
              {/* Footer for React Preview - Will be filtered out in PDF gen */}
              {!isCoverPage && (
                 <div className="pdf-footer absolute bottom-6 left-0 w-full text-center text-slate-300 text-xs select-none">
                    Page {secIdx + 1}
                 </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};