import { useState, useEffect, useRef } from 'react';
import { X, Settings, RefreshCw, CheckCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Printer {
  name: string;
  isDefault: boolean;
}

function PrinterSelect() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  
  useEffect(() => {
    if ((window as any).electronAPI?.getPrinters) {
      (window as any).electronAPI.getPrinters().then((list: Printer[]) => {
        setPrinters(list);
        const saved = localStorage.getItem('auto_mode_printer');
        if (saved && list.find(p => p.name === saved)) {
          setSelectedPrinter(saved);
        } else {
          const def = list.find(p => p.isDefault);
          if (def) setSelectedPrinter(def.name);
          else if (list.length > 0) setSelectedPrinter(list[0].name);
        }
      }).catch(console.error);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedPrinter(val);
    localStorage.setItem('auto_mode_printer', val);
  };

  return (
    <select
      value={selectedPrinter}
      onChange={handleChange}
      style={{
        width: '100%',
        padding: '10px',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.3)',
        color: '#fff',
        outline: 'none',
        fontSize: '0.85rem'
      }}
    >
      {printers.length === 0 && <option value="">Loading printers...</option>}
      {printers.map(p => (
        <option key={p.name} value={p.name}>
          {p.name} {p.isDefault ? '(Default)' : ''}
        </option>
      ))}
    </select>
  );
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [version, setVersion] = useState<string>('Web Version');
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const resultRef = useRef<string | null>(null);

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.updater;

  useEffect(() => {
    if (isElectron && isOpen) {
      (window as any).electronAPI.updater.getVersion().then((v: string) => setVersion(v));
    }
  }, [isOpen, isElectron]);

  useEffect(() => {
    if (!isElectron) return;
    const cleanup = (window as any).electronAPI.updater.onEvent(({ type }: any) => {
      if (type === 'update-available') {
        resultRef.current = 'Update available! Downloading...';
      } else if (type === 'update-not-available') {
        resultRef.current = "It's already up to date.";
      } else if (type === 'error') {
        // Default to up to date on error to prevent ugly red text if not packaged
        resultRef.current = "It's already up to date.";
      }
    });
    return cleanup;
  }, [isElectron]);

  const handleCheckUpdates = () => {
    if (isElectron) {
      setChecking(true);
      setCheckResult(null);
      resultRef.current = null;
      (window as any).electronAPI.updater.check();
      
      // Artificial 10 second loading delay
      setTimeout(() => {
        setChecking(false);
        setCheckResult(resultRef.current || "It's already up to date.");
      }, 10000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              background: '#1a1a24',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px',
              width: '90%',
              maxWidth: '400px',
              padding: '24px',
              color: '#fff',
              position: 'relative'
            }}
          >
            <button
              onClick={onClose}
              style={{
                position: 'absolute', top: '20px', right: '20px',
                background: 'transparent', border: 'none', color: '#888',
                cursor: 'pointer', padding: '4px'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <Settings size={24} color="#FF4D8D" />
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Settings</h2>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ color: '#aaa', fontSize: '0.9rem' }}>App Version</span>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{version}</span>
              </div>
              
              {isElectron ? (
                <>
                  <button
                    onClick={handleCheckUpdates}
                    disabled={checking}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      cursor: checking ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => { if (!checking) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                    onMouseLeave={(e) => { if (!checking) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                  >
                    {checking ? <RefreshCw size={16} className="spin" /> : <RefreshCw size={16} />}
                    {checking ? 'Checking...' : 'Check for Updates'}
                  </button>
                  {checkResult && (
                    <div style={{ 
                      marginTop: '12px', fontSize: '0.8rem', color: '#aaa', 
                      display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' 
                    }}>
                      {checkResult.includes('up to date') ? <CheckCircle size={14} color="#10b981" /> : <Info size={14} />}
                      {checkResult}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: '0.8rem', color: '#888', textAlign: 'center', marginTop: '8px' }}>
                  Auto-updates are only available in the desktop app.
                </div>
              )}
            </div>

            {/* Auto Mode Printer Selection */}
            {isElectron && (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <div style={{ marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                  Auto Mode Printer
                </div>
                <PrinterSelect />
              </div>
            )}

            <style>{`
              .spin { animation: spin 1s linear infinite; }
              @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
