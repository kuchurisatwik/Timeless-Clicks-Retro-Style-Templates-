import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GoogleGenerativeAI } from '@google/generative-ai';
import html2canvas from 'html2canvas';

// Prioritized fallback model list — tried in order when the primary model hits a 429 rate limit
const FALLBACK_MODELS = [
  'gemini-3.0-flash',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

const EditorPage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedElementRef = useRef<HTMLElement | null>(null);
  
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [zoom, setZoom] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      return Math.max(0.2, (window.innerWidth - 32) / 794); // fit width with small padding
    }
    return 0.6;
  });

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Undo/Redo State
  interface EditorState {
    bodyHtml: string;
    cssText: string;
  }
  const historyRef = useRef<EditorState[]>([]);
  const historyIndexRef = useRef(-1);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [apiModel, setApiModel] = useState(() => localStorage.getItem('gemini_model') || 'gemini-2.5-flash');
  const [recentPrompts, setRecentPrompts] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('recent_prompts') || '[]'); } catch { return []; }
  });
  const [showPromptsPopup, setShowPromptsPopup] = useState(false);
  const [selectedFontSize, setSelectedFontSize] = useState<number | null>(null);
  const [selectedFontColor, setSelectedFontColor] = useState<string>('#000000');

  const zoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
  const zoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.2));
  const zoomReset = () => setZoom(0.6);

  const updateUndoRedoUI = () => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };

  const saveTemplateToServer = () => {
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = window.setTimeout(() => {
      const iframeDoc = iframeRef.current?.contentDocument;
      if (!iframeDoc) return;
      const clone = iframeDoc.cloneNode(true) as Document;
      const editorStyles = clone.getElementById('editor-styles');
      if (editorStyles) editorStyles.remove();
      const editableElements = clone.querySelectorAll('[data-editable="text"]');
      editableElements.forEach(el => {
        el.removeAttribute('contenteditable');
        (el as HTMLElement).style.outline = '';
        el.classList.remove('editor-selected');
      });
      const editableImages = clone.querySelectorAll('[data-editable="image"], img');
      editableImages.forEach(el => {
        el.classList.remove('editor-selected');
      });
      const htmlContent = "<!DOCTYPE html>\\n" + clone.documentElement.outerHTML;
      fetch('/api/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, html: htmlContent })
      }).catch(e => console.error("Auto-save failed", e));
    }, 1000);
  };

  const saveState = () => {
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc || !iframeDoc.body) return;

    if (selectedElementRef.current) {
      selectedElementRef.current.classList.remove('editor-selected');
    }

    const state: EditorState = {
      bodyHtml: iframeDoc.body.innerHTML,
      cssText: iframeDoc.documentElement.style.cssText
    };

    if (selectedElementRef.current) {
      selectedElementRef.current.classList.add('editor-selected');
    }

    const currentIndex = historyIndexRef.current;
    if (currentIndex >= 0 && currentIndex < historyRef.current.length) {
      const currentState = historyRef.current[currentIndex];
      if (currentState.bodyHtml === state.bodyHtml && currentState.cssText === state.cssText) {
        return; // No change
      }
    }

    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(state);
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    
    updateUndoRedoUI();
    saveTemplateToServer();
  };

  const applyState = (state: EditorState) => {
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc) return;
    
    selectedElementRef.current = null;
    iframeDoc.body.innerHTML = state.bodyHtml;
    iframeDoc.documentElement.style.cssText = state.cssText;

    setupIframeNodeInteractivity(iframeDoc);
  };

  const undo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      applyState(historyRef.current[historyIndexRef.current]);
      updateUndoRedoUI();
    }
  };

  const redo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      applyState(historyRef.current[historyIndexRef.current]);
      updateUndoRedoUI();
    }
  };

  const setupIframeNodeInteractivity = (iframeDoc: Document) => {
    const textElements = iframeDoc.querySelectorAll('[data-editable="text"]');
    textElements.forEach((el) => {
      (el as HTMLElement).contentEditable = 'true';
      (el as HTMLElement).style.outline = 'none';
      
      // We must handle blur using a bound function that calls the latest saveState
      el.addEventListener('blur', () => {
        saveState();
      });
    });

    const internalInputs = iframeDoc.querySelectorAll('.image-file-input');
    internalInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const inputTarget = e.target as HTMLInputElement;
        const file = inputTarget.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          const container = inputTarget.closest('[data-editable="image"]');
          if (container) {
            const previewEl = container.querySelector('img, .image-preview') as HTMLElement;
            if (previewEl) {
              if (previewEl.tagName === 'IMG') {
                (previewEl as HTMLImageElement).src = dataUrl;
              } else {
                previewEl.style.backgroundImage = `url("${dataUrl}")`;
              }
              previewEl.style.filter = 'none';
              previewEl.style.mixBlendMode = 'normal';
              previewEl.style.opacity = '1';
            }
            // Also reset on the container just in case the filter is applied there
            (container as HTMLElement).style.filter = 'none';
            (container as HTMLElement).style.mixBlendMode = 'normal';
            
            const placeholder = container.querySelector('.placeholder-state');
            if (placeholder) (placeholder as HTMLElement).style.display = 'none';
            saveState();
          }
        };
        reader.readAsDataURL(file);
      });
    });
  };

  // Setup Iframe Interactivity
  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    const iframeDoc = iframe.contentDocument;

    // Inject styles for selected element highlighting
    if (!iframeDoc.getElementById('editor-styles')) {
      const style = iframeDoc.createElement('style');
      style.id = 'editor-styles';
      style.innerHTML = `
        .editor-selected {
          outline: 3px solid #3b82f6 !important;
          outline-offset: -3px;
          cursor: text;
        }
        img.editor-selected {
          outline-offset: 2px;
          cursor: pointer;
        }
        [data-editable="text"] {
          min-width: 0;
          word-break: break-word;
        }
        div[class*="-col"], div[class*="-section"], div[class*="-row"] {
          min-width: 0;
        }
      `;
      iframeDoc.head.appendChild(style);
    }

    // Handle clicks to select elements
    iframeDoc.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Only prevent default for links to avoid navigating away
      if (target.closest('a')) {
        e.preventDefault();
      }

      // Remove previous selection
      if (selectedElementRef.current) {
        selectedElementRef.current.classList.remove('editor-selected');
      }

      // Find if they clicked an editable text block or an image
      const textBlock = target.closest('[data-editable="text"]');
      const imageContainer = target.closest('[data-editable="image"]');
      const isImage = target.tagName === 'IMG';

      if (textBlock) {
        textBlock.classList.add('editor-selected');
        selectedElementRef.current = textBlock as HTMLElement;
        const computed = iframeDoc.defaultView?.getComputedStyle(textBlock);
        if (computed?.fontSize) {
          setSelectedFontSize(parseFloat(computed.fontSize));
        }
        if (computed?.color) {
          const rgb = computed.color.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            const hex = '#' + rgb.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
            setSelectedFontColor(hex);
          }
        }
      } else if (imageContainer || isImage) {
        const imgTarget = (imageContainer || target) as HTMLElement;
        imgTarget.classList.add('editor-selected');
        selectedElementRef.current = imgTarget;
        
        // Trigger the iframe's internal file input
        if (imageContainer) {
          const internalInput = imageContainer.querySelector('.image-file-input');
          if (internalInput) {
            (internalInput as HTMLInputElement).click();
          }
        } else {
          fileInputRef.current?.click();
        }
        setSelectedFontSize(null);
        setSelectedFontColor('#000000');
      } else {
        selectedElementRef.current = null;
        setSelectedFontSize(null);
        setSelectedFontColor('#000000');
      }
    });

    setupIframeNodeInteractivity(iframeDoc);
    
    // Save initial state if history is empty
    if (historyRef.current.length === 0) {
      saveState();
    }
  };

  // Upload Photo logic
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const iframeDoc = iframeRef.current?.contentDocument;
      if (!iframeDoc) return;
      const target = selectedElementRef.current;
      let imgToReplace: HTMLElement | null = null;
      
      if (target) {
        if (target.tagName === 'IMG' || target.classList.contains('image-preview')) {
          imgToReplace = target as HTMLElement;
        } else {
          const container = target.closest('[data-editable="image"]');
          if (container) {
            imgToReplace = container.querySelector('img, .image-preview') as HTMLElement;
          }
        }
      }

      if (imgToReplace) {
        if (imgToReplace.tagName === 'IMG') {
          (imgToReplace as HTMLImageElement).src = dataUrl;
        } else {
          imgToReplace.style.backgroundImage = `url("${dataUrl}")`;
        }
        imgToReplace.style.filter = 'none';
        imgToReplace.style.mixBlendMode = 'normal';
        imgToReplace.style.opacity = '1';
        
        const container = imgToReplace.closest('[data-editable="image"]');
        if (container) {
          (container as HTMLElement).style.filter = 'none';
          (container as HTMLElement).style.mixBlendMode = 'normal';
        }

        // Hide placeholder state if it exists
        const placeholder = imgToReplace.closest('[data-editable="image"]')?.querySelector('.placeholder-state');
        if (placeholder) {
          (placeholder as HTMLElement).style.display = 'none';
        }
      } else {
        // Otherwise replace the first image in the document
        const firstImg = iframeDoc.querySelector('img, .image-preview') as HTMLElement;
        if (firstImg) {
          if (firstImg.tagName === 'IMG') {
            (firstImg as HTMLImageElement).src = dataUrl;
          } else {
            firstImg.style.backgroundImage = `url("${dataUrl}")`;
          }
          firstImg.style.filter = 'none';
          firstImg.style.mixBlendMode = 'normal';
          firstImg.style.opacity = '1';

          const container = firstImg.closest('[data-editable="image"]');
          if (container) {
            (container as HTMLElement).style.filter = 'none';
            (container as HTMLElement).style.mixBlendMode = 'normal';
          }

          const placeholder = firstImg.closest('[data-editable="image"]')?.querySelector('.placeholder-state');
          if (placeholder) {
            (placeholder as HTMLElement).style.display = 'none';
          }
        } else {
          alert("No image found in template to replace.");
        }
      }
      
      saveState();
    };
    reader.readAsDataURL(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const autoFitText = (iframeDoc: Document) => {
    const container = iframeDoc.querySelector('.poster-scale-container') as HTMLElement;
    if (!container) return;

    const editableElements = iframeDoc.querySelectorAll('[data-editable="text"]');
    
    // 1. Fit headlines horizontally
    editableElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const computedStyle = iframeDoc.defaultView?.getComputedStyle(htmlEl);
      const isHeadline = htmlEl.classList.contains('headline-text') || computedStyle?.whiteSpace === 'nowrap';
      
      if (isHeadline) {
        let fontSize = parseFloat(htmlEl.style.fontSize || computedStyle?.fontSize || '16');
        
        // 1. Clean up any corrupted inline styles from previous failed runs so the grid heals
        htmlEl.style.whiteSpace = '';
        htmlEl.style.maxWidth = '';
        
        const parent = htmlEl.parentElement;
        if (parent) {
          // 2. Hide element temporarily to measure how much space the parent has available naturally
          const originalDisplay = htmlEl.style.display;
          htmlEl.style.display = 'none';
          const targetWidth = parent.clientWidth;
          htmlEl.style.display = originalDisplay;
          
          if (targetWidth > 0) {
            // 3. Force single line to measure true text width
            htmlEl.style.whiteSpace = 'nowrap';
            
            // 4. Shrink until the text width fits the parent's target width
            while (htmlEl.scrollWidth > targetWidth && fontSize > 4) {
              fontSize -= 1;
              htmlEl.style.fontSize = `${fontSize}px`;
            }
            
            // 5. Restore cleanly
            htmlEl.style.whiteSpace = '';
          }
        }
      }
    });

    // 2. Fit vertically (if the container is stretching beyond 1123px)
    // Temporarily remove overflow:hidden from sections so they can accurately stretch the container's scrollHeight
    const layoutSections = iframeDoc.querySelectorAll('.upper-body-section, .main-body-section, .bottom-body-section, .story-split-row');
    layoutSections.forEach(sec => (sec as HTMLElement).style.overflow = 'visible');

    let loopCount = 0;
    while (container.scrollHeight > container.clientHeight && loopCount < 150) {
      loopCount++;
      editableElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const fontSize = parseFloat(htmlEl.style.fontSize || iframeDoc.defaultView?.getComputedStyle(htmlEl).fontSize || '16');
        if (fontSize > 4) {
          htmlEl.style.fontSize = `${fontSize - 0.5}px`;
        }
      });
    }

    layoutSections.forEach(sec => (sec as HTMLElement).style.overflow = '');
  };

  // AI Director Logic
  const handleAiSubmit = async () => {
    if (!aiPrompt.trim()) return;
    
    if (!apiKey) {
      alert("Please enter your Gemini API Key in the settings below to use the AI Director.");
      return;
    }
    
    const target = selectedElementRef.current;
    
    // If something is selected but it's not a text block, warn the user
    const isTargetTextBlock = target?.closest('[data-editable="text"]') !== null;
    if (target && !isTargetTextBlock) {
      alert("Please select a text element for targeted editing, or click outside to deselect and give global instructions.");
      return;
    }

    setRecentPrompts(prev => {
      const updated = [aiPrompt, ...prev.filter(p => p !== aiPrompt)].slice(0, 5);
      localStorage.setItem('recent_prompts', JSON.stringify(updated));
      return updated;
    });

    setIsAiLoading(true);
    try {
      const iframeDoc = iframeRef.current?.contentDocument;
      if (!iframeDoc) throw new Error("Iframe not accessible");

      const genAI = new GoogleGenerativeAI(apiKey);

      // Build ordered model list: user-selected first, then fallbacks (deduplicated)
      const modelsToTry = [apiModel, ...FALLBACK_MODELS.filter(m => m !== apiModel)];

      // Helper: try generateContent with automatic fallback on 429
      const generateWithFallback = async (prompt: string) => {
        let lastError: unknown = null;
        for (const modelName of modelsToTry) {
          try {
            console.log(`[AI Director] Trying model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            if (modelName !== apiModel) {
              console.log(`[AI Director] Succeeded with fallback model: ${modelName}`);
            }
            return result;
          } catch (err: unknown) {
            lastError = err;
            const errMsg = err instanceof Error ? err.message : String(err);
            // Only fallback on rate-limit (429) errors
            if (errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('rate')) {
              console.warn(`[AI Director] Model ${modelName} rate-limited, trying next fallback...`);
              continue;
            }
            // For non-rate-limit errors, throw immediately
            throw err;
          }
        }
        // All models exhausted
        throw lastError || new Error('All models exhausted due to rate limits. Please wait a moment and try again.');
      };

      if (target) {
        // --- MODE A: TARGETED EDIT ---
        const currentText = target.innerText;
        const prompt = `You are an expert editorial writer. The user wants to modify a text block in a fixed A4 poster layout.
        Current text: "${currentText}"
        User instructions: "${aiPrompt}"
        
        CRITICAL REQUIREMENT: The original text is exactly ${currentText.length} characters long. 
        Your new text MUST be strictly LESS THAN OR EQUAL TO ${currentText.length} characters! 
        Do not make it longer. You MUST condense, summarize, and prioritize the core meaning so it fits the strict physical bounds of the layout.
        
        Return ONLY the final modified text. Do not include markdown, explanations, or quotes around the output.`;

        const result = await generateWithFallback(prompt);
        const newText = result.response.text().trim();
        
        if (newText) {
          target.innerText = newText;
          autoFitText(iframeDoc);
          saveState();
        }
      } else {
        // --- MODE B: GLOBAL EDIT ---
        // 1. Scrape text nodes
        const textElements = Array.from(iframeDoc.querySelectorAll('[data-editable="text"]'));
        const textDict: Record<string, { currentText: string, characterLength: number }> = {};
        textElements.forEach(el => {
          if (el.id) {
            const text = (el as HTMLElement).innerText.trim();
            textDict[el.id] = { currentText: text, characterLength: text.length };
          }
        });

        // 2. Scrape CSS variables from :root stylesheet
        const themeDict: Record<string, string> = {};
        try {
          // Iterate over stylesheets to find :root variables
          for (let s = 0; s < iframeDoc.styleSheets.length; s++) {
            const styleSheet = iframeDoc.styleSheets[s];
            try {
              for (const rule of Array.from(styleSheet.cssRules)) {
                if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
                  for (let i = 0; i < rule.style.length; i++) {
                    const prop = rule.style[i];
                    if (prop.startsWith('--')) {
                      themeDict[prop] = rule.style.getPropertyValue(prop).trim();
                    }
                  }
                }
              }
            } catch { /* ignore cross-origin stylesheet errors if any */ }
          }
        } catch (e) {
          console.warn("Could not parse stylesheet variables", e);
        }

        // Add any inline styles currently on the document element
        const rootStyle = iframeDoc.documentElement.style;
        for (let i = 0; i < rootStyle.length; i++) {
           const prop = rootStyle[i];
           if (prop.startsWith('--')) {
             themeDict[prop] = rootStyle.getPropertyValue(prop).trim();
           }
        }

        const prompt = `You are an expert AI Art Director. The user wants to modify an HTML poster template globally.
        You can change text content, themes (CSS variables), and element visibility.
        
        Current Text Content:
        ${JSON.stringify(textDict, null, 2)}
        
        Current CSS Variables (Theme):
        ${JSON.stringify(themeDict, null, 2)}
        
        Available Fonts: Use only fonts already defined in the CSS variables (e.g., var(--font-serif), var(--font-sans)). Do not introduce new font names.
        
        User Instructions: "${aiPrompt}"
        
        CRITICAL LAYOUT RULES FOR A4 POSTER: 
        1. For every text element you modify, your new text MUST NOT EXCEED the original "characterLength".
        2. If the user asks for a long message, you MUST still summarize it to fit the original character length limit.
        3. Do NOT cut off information abruptly, but use extreme summarizing if necessary to ensure all core points fit inside the physical space limit.
        4. Any text longer than the original length will physically break the layout and ruin the poster.

        Return ONLY a JSON object representing the updates. Do NOT include markdown blocks like \`\`\`json. The format must be exactly:
        {
          "text": {
            "element-id": "new text content matching the original character length"
          },
          "theme": {
            "--variable-name": "new value"
          },
          "visibility": {
            "element-id": false
          }
        }
        Only include keys in the JSON that need to be changed. If no theme changes, omit "theme". For visibility, set false to hide an element, true to show.`;

        const result = await generateWithFallback(prompt);
        const responseText = result.response.text().trim();
        
        // Clean up markdown if Gemini adds it
        let cleanText = responseText;
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '');
        }

        // Fallback: extract substring between first { and last }
        const startIndex = cleanText.indexOf('{');
        const endIndex = cleanText.lastIndexOf('}');
        if (startIndex !== -1 && endIndex !== -1) {
          cleanText = cleanText.substring(startIndex, endIndex + 1);
        }

        const updates = JSON.parse(cleanText);

        if (updates.text) {
          for (const [id, newText] of Object.entries(updates.text)) {
            const el = iframeDoc.getElementById(id);
            if (el) el.innerText = String(newText);
          }
        }

        if (updates.theme) {
          for (const [key, value] of Object.entries(updates.theme)) {
            iframeDoc.documentElement.style.setProperty(key, String(value));
          }
        }

        if (updates.visibility) {
          for (const [id, isVisible] of Object.entries(updates.visibility)) {
            const el = iframeDoc.getElementById(id);
            if (el) {
              el.style.display = isVisible === false ? 'none' : '';
            }
          }
        }
        
        autoFitText(iframeDoc);
        saveState();
      }
      setAiPrompt("");
    } catch (error) {
      console.error("AI Error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Failed to generate AI content.\n\nReason: ${msg}\n\nCheck console for more details.`);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Export Poster Logic
  const handleExport = async () => {
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc || !iframeDoc.body) return;

    // Remove selection outline temporarily
    if (selectedElementRef.current) {
      selectedElementRef.current.classList.remove('editor-selected');
    }

    try {
      const canvas = await html2canvas(iframeDoc.body, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });
      
      const dataUrl = canvas.toDataURL('image/png');
      
      // Create a hidden iframe for printing
      const printIframe = document.createElement('iframe');
      printIframe.style.position = 'absolute';
      printIframe.style.width = '0';
      printIframe.style.height = '0';
      printIframe.style.border = 'none';
      document.body.appendChild(printIframe);
      
      const printDoc = printIframe.contentWindow?.document;
      if (printDoc) {
        printDoc.write(`
          <html>
            <head>
              <title>Print Poster</title>
              <style>
                @page { margin: 0; size: A4; }
                body { margin: 0; display: flex; justify-content: center; align-items: center; background: white; }
                img { width: 100%; height: 100%; object-fit: contain; }
              </style>
            </head>
            <body>
              <img src="${dataUrl}" onload="setTimeout(() => window.print(), 100);" />
            </body>
          </html>
        `);
        printDoc.close();
        
        // Clean up the iframe after printing
        printIframe.contentWindow?.addEventListener('afterprint', () => {
          if (document.body.contains(printIframe)) {
            document.body.removeChild(printIframe);
          }
        });
        
        // Fallback cleanup just in case afterprint doesn't fire
        setTimeout(() => {
          if (document.body.contains(printIframe)) {
            document.body.removeChild(printIframe);
          }
        }, 60000); // 1 minute
      }
    } catch (error) {
      console.error("Export Error:", error);
      alert("Failed to export poster.");
    }

    // Restore selection outline
    if (selectedElementRef.current) {
      selectedElementRef.current.classList.add('editor-selected');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', height: '100vh', width: '100vw', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes floatParticle {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          20% { opacity: 0.5; }
          80% { opacity: 0.5; }
          100% { transform: translateY(-20vh) translateX(20px); opacity: 0; }
        }
        .particle {
          position: absolute;
          border-radius: 50%;
          background: rgba(255,255,255,0.8);
          box-shadow: 0 0 8px rgba(255,255,255,0.8);
        }
        .premium-input:focus {
          border-color: rgba(255, 77, 141, 0.5) !important;
          box-shadow: 0 0 0 2px rgba(255, 77, 141, 0.2) !important;
        }
        .btn-gradient {
          background: linear-gradient(135deg, #FF4D8D, #A855F7);
          color: white;
          border: none;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        .btn-gradient:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(255, 77, 141, 0.4);
        }
        .btn-gradient::after {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%);
          transform: rotate(45deg);
          transition: all 0.3s ease;
          opacity: 0;
        }
        .btn-gradient:hover::after {
          animation: shine 1.5s ease-out infinite;
          opacity: 1;
        }
        @keyframes shine {
          0% { transform: translateX(-100%) rotate(45deg); }
          100% { transform: translateX(100%) rotate(45deg); }
        }
        .dropzone-hover:hover {
          border-color: rgba(168, 85, 247, 0.8) !important;
          background: rgba(168, 85, 247, 0.1) !important;
          box-shadow: 0 0 15px rgba(168, 85, 247, 0.2) !important;
        }
        .color-swatch:hover {
          transform: scale(1.15) translateY(-2px) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
        }
        .canvas-frame {
          box-shadow: 0 0 80px rgba(255,77,141,0.25);
          transition: transform 0.3s ease;
        }
        .canvas-frame:hover {
          transform: scale(1.01);
        }
        .editor-sidebar::-webkit-scrollbar {
          display: none;
        }
        .editor-sidebar {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
      `}</style>

      {/* Hidden file input */}
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        style={{ display: 'none' }} 
      />

      {/* Background Layers */}
      <div className="bg-layer blob blob-1" />
      <div className="bg-layer blob blob-2" />
      <div className="bg-layer blob blob-3" />
      <div className="bg-layer aurora-waves" />
      
      {/* Particles Layer */}
      <div className="bg-layer" style={{ zIndex: 0 }}>
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: `${(i * 13) % 100}vw`,
              top: `${(i * 27) % 100}vh`,
              width: `${(i % 3) + 1}px`,
              height: `${(i % 3) + 1}px`,
              animation: `floatParticle ${(i % 15) + 15}s linear ${i % 5}s infinite`,
              opacity: 0 // handled by animation keyframes
            }}
          />
        ))}
      </div>
      
      <div className="bg-layer noise-overlay" />

      {/* Main Canvas Area */}
      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        position: 'relative',
        zIndex: 5
      }}>
        {/* Top Status Bar */}
        <div style={{
          position: 'absolute',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px)',
          padding: '8px 20px',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.08)',
          zIndex: 10,
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          fontWeight: 500
        }}>
          <span style={{ color: '#fff' }}>Template {templateId?.split('_')[1] || ''}</span>
          <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
          <span>Timeless Clicks Studio</span>
          <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Auto Saved <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </span>
        </div>

        {/* Undo/Redo Controls - Floating Top Right */}
        <div style={{
          position: 'absolute',
          top: isMobile ? '12px' : '24px',
          right: isMobile ? '12px' : '24px',
          zIndex: 10,
          display: 'flex',
          gap: '8px',
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px)',
          borderRadius: '12px',
          padding: '6px',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <button 
            onClick={undo} 
            disabled={!canUndo} 
            style={{ 
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              borderRadius: '8px',
              background: 'transparent',
              color: canUndo ? '#fff' : 'rgba(255,255,255,0.3)',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              fontSize: '0.85rem',
              fontWeight: 500
            }}
            onMouseEnter={e => { if(canUndo) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}}
            onMouseLeave={e => { if(canUndo) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateY(0)'; }}}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            <span className="hide-on-mobile">Undo</span>
          </button>
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
          <button 
            onClick={redo} 
            disabled={!canRedo} 
            style={{ 
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              borderRadius: '8px',
              background: 'transparent',
              color: canRedo ? '#fff' : 'rgba(255,255,255,0.3)',
              cursor: canRedo ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              fontSize: '0.85rem',
              fontWeight: 500
            }}
            onMouseEnter={e => { if(canRedo) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}}
            onMouseLeave={e => { if(canRedo) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'translateY(0)'; }}}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
            <span className="hide-on-mobile">Redo</span>
          </button>
        </div>

        {/* Zoom Controls - Floating Bottom Right */}
        <div style={{
          position: 'absolute',
          bottom: isMobile ? '12px' : '32px',
          right: isMobile ? '12px' : '32px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px)',
          borderRadius: '24px',
          padding: '6px',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        }}>
          <button
            onClick={zoomOut}
            style={{
              width: '36px', height: '36px',
              border: 'none', borderRadius: '50%',
              background: 'transparent', color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>

          <button
            onClick={zoomReset}
            style={{
              minWidth: '52px', height: '36px',
              border: 'none', borderRadius: '18px',
              background: 'transparent', color: 'var(--text-secondary)',
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
              transition: 'all 0.2s', padding: '0 12px'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            onClick={zoomIn}
            style={{
              width: '36px', height: '36px',
              border: 'none', borderRadius: '50%',
              background: 'transparent', color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
        </div>

        {/* Scrollable canvas wrapper */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: isMobile ? '80px 16px 16px 16px' : '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'min-content'
        }}>
          <div 
            className="canvas-frame"
            style={{
              width: `${794 * zoom}px`,
              height: `${1123 * zoom}px`,
              background: '#fff',
              borderRadius: '8px',
              overflow: 'hidden',
              flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <iframe 
              ref={iframeRef}
              src={`/templates/${templateId}/template.html`}
              title="Template Preview"
              onLoad={handleIframeLoad}
              style={{
                width: '794px',
                height: '1123px',
                border: 'none',
                background: '#fff',
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
        </div>
      </main>

      {/* Floating Left Sidebar */}
      <aside className="editor-sidebar" style={{
        width: isMobile ? '100%' : '350px',
        height: isMobile ? '45vh' : '100vh',
        background: 'rgba(255,255,255,0.02)',
        backdropFilter: 'blur(30px)',
        borderLeft: isMobile ? 'none' : '1px solid rgba(255,255,255,0.08)',
        borderTop: isMobile ? '1px solid rgba(255,255,255,0.08)' : 'none',
        padding: '10px',
        paddingBottom: isMobile ? '20px' : '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        overflowY: 'auto',
        flexShrink: 0,
        zIndex: 10,
        boxShadow: '-10px 0 30px rgba(0,0,0,0.2)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <button 
            onClick={() => navigate('/')} 
            style={{ 
              width: '28px', height: '28px', 
              borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', 
              background: 'rgba(255,255,255,0.05)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          </button>
          <h1 className="heading-font" style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600 }}>Editor</h1>
        </div>

        {/* API Settings Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>API Configuration</label>
          </div>
          
          <input 
            type="password"
            className="premium-input"
            placeholder="Enter Gemini API Key..."
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              localStorage.setItem('gemini_api_key', e.target.value);
            }}
            style={{
              width: '100%', padding: '4px 8px', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px', background: 'rgba(255,255,255,0.03)', color: 'white',
              fontSize: '0.75rem', outline: 'none', transition: 'all 0.2s'
            }}
          />
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text"
              className="premium-input"
              placeholder="Model (e.g. gemini-1.5-flash)"
              list="gemini-models"
              value={apiModel}
              onChange={(e) => {
                setApiModel(e.target.value);
                localStorage.setItem('gemini_model', e.target.value);
              }}
              style={{
                flex: 1, padding: '4px 8px', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px', background: 'rgba(255,255,255,0.03)', color: 'white',
                fontSize: '0.75rem', outline: 'none', transition: 'all 0.2s'
              }}
            />
            <button 
              className="btn-gradient"
              style={{ padding: '0 10px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              onClick={async () => {
                if (!apiKey) {
                  alert("Please enter an API key first.");
                  return;
                }
                try {
                  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                  const data = await res.json();
                  if (data.error) {
                    alert(`API Error: ${data.error.message} (${data.error.status})`);
                  } else if (data.models) {
                    const textModels = data.models
                      .map((m: { name: string }) => m.name.replace('models/', ''))
                      .filter((name: string) => name.includes('gemini'));
                    alert(`Success! The API is working.\\n\\nAvailable Models for your key:\\n- ${textModels.join('\\n- ')}\\n\\nPlease pick one of these models and put it in the Model input box.`);
                  }
                } catch {
                  alert("Network Error: Could not connect to Google Generative Language API. Check your internet or adblocker.");
                }
              }}
            >
              Test API
            </button>
          </div>
          <datalist id="gemini-models">
            <option value="gemini-3.0-flash" />
            <option value="gemini-2.5-flash" />
            <option value="gemini-3.1-flash-lite" />
            <option value="gemini-2.5-flash-lite" />
          </datalist>
        </div>

        {/* Assets / Upload Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Assets
          </label>
          <button 
            className="dropzone-hover"
            onClick={() => fileInputRef.current?.click()}
            style={{ 
              width: '100%', 
              padding: '6px 10px', 
              border: '1px dashed rgba(255,255,255,0.2)', 
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.3s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#fff' }}>Upload Photo</span>
          </button>
        </div>

        {/* Typography Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
            Typography
          </label>

          {selectedFontSize === null && (
            <div style={{
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)',
              color: 'var(--text-secondary)',
              fontSize: '0.7rem',
              textAlign: 'center',
              lineHeight: 1.2,
            }}>
              Select a text element on the poster to edit typography
            </div>
          )}

          {/* Size Controller */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.05)',
            padding: '2px',
            opacity: selectedFontSize === null ? 0.35 : 1,
            pointerEvents: selectedFontSize === null ? 'none' : 'auto',
            transition: 'opacity 0.3s ease'
          }}>
            <button
              onClick={() => {
                if (selectedElementRef.current && selectedFontSize !== null) {
                  const next = Math.max(1, selectedFontSize - 1);
                  setSelectedFontSize(next);
                  selectedElementRef.current.style.fontSize = `${next}px`;
                  saveState();
                }
              }}
              style={{
                width: '30px', height: '30px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', borderRadius: '10px',
                background: 'transparent', color: 'var(--text-secondary)',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="number"
                value={selectedFontSize || ''}
                placeholder="-"
                disabled={selectedFontSize === null}
                onChange={(e) => {
                  const newSize = parseFloat(e.target.value);
                  setSelectedFontSize(newSize);
                  if (selectedElementRef.current && !isNaN(newSize)) {
                    selectedElementRef.current.style.fontSize = `${newSize}px`;
                    saveState();
                  }
                }}
                style={{
                  width: '40px',
                  border: 'none',
                  background: 'transparent',
                  color: '#fff',
                  fontSize: '1rem',
                  fontWeight: 600,
                  outline: 'none',
                  textAlign: 'center',
                  fontFamily: 'inherit'
                }}
              />
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>px</span>
            </div>

            <button
              onClick={() => {
                if (selectedElementRef.current && selectedFontSize !== null) {
                  const next = selectedFontSize + 1;
                  setSelectedFontSize(next);
                  selectedElementRef.current.style.fontSize = `${next}px`;
                  saveState();
                }
              }}
              style={{
                width: '30px', height: '30px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', borderRadius: '10px',
                background: 'transparent', color: 'var(--text-secondary)',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>

          {/* Color row */}
          <div style={{ 
            opacity: selectedFontSize === null ? 0.35 : 1, 
            pointerEvents: selectedFontSize === null ? 'none' : 'auto', 
            transition: 'opacity 0.3s ease',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.05)',
            padding: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Fill Color</span>
              <span style={{ fontSize: '0.75rem', color: '#fff', marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 500, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                {selectedFontColor.toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {['#000000','#ffffff','#e62429','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#6b7280'].map(c => (
                <button
                  key={c}
                  title={c}
                  className="color-swatch"
                  onClick={() => {
                    setSelectedFontColor(c);
                    if (selectedElementRef.current) {
                      selectedElementRef.current.style.color = c;
                      saveState();
                    }
                  }}
                  style={{
                    width: '18px', height: '18px',
                    borderRadius: '50%',
                    border: 'none',
                    background: c,
                    cursor: 'pointer',
                    boxShadow: selectedFontColor === c ? `0 0 0 2px rgba(255,255,255,0.8), 0 0 10px ${c}` : 'inset 0 0 0 1px rgba(0,0,0,0.2)',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                    transform: selectedFontColor === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
              {/* Custom color picker */}
              <div style={{ position: 'relative', width: '18px', height: '18px', flexShrink: 0 }} className="color-swatch">
                <input
                  type="color"
                  value={selectedFontColor}
                  onChange={(e) => {
                    const newColor = e.target.value;
                    setSelectedFontColor(newColor);
                    if (selectedElementRef.current) {
                      selectedElementRef.current.style.color = newColor;
                      saveState();
                    }
                  }}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    opacity: 0, cursor: 'pointer', zIndex: 2
                  }}
                />
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: 'conic-gradient(from 0deg, #f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f472b6, #f87171)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.2)'
                }}>
                  <span style={{ fontSize: '12px', color: '#fff', textShadow: '0 0 4px rgba(0,0,0,0.8)', fontWeight: 600 }}>+</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Director Section - Hero Tool */}
        <div style={{ 
          display: 'flex', flexDirection: 'column', gap: '4px', flex: 1,
          background: 'rgba(255, 77, 141, 0.05)',
          border: '1px solid rgba(255, 77, 141, 0.2)',
          borderRadius: '10px',
          padding: '6px',
          boxShadow: 'inset 0 0 20px rgba(255, 77, 141, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="heading-font" style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="url(#gradient)" strokeWidth="2"><defs><linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FF4D8D" /><stop offset="100%" stopColor="#A855F7" /></linearGradient></defs><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              AI Director
            </label>
            <span style={{ fontSize: '0.65rem', background: 'linear-gradient(135deg, rgba(255, 77, 141, 0.2), rgba(168, 85, 247, 0.2))', color: '#fff', padding: '2px 6px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>AI Assisted Editing</span>
          </div>

          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1 }}>
            <textarea 
              placeholder="✨ Make this headline more emotional..."
              value={aiPrompt}
              className="premium-input"
              onChange={(e) => setAiPrompt(e.target.value)}
              style={{ 
                width: '100%', 
                flex: 1,
                resize: 'none', 
                padding: '6px',
                paddingBottom: '22px',
                color: '#fff',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                fontSize: '0.75rem',
                outline: 'none',
                minHeight: '32px',
                lineHeight: 1.2,
                transition: 'all 0.2s'
              }}
            />
            {recentPrompts.length > 0 && (
              <div style={{ position: 'absolute', bottom: '6px', right: '6px' }}>
                <button 
                  style={{ 
                    padding: '6px 12px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', 
                    border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onClick={() => setShowPromptsPopup(!showPromptsPopup)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Recent
                </button>
                {showPromptsPopup && (
                  <div style={{
                    position: 'absolute', bottom: '100%', right: 0, marginBottom: '8px',
                    width: '250px', background: 'rgba(15, 10, 22, 0.95)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 50,
                    maxHeight: '200px', overflowY: 'auto', backdropFilter: 'blur(20px)'
                  }}>
                    {recentPrompts.map((prompt, i) => (
                      <div 
                        key={i}
                        onClick={() => {
                          setAiPrompt(prompt);
                          setShowPromptsPopup(false);
                        }}
                        style={{
                          padding: '10px 14px',
                          borderBottom: i < recentPrompts.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                          cursor: 'pointer', fontSize: '0.8rem', color: '#d1d5db',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          transition: 'background 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        {prompt}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button 
            className="btn-gradient" 
            style={{ 
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', 
              padding: '6px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
              cursor: isAiLoading ? 'not-allowed' : 'pointer', opacity: isAiLoading ? 0.7 : 1
            }}
            onClick={handleAiSubmit}
            disabled={isAiLoading}
          >
            {isAiLoading ? 'Generating...' : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                  <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
                </svg>
                AI Generate
              </>
            )}
          </button>
        </div>

        {/* Print Button */}
        <div style={{ marginTop: 'auto' }}>
          <button 
            style={{ 
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', 
              padding: '8px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
              background: 'rgba(247, 201, 72, 0.1)', border: '1px solid rgba(247, 201, 72, 0.3)',
              color: '#FFD166', cursor: 'pointer', transition: 'all 0.3s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(247, 201, 72, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(247, 201, 72, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            onClick={handleExport}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            Export Keepsake
          </button>
        </div>
      </aside>
    </div>
  );
};

export default EditorPage;
