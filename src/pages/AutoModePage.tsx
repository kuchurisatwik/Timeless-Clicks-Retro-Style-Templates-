import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { Capacitor } from '@capacitor/core';
import { injectBrandingOverlay } from '../brandingOverlay';
import { fetchPhotos, subscribeToPhotoChanges, getDisplayUrl } from '../services/photoService';

const AutoModePage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const photoInjectedRef = useRef(false);

  const [latestPhoto, setLatestPhoto] = useState<string | null>(null);
  const latestPhotoRef = useRef<string | null>(null);

  useEffect(() => {
    latestPhotoRef.current = latestPhoto;
  }, [latestPhoto]);

  const [photoReady, setPhotoReady] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [newPhotoAlert, setNewPhotoAlert] = useState(false);
  const [noPhotos, setNoPhotos] = useState(false);
  const [zoom] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return 0.35;
    return 0.55;
  });

  // ── Helper: image rendering (reused from EditorPage) ──
  const loadImageElement = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = src;
    });
  };

  const getRenderedImageSource = async (sourceUrl: string, targetElement: HTMLElement) => {
    try {
      const image = await loadImageElement(sourceUrl);
      const rect = targetElement.getBoundingClientRect();
      const width = rect.width > 0 ? rect.width : parseFloat(window.getComputedStyle(targetElement).width) || 1;
      const height = rect.height > 0 ? rect.height : parseFloat(window.getComputedStyle(targetElement).height) || 1;
      const pixelWidth = Math.max(1, Math.round(width));
      const pixelHeight = Math.max(1, Math.round(height));
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(pixelWidth * dpr));
      canvas.height = Math.max(1, Math.round(pixelHeight * dpr));
      const ctx = canvas.getContext('2d');
      if (!ctx) return sourceUrl;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // object-fit: cover
      const imageRatio = image.naturalWidth / image.naturalHeight;
      const targetRatio = pixelWidth / pixelHeight;
      let drawWidth = pixelWidth, drawHeight = pixelHeight, offsetX = 0, offsetY = 0;
      if (imageRatio > targetRatio) {
        drawHeight = pixelHeight;
        drawWidth = pixelHeight * imageRatio;
        offsetX = (pixelWidth - drawWidth) / 2;
      } else {
        drawWidth = pixelWidth;
        drawHeight = pixelWidth / imageRatio;
        offsetY = (pixelHeight - drawHeight) / 2;
      }
      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
      return canvas.toDataURL('image/png');
    } catch {
      return sourceUrl;
    }
  };

  // ── Inject photo into template iframe ──
  const injectPhotoIntoTemplate = useCallback(async (photoUrl: string) => {
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc) return;

    const displayUrl = getDisplayUrl(photoUrl);

    // Find the first image slot
    const imageContainer = iframeDoc.querySelector('[data-editable="image"]');
    let imgToReplace: HTMLElement | null = null;

    if (imageContainer) {
      imgToReplace = imageContainer.querySelector('img, .image-preview') as HTMLElement;
    }

    if (!imgToReplace) {
      // Fallback: find any img
      imgToReplace = iframeDoc.querySelector('img') as HTMLElement;
    }

    if (imgToReplace) {
      const renderedUrl = await getRenderedImageSource(displayUrl, imgToReplace);
      if (imgToReplace.tagName === 'IMG') {
        (imgToReplace as HTMLImageElement).src = renderedUrl;
      } else {
        imgToReplace.style.backgroundImage = `url("${renderedUrl}")`;
      }
      imgToReplace.style.filter = 'none';
      imgToReplace.style.mixBlendMode = 'normal';
      imgToReplace.style.opacity = '1';

      const container = imgToReplace.closest('[data-editable="image"]');
      if (container) {
        (container as HTMLElement).style.filter = 'none';
        (container as HTMLElement).style.mixBlendMode = 'normal';
      }
      const placeholder = imgToReplace.closest('[data-editable="image"]')?.querySelector('.placeholder-state');
      if (placeholder) {
        (placeholder as HTMLElement).style.display = 'none';
      }
    }

    setPhotoReady(true);
    photoInjectedRef.current = true;
  }, []);

  // ── Fetch latest photo ──
  const fetchLatestPhoto = useCallback(async () => {
    const photos = await fetchPhotos();
    if (photos.length > 0) {
      const newest = photos[0];
      setLatestPhoto(newest);
      setNoPhotos(false);
      return newest;
    } else {
      setNoPhotos(true);
      return null;
    }
  }, []);

  // ── On iframe load ──
  const handleIframeLoad = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    // Inject branding overlay
    injectBrandingOverlay(iframe.contentDocument);
    setIframeLoaded(true);

    // Auto-inject the latest photo
    const photo = await fetchLatestPhoto();
    if (photo) {
      await injectPhotoIntoTemplate(photo);
    }
  }, [fetchLatestPhoto, injectPhotoIntoTemplate]);

  // ── Subscribe to photo changes ──
  useEffect(() => {
    const cleanup = subscribeToPhotoChanges(async (photos) => {
      if (photos.length > 0) {
        const newest = photos[0];
        if (newest !== latestPhotoRef.current) {
          setLatestPhoto(newest);
          setNewPhotoAlert(true);
          setNoPhotos(false);
          // Auto-inject the new photo
          if (iframeLoaded) {
            await injectPhotoIntoTemplate(newest);
          }
          // Clear the alert after 3 seconds
          setTimeout(() => setNewPhotoAlert(false), 3000);
        }
      }
    });
    return cleanup;
  }, [iframeLoaded, injectPhotoIntoTemplate]);

  // ── Reload / refresh photos ──
  const handleRefresh = useCallback(async () => {
    setPhotoReady(false);
    photoInjectedRef.current = false;
    const photo = await fetchLatestPhoto();
    if (photo && iframeLoaded) {
      await injectPhotoIntoTemplate(photo);
    }
  }, [fetchLatestPhoto, iframeLoaded, injectPhotoIntoTemplate]);

  // ── One-Click Print ──
  const handleConfirmAndPrint = async () => {
    if (isPrinting || !photoReady) return;
    const iframeDoc = iframeRef.current?.contentDocument;
    if (!iframeDoc || !iframeDoc.body) return;

    setIsPrinting(true);

    try {
      const posterEl = iframeDoc.querySelector('.poster-scale-container') || iframeDoc.body;

      let exportScale = Capacitor.isNativePlatform() ? 1.5 : 4;
      if (!Capacitor.isNativePlatform() && typeof window !== 'undefined' && window.devicePixelRatio) {
        exportScale = Math.max(window.devicePixelRatio * 2, 4);
      }

      const canvas = await html2canvas(posterEl as HTMLElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scale: exportScale,
        width: 794,
        height: 1123,
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      // ── Electron: Silent Print ──
      if (window.electronAPI?.silentPrint) {
        const selectedPrinter = localStorage.getItem('auto_mode_printer') || undefined;
        const result = await window.electronAPI.silentPrint(dataUrl, selectedPrinter);
        if (result.success) {
          setPrintSuccess(true);
          setTimeout(() => setPrintSuccess(false), 3000);
        } else {
          alert(`Print failed: ${result.error || 'Unknown error'}`);
        }
      }
      // ── Capacitor Native ──
      else if (Capacitor.isNativePlatform()) {
        const base64Data = dataUrl.split('base64,')[1];
        const cordova = (window as any).cordova;
        if (cordova?.plugins?.printer) {
          cordova.plugins.printer.print(`base64://${base64Data}`, { name: 'Timeless_Clicks' });
          setPrintSuccess(true);
          setTimeout(() => setPrintSuccess(false), 3000);
        } else {
          alert('Printer plugin not available on this device.');
        }
      }
      // ── Web fallback (print dialog will appear) ──
      else {
        const printIframe = document.createElement('iframe');
        printIframe.style.position = 'fixed';
        printIframe.style.left = '-9999px';
        printIframe.style.top = '0';
        printIframe.style.width = '794px';
        printIframe.style.height = '1123px';
        printIframe.style.border = 'none';
        printIframe.style.opacity = '0';
        printIframe.style.pointerEvents = 'none';
        document.body.appendChild(printIframe);

        const printDoc = printIframe.contentWindow?.document;
        if (printDoc) {
          printDoc.write(`
            <html>
              <head>
                <title>Print Keepsake</title>
                <style>
                  @page { margin: 0; size: A4 portrait; }
                  * { margin: 0; padding: 0; }
                  html, body { width: 100%; height: 100%; background: white; }
                  body { display: flex; justify-content: center; align-items: flex-start; }
                  img { width: 210mm; height: 297mm; object-fit: contain; display: block; }
                </style>
              </head>
              <body>
                <img id="print-img" src="${dataUrl}" />
              </body>
            </html>
          `);
          printDoc.close();

          const printImg = printDoc.getElementById('print-img') as HTMLImageElement;
          const triggerPrint = () => {
            setTimeout(() => {
              printIframe.contentWindow?.focus();
              printIframe.contentWindow?.print();
              setPrintSuccess(true);
              setTimeout(() => setPrintSuccess(false), 3000);
            }, 300);
          };

          if (printImg) {
            if (printImg.complete) triggerPrint();
            else printImg.onload = triggerPrint;
          }

          printIframe.contentWindow?.addEventListener('afterprint', () => {
            if (document.body.contains(printIframe)) document.body.removeChild(printIframe);
          });
          setTimeout(() => {
            if (document.body.contains(printIframe)) document.body.removeChild(printIframe);
          }, 120000);
        }
      }
    } catch (error) {
      console.error('Auto Print Error:', error);
      alert('Failed to print. Check console for details.');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes autoModePulse {
          0%, 100% { box-shadow: 0 0 30px rgba(255,77,141,0.3); }
          50% { box-shadow: 0 0 60px rgba(255,77,141,0.6); }
        }
        @keyframes slideInAlert {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes successPop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
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
      `}</style>

      {/* Simplified Background to prevent lag */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, #0f0a16 0%, #1a1025 100%)',
        zIndex: 0,
      }} />

      {/* ── Top Status Bar ── */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: 'linear-gradient(135deg, rgba(255,77,141,0.12), rgba(168,85,247,0.12))',
        backdropFilter: 'blur(20px)',
        padding: '10px 24px',
        borderRadius: '24px',
        border: '1px solid rgba(255,77,141,0.2)',
        zIndex: 20,
        color: '#fff',
        fontSize: '0.9rem',
        fontWeight: 600,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          width: '10px', height: '10px',
          borderRadius: '50%',
          background: '#10b981',
          boxShadow: '0 0 8px #10b981',
          animation: 'autoModePulse 2s ease-in-out infinite',
        }} />
        <span>⚡ Auto Mode Active</span>
        <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
        <span style={{ color: 'var(--text-secondary)' }}>
          Template {templateId?.split('_')[1] || ''}
        </span>
      </div>

      {/* ── New Photo Alert ── */}
      {newPhotoAlert && (
        <div style={{
          position: 'absolute',
          top: '70px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.9), rgba(34,197,94,0.9))',
          color: '#fff',
          padding: '8px 20px',
          borderRadius: '20px',
          fontSize: '0.85rem',
          fontWeight: 600,
          zIndex: 25,
          animation: 'slideInAlert 0.3s ease-out',
          boxShadow: '0 8px 24px rgba(16,185,129,0.4)',
        }}>
          📸 New photo detected — auto-updated!
        </div>
      )}

      {/* ── Print Success Toast ── */}
      {printSuccess && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.95), rgba(34,197,94,0.95))',
          color: '#fff',
          padding: '20px 40px',
          borderRadius: '24px',
          fontSize: '1.2rem',
          fontWeight: 700,
          zIndex: 50,
          animation: 'successPop 0.4s ease-out',
          boxShadow: '0 16px 48px rgba(16,185,129,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          ✅ Printed Successfully!
        </div>
      )}

      {/* ── Back Button ── */}
      <button
        onClick={() => navigate('/')}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          zIndex: 20,
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(12px)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
      </button>

      {/* ── Template Preview ── */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: `${794 * zoom}px`,
        height: `${1123 * zoom}px`,
        background: '#fff',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 0 30px rgba(255,77,141,0.15)',
        flexShrink: 0,
      }}>
        <iframe
          ref={iframeRef}
          src={`./templates/${templateId}/template.html`}
          title="Auto Mode Preview"
          onLoad={handleIframeLoad}
          style={{
            width: '794px',
            height: '1123px',
            border: 'none',
            background: '#fff',
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        />

        {/* Loading overlay */}
        {!photoReady && !noPhotos && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15,10,22,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            gap: '12px',
          }}>
            <div style={{
              width: '40px', height: '40px',
              border: '3px solid rgba(255,255,255,0.2)',
              borderTop: '3px solid #FF4D8D',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Loading latest photo...</span>
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* No photos message */}
        {noPhotos && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15,10,22,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            gap: '12px',
            padding: '24px',
            textAlign: 'center',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
            <span style={{ fontWeight: 600 }}>No photos found</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Add images to your Pictures folder, then click Refresh
            </span>
          </div>
        )}
      </div>

      {/* ── Bottom Action Bar ── */}
      <div style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        zIndex: 20,
      }}>
        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          title="Reload latest photo"
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(16px)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'rotate(180deg) scale(1.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'rotate(0deg) scale(1)'; }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>

        {/* Confirm & Print button */}
        <button
          onClick={handleConfirmAndPrint}
          disabled={isPrinting || !photoReady}
          style={{
            padding: '16px 48px',
            borderRadius: '32px',
            border: 'none',
            background: (isPrinting || !photoReady)
              ? 'rgba(255,255,255,0.1)'
              : 'linear-gradient(135deg, #FF7A59, #FF4D8D, #A855F7)',
            color: '#fff',
            fontSize: '1.1rem',
            fontWeight: 700,
            cursor: (isPrinting || !photoReady) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            transition: 'all 0.3s',
            boxShadow: (isPrinting || !photoReady)
              ? 'none'
              : '0 8px 32px rgba(255,77,141,0.5)',
            opacity: (isPrinting || !photoReady) ? 0.5 : 1,
            animation: photoReady && !isPrinting ? 'autoModePulse 2s ease-in-out infinite' : 'none',
          }}
          onMouseEnter={e => {
            if (!isPrinting && photoReady) {
              e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
              e.currentTarget.style.boxShadow = '0 12px 40px rgba(255,77,141,0.6)';
            }
          }}
          onMouseLeave={e => {
            if (!isPrinting && photoReady) {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(255,77,141,0.5)';
            }
          }}
        >
          {isPrinting ? (
            <>
              <div style={{
                width: '20px', height: '20px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTop: '2px solid #fff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              Printing...
            </>
          ) : (
            <>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Confirm
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AutoModePage;
