import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, X, Upload } from 'lucide-react';
import { Preferences } from '@capacitor/preferences';

interface InboxModalProps {
  onClose: () => void;
  onSelectPhoto: (photoUrl: string) => void;
  onUploadFromDevice: () => void;
}

const InboxModal: React.FC<InboxModalProps> = ({ onClose, onSelectPhoto, onUploadFromDevice }) => {
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPhotos = async () => {
    try {
      const { value } = await Preferences.get({ key: '@downloaded_photos' });
      if (value) {
        const parsed = JSON.parse(value);
        setPhotos(parsed);
      }
    } catch (e) {
      console.error("Failed to load photos", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial load
    loadPhotos();

    // Poll every 2 seconds while modal is open
    const interval = setInterval(loadPhotos, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 10, 22, 0.8)',
      backdropFilter: 'blur(12px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        style={{
          width: '100%',
          maxWidth: '800px',
          height: '80vh',
          maxHeight: '800px',
          backgroundColor: 'var(--surface-color)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(to right, rgba(255,77,141,0.1), transparent)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px',
              borderRadius: '12px',
              backgroundColor: 'rgba(255,77,141,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FF4D8D'
            }}>
              <Camera size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }} className="heading-font">Camera Inbox</h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Photos downloaded from Canon R50
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              borderRadius: '50%',
              width: '36px', height: '36px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
        }} className="hide-scrollbar">
          
          {loading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              Loading photos...
            </div>
          ) : photos.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: '16px' }}>
              <Camera size={48} opacity={0.2} />
              <p>No photos downloaded yet.</p>
              <p style={{ fontSize: '0.85rem', maxWidth: '300px', textAlign: 'center' }}>Make sure your camera is connected and background polling is active.</p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '16px'
            }}>
              {photos.map((url, i) => (
                <div 
                  key={i}
                  onClick={() => onSelectPhoto(url)}
                  style={{
                    aspectRatio: '1',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    position: 'relative',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backgroundColor: '#000'
                  }}
                  className="inbox-photo-card"
                >
                  <img 
                    src={url} 
                    alt={`Downloaded ${i}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform 0.3s ease'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(255,77,141,0.2)',
                    opacity: 0,
                    transition: 'opacity 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }} className="hover-overlay">
                    <span style={{ 
                      backgroundColor: '#FF4D8D', 
                      color: '#fff', 
                      padding: '6px 12px', 
                      borderRadius: '20px', 
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      boxShadow: '0 4px 12px rgba(255,77,141,0.4)'
                    }}>Use Photo</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.2)'
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {photos.length} photos in inbox
          </span>
          <button
            onClick={onUploadFromDevice}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              backgroundColor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              transition: 'all 0.2s'
            }}
          >
            <Upload size={16} />
            Upload from Device
          </button>
        </div>
      </motion.div>
      <style>{`
        .inbox-photo-card:hover img {
          transform: scale(1.05);
        }
        .inbox-photo-card:hover .hover-overlay {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
};

export default InboxModal;
