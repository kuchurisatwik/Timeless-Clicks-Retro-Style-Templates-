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
  const [zoom, setZoom] = useState(0.6);

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
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          const container = (e.target as HTMLElement).closest('[data-editable="image"]');
          if (container) {
            const img = container.querySelector('img');
            if (img) img.src = dataUrl;
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
      let imgToReplace: HTMLImageElement | null = null;
      
      if (target) {
        if (target.tagName === 'IMG') {
          imgToReplace = target as HTMLImageElement;
        } else {
          const container = target.closest('[data-editable="image"]');
          if (container) {
            imgToReplace = container.querySelector('img');
          }
        }
      }

      if (imgToReplace) {
        imgToReplace.src = dataUrl;
        // Hide placeholder state if it exists
        const placeholder = imgToReplace.closest('[data-editable="image"]')?.querySelector('.placeholder-state');
        if (placeholder) {
          (placeholder as HTMLElement).style.display = 'none';
        }
      } else {
        // Otherwise replace the first image in the document
        const firstImg = iframeDoc.querySelector('img');
        if (firstImg) {
          firstImg.src = dataUrl;
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
        let fontSize = parseFloat(htmlEl.style.fontSize || iframeDoc.defaultView?.getComputedStyle(htmlEl).fontSize || '16');
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
            } catch(e) { /* ignore cross-origin stylesheet errors if any */ }
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
        let responseText = result.response.text().trim();
        
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
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `poster-${templateId}-${Date.now()}.png`;
      a.click();
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
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Hidden file input */}
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        style={{ display: 'none' }} 
      />

      {/* Sidebar */}
      <aside style={{
        width: '380px',
        background: 'rgba(30, 41, 59, 0.5)',
        backdropFilter: 'blur(16px)',
        borderRight: '1px solid var(--border-color)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ padding: '8px 12px' }}>
            &larr; Back
          </button>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Editor</h1>
        </div>

        {/* Assets Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>API Settings</label>
            <input 
              type="password"
              className="glass-panel"
              placeholder="Enter Gemini API Key..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                localStorage.setItem('gemini_api_key', e.target.value);
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                background: 'rgba(0,0,0,0.2)',
                color: 'white',
                fontSize: '0.85rem',
                outline: 'none',
                marginBottom: '4px'
              }}
            />
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input 
                type="text"
                className="glass-panel"
                placeholder="Model (e.g. gemini-1.5-flash)"
                list="gemini-models"
                value={apiModel}
                onChange={(e) => {
                  setApiModel(e.target.value);
                  localStorage.setItem('gemini_model', e.target.value);
                }}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.2)',
                  color: 'white',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
              <button 
                className="btn btn-secondary" 
                title="Test API Key & List Available Models"
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
                        .map((m: any) => m.name.replace('models/', ''))
                        .filter((name: string) => name.includes('gemini'));
                      alert(`Success! The API is working.\n\nAvailable Models for your key:\n- ${textModels.join('\n- ')}\n\nPlease pick one of these models and put it in the Model input box.`);
                    }
                  } catch (e) {
                    alert("Network Error: Could not connect to Google Generative Language API. Check your internet or adblocker.");
                  }
                }}
                style={{ padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Assets</label>
            <button 
              className="btn btn-secondary" 
              style={{ width: '100%', justifyContent: 'center', padding: '8px 12px' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Upload Photo
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 500, color: 'rgba(148,163,184,0.85)', letterSpacing: '0.03em' }}>Typography</label>

            {/* Hint when nothing selected */}
            {selectedFontSize === null && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'rgba(59,130,246,0.06)',
                border: '1px dashed rgba(59,130,246,0.2)',
                color: 'rgba(148,163,184,0.7)',
                fontSize: '0.78rem',
                textAlign: 'center',
                lineHeight: 1.5,
                fontWeight: 400
              }}>
                Click a text element on the poster to edit its size &amp; color
              </div>
            )}

            {/* Size row — pill shape */}
            <div style={{
              display: 'flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.08)',
              padding: '3px',
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
                  border: 'none', borderRadius: '11px',
                  background: 'transparent', color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer', fontSize: '1rem', fontWeight: 300,
                  flexShrink: 0, transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <input
                type="number"
                className="glass-panel"
                value={selectedFontSize || ''}
                placeholder="—"
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
                  flex: 1,
                  padding: '5px 4px',
                  border: 'none',
                  borderRadius: '10px',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: '0.82rem',
                  fontWeight: 400,
                  outline: 'none',
                  textAlign: 'center',
                  minWidth: 0
                }}
              />
              <span style={{ color: 'rgba(148,163,184,0.45)', fontSize: '0.72rem', fontWeight: 400, flexShrink: 0, marginRight: '4px' }}>px</span>
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
                  border: 'none', borderRadius: '11px',
                  background: 'transparent', color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer', fontSize: '1rem', fontWeight: 300,
                  flexShrink: 0, transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>

            {/* Color row */}
            <div style={{ opacity: selectedFontSize === null ? 0.35 : 1, pointerEvents: selectedFontSize === null ? 'none' : 'auto', transition: 'opacity 0.3s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 400, color: 'rgba(148,163,184,0.7)' }}>Color</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(148,163,184,0.4)', marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 400, letterSpacing: '0.04em' }}>{selectedFontColor.toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                {['#000000','#ffffff','#e62429','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#6b7280','#92400e'].map(c => (
                  <button
                    key={c}
                    title={c}
                    onClick={() => {
                      setSelectedFontColor(c);
                      if (selectedElementRef.current) {
                        selectedElementRef.current.style.color = c;
                        saveState();
                      }
                    }}
                    style={{
                      width: '22px', height: '22px',
                      borderRadius: '50%',
                      border: selectedFontColor === c ? '2px solid rgba(96,165,250,0.7)' : '1.5px solid rgba(255,255,255,0.1)',
                      background: c,
                      cursor: 'pointer',
                      boxShadow: selectedFontColor === c ? '0 0 0 2px rgba(96,165,250,0.25)' : 'none',
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                      transform: selectedFontColor === c ? 'scale(1.15)' : 'scale(1)',
                      ...(c === '#ffffff' ? { boxShadow: selectedFontColor === c ? '0 0 0 2px rgba(96,165,250,0.25), inset 0 0 0 1px rgba(0,0,0,0.1)' : 'inset 0 0 0 1px rgba(0,0,0,0.1)' } : {})
                    }}
                  />
                ))}
                {/* Custom color picker trigger */}
                <div style={{ position: 'relative', width: '22px', height: '22px', flexShrink: 0 }}>
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
                      opacity: 0, cursor: 'pointer'
                    }}
                  />
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    border: '1.5px solid rgba(255,255,255,0.1)',
                    background: 'conic-gradient(from 0deg, #f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f472b6, #f87171)',
                    pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0.75, transition: 'opacity 0.2s'
                  }}>
                    <span style={{ fontSize: '10px', color: '#fff', textShadow: '0 0 4px rgba(0,0,0,0.6)', fontWeight: 400 }}>+</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>AI Director</label>

            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <textarea 
                className="glass-panel"
                placeholder="e.g. Make this headline sound more dramatic..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                style={{ 
                  width: '100%', 
                  flex: 1, 
                  resize: 'none', 
                  padding: '10px',
                  paddingBottom: '36px',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  fontSize: '0.9rem',
                  outline: 'none',
                  minHeight: '70px'
                }}
              />
              {recentPrompts.length > 0 && (
                <div style={{ position: 'absolute', bottom: '8px', right: '8px' }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)' }}
                    onClick={() => setShowPromptsPopup(!showPromptsPopup)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                      <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    Recent
                  </button>
                  {showPromptsPopup && (
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      right: 0,
                      marginBottom: '4px',
                      width: '250px',
                      background: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                      zIndex: 50,
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {recentPrompts.map((prompt, i) => (
                        <div 
                          key={i}
                          onClick={() => {
                            setAiPrompt(prompt);
                            setShowPromptsPopup(false);
                          }}
                          style={{
                            padding: '8px 12px',
                            borderBottom: i < recentPrompts.length - 1 ? '1px solid #374151' : 'none',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            color: '#d1d5db',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = '#374151'}
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
              className="btn" 
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              onClick={handleAiSubmit}
              disabled={isAiLoading}
            >
              {isAiLoading ? 'Generating...' : (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                    <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
                  </svg>
                  AI Generate
                </div>
              )}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button 
            className="btn" 
            style={{ width: '100%', justifyContent: 'center', padding: '12px', background: '#10b981' }}
            onClick={handleExport}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Export Poster
          </button>
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'radial-gradient(circle at center, #1e293b, #0f172a)',
        position: 'relative',
      }}>
        {/* Undo/Redo controls */}
        <div style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          zIndex: 10,
          display: 'flex',
          gap: '8px'
        }}>
          <button 
            className="btn btn-secondary" 
            onClick={undo} 
            disabled={!canUndo} 
            style={{ 
              padding: '8px 16px', 
              opacity: canUndo ? 1 : 0.4, 
              cursor: canUndo ? 'pointer' : 'not-allowed',
              background: 'rgba(30,41,59,0.85)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            Undo
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={redo} 
            disabled={!canRedo} 
            style={{ 
              padding: '8px 16px', 
              opacity: canRedo ? 1 : 0.4, 
              cursor: canRedo ? 'pointer' : 'not-allowed',
              background: 'rgba(30,41,59,0.85)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            Redo
          </button>
        </div>

        {/* Zoom controls */}
        <div style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'rgba(30,41,59,0.85)',
          backdropFilter: 'blur(10px)',
          borderRadius: '10px',
          padding: '4px',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <button
            onClick={zoomOut}
            style={{
              width: '36px',
              height: '36px',
              border: 'none',
              borderRadius: '8px',
              background: 'transparent',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              fontWeight: 600,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title="Zoom Out"
          >
            −
          </button>

          <button
            onClick={zoomReset}
            style={{
              minWidth: '52px',
              height: '36px',
              border: 'none',
              borderRadius: '8px',
              background: 'transparent',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.5px',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title="Reset Zoom"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            onClick={zoomIn}
            style={{
              width: '36px',
              height: '36px',
              border: 'none',
              borderRadius: '8px',
              background: 'transparent',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              fontWeight: 600,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title="Zoom In"
          >
            +
          </button>
        </div>

        {/* Scrollable canvas */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '32px',
        }}>
          <div style={{
            width: `${794 * zoom}px`,
            height: `${1123 * zoom}px`,
            margin: '0 auto',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}>
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
    </div>
  );
};

export default EditorPage;
