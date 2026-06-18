import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DownloadCloud, RefreshCw, X } from 'lucide-react';

export default function AutoUpdater() {
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [releaseNotes, setReleaseNotes] = useState<string>('');
  const [version, setVersion] = useState<string>('');

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.updater;

  useEffect(() => {
    if (!isElectron) return;

    const cleanup = (window as any).electronAPI.updater.onEvent(({ type, data }: any) => {
      console.log('Updater Event:', type, data);
      
      switch (type) {
        case 'checking':
          // Optionally show checking status, but usually better to be silent unless manually triggered
          break;
        case 'update-available':
          setStatus('available');
          setVersion(data.version || 'New Version');
          setReleaseNotes(data.releaseNotes || 'Bug fixes and performance improvements.');
          break;
        case 'update-not-available':
          if (status === 'checking') {
             setStatus('not-available');
             setTimeout(() => setStatus(null), 3000);
          }
          break;
        case 'download-progress':
          setStatus('downloading');
          setProgress(Math.round(data.percent));
          break;
        case 'update-downloaded':
          setStatus('downloaded');
          break;
        case 'error':
          console.error('Update error:', data);
          setStatus(null);
          break;
      }
    });

    return cleanup;
  }, [isElectron, status]);

  if (!isElectron || !status || status === 'not-available' || status === 'checking') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -50, scale: 0.95 }}
        style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          width: '320px',
          background: 'rgba(20, 20, 25, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '20px',
          color: '#fff',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          fontFamily: 'Inter, sans-serif'
        }}
      >
        <button 
          onClick={() => setStatus(null)}
          style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ 
            width: '40px', height: '40px', borderRadius: '10px', 
            background: 'linear-gradient(135deg, #FF4D8D, #A855F7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {status === 'downloaded' ? <RefreshCw size={20} color="#fff" /> : <DownloadCloud size={20} color="#fff" />}
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Update Available</h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#aaa' }}>Version {version}</p>
          </div>
        </div>

        {status === 'available' && (
          <>
            <div style={{ 
              background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '12px', 
              fontSize: '0.85rem', color: '#ccc', marginBottom: '16px', maxHeight: '80px', overflowY: 'auto' 
            }}>
              <div dangerouslySetInnerHTML={{ __html: releaseNotes.replace(/\\n/g, '<br/>') }} />
            </div>
            <button
              onClick={() => {
                setStatus('downloading');
                (window as any).electronAPI.updater.download();
              }}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
                background: '#fff', color: '#000', fontWeight: 600, cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#eee'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            >
              Download Update
            </button>
          </>
        )}

        {status === 'downloading' && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#aaa', marginBottom: '8px' }}>
              <span>Downloading...</span>
              <span>{progress}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #FF4D8D, #A855F7)', transition: 'width 0.2s ease' }} />
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <div style={{ marginTop: '8px' }}>
            <p style={{ fontSize: '0.85rem', color: '#ccc', marginBottom: '16px' }}>
              The update is ready. Restart the application to apply the changes.
            </p>
            <button
              onClick={() => {
                (window as any).electronAPI.updater.install();
              }}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
                background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', 
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              Restart & Install
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
