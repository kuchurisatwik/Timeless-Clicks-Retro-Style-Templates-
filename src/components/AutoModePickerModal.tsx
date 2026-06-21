import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Sparkles } from 'lucide-react';
import { templateCategories, getCategoryIcon, AI_OPTIMIZED } from '../data/templateData';

interface AutoModePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AutoModePickerModal: React.FC<AutoModePickerModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('All Templates');

  const activeTemplates = templateCategories.find(c => c.name === activeCategory)?.templates || templateCategories[0].templates;

  const handleSelectTemplate = (templateId: string) => {
    // Persist the auto mode template selection
    localStorage.setItem('auto_mode_template', templateId);
    onClose();
    navigate(`/auto/${templateId}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 10, 22, 0.90)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
            style={{
              width: '100%',
              maxWidth: '1100px',
              height: '85vh',
              maxHeight: '900px',
              background: 'linear-gradient(135deg, rgba(20, 15, 30, 0.98), rgba(30, 20, 45, 0.98))',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '28px',
              boxShadow: '0 30px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(255, 77, 141, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '24px 28px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(to right, rgba(255,77,141,0.08), rgba(168,85,247,0.08), transparent)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px', height: '44px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(255,77,141,0.3), rgba(168,85,247,0.3))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(255,77,141,0.2)',
                }}>
                  <Zap size={22} color="#FF4D8D" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#fff', fontWeight: 700 }} className="heading-font">
                    Auto Mode
                  </h2>
                  <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Select a template for one-click printing
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '50%',
                  width: '40px', height: '40px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Category Tabs */}
            <div style={{
              padding: '16px 28px',
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              flexShrink: 0,
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              {templateCategories.map(cat => {
                const isActive = activeCategory === cat.name;
                return (
                  <button
                    key={cat.name}
                    onClick={() => setActiveCategory(cat.name)}
                    style={{
                      position: 'relative',
                      background: isActive ? 'linear-gradient(135deg, rgba(255,122,89,0.8), rgba(255,77,141,0.8))' : 'rgba(255,255,255,0.04)',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${isActive ? 'rgba(255,77,141,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      padding: '8px 14px',
                      borderRadius: '24px',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontWeight: isActive ? 600 : 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      outline: 'none',
                      boxShadow: isActive ? '0 4px 12px rgba(255,77,141,0.3)' : 'none',
                    }}
                  >
                    {getCategoryIcon(cat.name)}
                    <span>{cat.name}</span>
                    <span style={{
                      background: isActive ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.06)',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      fontSize: '0.7rem',
                    }}>
                      {cat.templates.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Template Grid */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px 28px',
            }} className="hide-scrollbar">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '20px',
              }}>
                {activeTemplates.map((id) => {
                  const isAI = AI_OPTIMIZED.has(id);
                  return (
                    <motion.div
                      key={id}
                      whileHover={{ scale: 1.04, y: -4 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleSelectTemplate(id)}
                      style={{
                        aspectRatio: '794 / 1123',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        position: 'relative',
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: '#fff',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                        transition: 'box-shadow 0.3s',
                      }}
                    >
                      <img
                        src={`./previews/${id}.webp`}
                        alt={`${id} preview`}
                        loading="lazy"
                        decoding="async"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition: 'top center',
                          display: 'block',
                        }}
                      />

                      {/* AI badge */}
                      {isAI && (
                        <div style={{
                          position: 'absolute',
                          top: '10px', left: '10px',
                          background: 'linear-gradient(135deg, rgba(255,77,141,0.9), rgba(168,85,247,0.9))',
                          color: '#fff',
                          padding: '4px 10px',
                          borderRadius: '16px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        }}>
                          <Sparkles size={10} /> AI
                        </div>
                      )}

                      {/* Hover overlay */}
                      <div
                        className="auto-pick-overlay"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'linear-gradient(to top, rgba(255,77,141,0.6) 0%, rgba(168,85,247,0.3) 50%, transparent 100%)',
                          opacity: 0,
                          transition: 'opacity 0.25s',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-end',
                          padding: '16px',
                        }}
                      >
                        <div style={{
                          background: 'rgba(255,255,255,0.15)',
                          backdropFilter: 'blur(8px)',
                          borderRadius: '12px',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                        }}>
                          <Zap size={16} /> Use in Auto Mode
                        </div>
                      </div>

                      {/* Bottom label */}
                      <div style={{
                        position: 'absolute',
                        bottom: 0, left: 0, right: 0,
                        padding: '12px 14px',
                        background: 'linear-gradient(to top, rgba(15,10,22,0.95), transparent)',
                      }}>
                        <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                          {id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </h4>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 28px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(0,0,0,0.2)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {activeTemplates.length} templates available
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={14} color="#FF4D8D" /> Select a template to start auto-printing
              </span>
            </div>
          </motion.div>

          <style>{`
            .auto-pick-overlay { opacity: 0; transition: opacity 0.25s; }
            div:hover > .auto-pick-overlay { opacity: 1; }
          `}</style>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AutoModePickerModal;
