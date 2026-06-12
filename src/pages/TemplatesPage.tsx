import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Grid, Gift, Heart, BookOpen, Newspaper, Quote, GraduationCap, Zap, Eye, Sparkles, PenTool } from 'lucide-react';

const templateCategories = [
  {
    name: 'All Templates',
    templates: Array.from({ length: 61 }, (_, i) => `template_${String(i + 1).padStart(2, '0')}`).filter(id => id !== 'template_30' && id !== 'template_31')
  },
  {
    name: 'Birthday',
    templates: ['template_09', 'template_11', 'template_13', 'template_14', 'template_15', 'template_32']
  },
  {
    name: 'Wedding & Romance',
    templates: ['template_28', 'template_38', 'template_40']
  },
  {
    name: 'Magazine & Fashion',
    templates: ['template_12', 'template_19', 'template_20', 'template_21', 'template_22', 'template_24', 'template_25', 'template_27', 'template_39', 'template_43', 'template_44']
  },
  {
    name: 'Newspaper & Editorial',
    templates: ['template_01', 'template_02', 'template_03', 'template_04', 'template_05', 'template_06', 'template_07', 'template_08', 'template_10', 'template_16', 'template_17', 'template_18', 'template_23', 'template_26', 'template_29', 'template_33', 'template_34', 'template_35', 'template_36', 'template_37', 'template_41', 'template_42', 'template_47', 'template_60', 'template_61']
  },
  {
    name: 'Quotes & Motivation',
    templates: ['template_45', 'template_46']
  },
  {
    name: 'Graduation',
    templates: ['template_48', 'template_49']
  },
  {
    name: 'Comics & Superheroes',
    templates: ['template_50', 'template_51', 'template_52', 'template_53', 'template_54', 'template_55', 'template_56', 'template_57', 'template_58', 'template_59']
  }
];

const getCategoryIcon = (name: string) => {
  switch (name) {
    case 'All Templates': return <Grid size={16} />;
    case 'Birthday': return <Gift size={16} />;
    case 'Wedding & Romance': return <Heart size={16} />;
    case 'Magazine & Fashion': return <BookOpen size={16} />;
    case 'Newspaper & Editorial': return <Newspaper size={16} />;
    case 'Quotes & Motivation': return <Quote size={16} />;
    case 'Graduation': return <GraduationCap size={16} />;
    case 'Comics & Superheroes': return <Zap size={16} />;
    default: return <Grid size={16} />;
  }
};

const CARD_GAP = 32;
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;
const A4_RATIO = A4_WIDTH / A4_HEIGHT;

const AI_OPTIMIZED = new Set(['template_01', 'template_12', 'template_28', 'template_38', 'template_50', 'template_60', 'template_61']);

// ─────────────────────────────────────────────────
// CSS-only Particles (no framer-motion, no state)
// ─────────────────────────────────────────────────
const PARTICLE_STYLE = `
@keyframes particleDrift {
  0%   { transform: translateY(0); opacity: 0; }
  15%  { opacity: var(--p-opacity); }
  85%  { opacity: var(--p-opacity); }
  100% { transform: translateY(-18vh); opacity: 0; }
}
.css-particle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255,255,255,0.7);
  box-shadow: 0 0 6px rgba(255,255,255,0.5);
  animation: particleDrift var(--p-dur) linear var(--p-delay) infinite;
  will-change: transform, opacity;
}

/* ── Card hover handled entirely in CSS ── */
.tmpl-card {
  will-change: transform;
  contain: layout style paint;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.tmpl-card:hover {
  transform: translateY(-8px) scale(1.03) !important;
  box-shadow: 0 20px 50px rgba(255,77,141,0.3) !important;
  z-index: 5;
}
.tmpl-card .hover-overlay {
  opacity: 0;
  transition: opacity 0.25s ease;
}
.tmpl-card:hover .hover-overlay {
  opacity: 1;
}
.tmpl-card .bottom-bar {
  transition: opacity 0.25s ease;
}
.tmpl-card:hover .bottom-bar {
  opacity: 0;
}
.tmpl-card .fav-btn {
  opacity: 0;
  transition: opacity 0.2s ease;
}
.tmpl-card:hover .fav-btn,
.tmpl-card .fav-btn.fav-active {
  opacity: 1;
}
.tmpl-card .hover-content {
  transform: translateY(10px);
  transition: transform 0.3s ease;
}
.tmpl-card:hover .hover-content {
  transform: translateY(0);
}
`;

// Build 25 particle definitions deterministically (no Math.random in render)
const PARTICLES = Array.from({ length: 25 }, (_, i) => ({
  left: `${(i * 17 + 3) % 100}vw`,
  top: `${(i * 31 + 7) % 100}vh`,
  size: (i % 3) + 1,
  dur: (i % 12) + 16,
  delay: i % 6,
  opacity: 0.15 + (i % 5) * 0.07,
}));

const CSSParticles = React.memo(() => (
  <div className="bg-layer" style={{ zIndex: 0 }}>
    {PARTICLES.map((p, i) => (
      <div
        key={i}
        className="css-particle"
        style={{
          left: p.left,
          top: p.top,
          width: p.size,
          height: p.size,
          '--p-dur': `${p.dur}s`,
          '--p-delay': `${p.delay}s`,
          '--p-opacity': p.opacity,
        } as React.CSSProperties}
      />
    ))}
  </div>
));

const BackgroundLayers = React.memo(() => (
  <>
    <div className="bg-layer blob blob-1" />
    <div className="bg-layer blob blob-2" />
    <div className="bg-layer blob blob-3" />
    <div className="bg-layer aurora-waves" />
    <CSSParticles />
    <div className="bg-layer noise-overlay" />
  </>
));

// ─────────────────────────────────────────────────
// Individual Card — React.memo to prevent re-renders
// ─────────────────────────────────────────────────
interface CardProps {
  id: string;
  cardWidth: number;
  cardHeight: number;
  overlay: number;
  scale: number;
  isMobile: boolean;
  isFavorite: boolean;
  activeCategory: string;
  toggleFavorite: (e: React.MouseEvent, id: string) => void;
  onNavigate: (id: string) => void;
}

const TemplateCard = React.memo(({
  id, cardWidth, cardHeight, overlay, scale, isMobile,
  isFavorite, activeCategory, toggleFavorite, onNavigate,
}: CardProps) => {
  const isAI = AI_OPTIMIZED.has(id);

  return (
    <div
      className="tmpl-card"
      style={{
        flex: `0 0 ${cardWidth}px`,
        height: `${cardHeight}px`,
        position: 'relative',
        borderRadius: '20px',
        overflow: 'hidden',
        cursor: 'pointer',
        scrollSnapAlign: isMobile ? 'center' : 'none',
        border: '1px solid var(--border-color)',
        background: '#fff',
        transform: `scale(${scale})`,
        boxShadow: overlay < 0.2
          ? '0 20px 40px rgba(0,0,0,0.4)'
          : '0 10px 20px rgba(0,0,0,0.2)',
      }}
      onClick={() => onNavigate(id)}
    >
      {/* Static preview image — replaces expensive iframe rendering */}
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
          background: '#fff',
          display: 'block',
        }}
      />

      {/* Top Badges */}
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        right: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        {isAI ? (
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,77,141,0.9), rgba(168,85,247,0.9))',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}>
            <Sparkles size={12} /> AI Optimized
          </div>
        ) : <div />}

        <button
          className={`fav-btn${isFavorite ? ' fav-active' : ''}`}
          onClick={(e) => toggleFavorite(e, id)}
          style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: isFavorite ? '#FF4D8D' : '#fff',
            transition: 'all 0.2s',
          }}
        >
          <Heart size={18} fill={isFavorite ? '#FF4D8D' : 'none'} />
        </button>
      </div>

      {/* Hover Overlay — CSS-driven, no React state */}
      <div
        className="hover-overlay"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(15,10,22,0.9) 0%, rgba(15,10,22,0.4) 50%, rgba(15,10,22,0) 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '24px',
        }}
      >
        <div className="hover-content">
          <h3 className="heading-font" style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            {id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </h3>
          <p style={{ margin: '4px 0 16px 0', color: 'var(--secondary-1)', fontSize: '0.9rem', fontWeight: 500 }}>
            {activeCategory === 'All Templates' ? 'Premium Layout' : activeCategory}
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" style={{ flex: 1, padding: '12px' }}>
              <PenTool size={16} /> Use Template
            </button>
            <button className="btn-secondary" style={{ padding: '12px' }} onClick={(e) => { e.stopPropagation(); onNavigate(id); }}>
              <Eye size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Default Bottom Bar (hidden on hover via CSS) */}
      <div className="bottom-bar" style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        padding: '16px 20px',
        background: 'linear-gradient(to top, rgba(15,10,22,0.95), rgba(15,10,22,0))',
      }}>
        <h3 className="heading-font" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: '#fff' }}>
          {id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </h3>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          {activeCategory === 'All Templates' ? 'Premium Layout' : activeCategory}
        </p>
      </div>

      {/* Per-card darkening overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `rgba(15,10,22,${overlay})`,
        pointerEvents: 'none',
        transition: 'background 0.2s ease',
      }} />
    </div>
  );
});

// CCAPI camera automation disabled — uncomment when camera integration is needed
// import { startCameraAutomation, stopCameraAutomation, isCameraAutomationRunning, addCameraStatusListener, getCameraIp, setCameraIp } from '../services/CameraService';

const TemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [scrollX, setScrollX] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [activeCategory, setActiveCategory] = useState('All Templates');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // CCAPI camera automation disabled — uncomment when camera integration is needed
  // const [isPolling, setIsPolling] = useState(isCameraAutomationRunning());

  // useEffect(() => {
  //   const removeListener = addCameraStatusListener((status) => {
  //     setIsPolling(status);
  //   });
  //   return () => removeListener();
  // }, []);

  // const togglePolling = async () => {
  //   if (isPolling) {
  //     stopCameraAutomation();
  //   } else {
  //     const currentIp = await getCameraIp();
  //     const ip = window.prompt('Enter Canon R50 IP Address:', currentIp);
  //     if (ip && ip.trim().length > 0) {
  //       await setCameraIp(ip.trim());
  //       startCameraAutomation();
  //     }
  //   }
  // };

  const activeTemplates = templateCategories.find(c => c.name === activeCategory)?.templates || templateCategories[0].templates;

  const cardHeight = Math.max(220, containerHeight - 80);
  const cardWidth = Math.round(cardHeight * A4_RATIO);

  // ── Measure ──
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
        setContainerHeight(containerRef.current.offsetHeight);
      }
      setIsMobile(window.innerWidth <= 768);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ── Center on category change ──
  useEffect(() => {
    if (containerWidth > 0 && cardWidth > 0) {
      const totalTrackWidth = activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP;
      if (totalTrackWidth <= containerWidth) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setScrollX((containerWidth - totalTrackWidth) / 2);
      } else {
        const initialOffset = (totalTrackWidth - containerWidth) / 2;
        setScrollX(-initialOffset);
      }
    }
  }, [containerWidth, cardWidth, activeCategory, activeTemplates.length]);

  // ── Wheel scroll ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    setScrollX(prev => {
      const totalTrackWidth = activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP;
      if (totalTrackWidth <= containerWidth) return (containerWidth - totalTrackWidth) / 2;
      const minX = -(totalTrackWidth - containerWidth);
      const maxX = 0;
      return Math.max(minX, Math.min(maxX, prev - delta));
    });
  }, [containerWidth, cardWidth, activeTemplates.length]);

  // ── Drag ──
  const isDraggingRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const totalTrackWidth = activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP;
    if (totalTrackWidth <= containerWidth) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartScroll.current = scrollX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [activeTemplates.length, cardWidth, containerWidth, scrollX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartX.current;
    const totalTrackWidth = activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP;
    if (totalTrackWidth <= containerWidth) return;
    const minX = -(totalTrackWidth - containerWidth);
    const maxX = 0;
    setScrollX(Math.max(minX, Math.min(maxX, dragStartScroll.current + dx)));
  }, [activeTemplates.length, cardWidth, containerWidth]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  // ── Arrow nav ──
  const scrollByCard = useCallback((direction: 'left' | 'right') => {
    const step = cardWidth + CARD_GAP;
    setScrollX(prev => {
      const totalTrackWidth = activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP;
      if (totalTrackWidth <= containerWidth) return (containerWidth - totalTrackWidth) / 2;
      const minX = -(totalTrackWidth - containerWidth);
      const maxX = 0;
      const next = direction === 'left' ? prev + step : prev - step;
      return Math.max(minX, Math.min(maxX, next));
    });
  }, [activeTemplates.length, cardWidth, containerWidth]);

  // ── Per-card overlay ──
  const getOverlayOpacity = useCallback((index: number): number => {
    const totalTrackWidth = activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP;
    if (totalTrackWidth <= containerWidth) return 0;
    const cardCenter = index * (cardWidth + CARD_GAP) + cardWidth / 2 + scrollX;
    const viewCenter = containerWidth / 2;
    const distFromCenter = Math.abs(cardCenter - viewCenter);
    const clearRadius = cardWidth * 0.9;
    const maxRadius = containerWidth / 1.8;
    if (distFromCenter <= clearRadius) return 0;
    if (distFromCenter >= maxRadius) return 0.8;
    const t = (distFromCenter - clearRadius) / (maxRadius - clearRadius);
    return t * t * 0.8;
  }, [activeTemplates.length, cardWidth, containerWidth, scrollX]);




  const showArrows = !isMobile && (activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP) > containerWidth;

  const toggleFavorite = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleNavigate = useCallback((id: string) => {
    if (!isDraggingRef.current) navigate(`/editor/${id}`);
  }, [navigate]);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Inject card hover CSS */}
      <style>{PARTICLE_STYLE}</style>

      <BackgroundLayers />

      {/* ─── Header (framer-motion OK here — one-shot) ─── */}
      <motion.header
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{
          padding: isMobile ? '30px 16px 10px' : '40px 40px 20px',
          textAlign: 'center',
          flexShrink: 0,
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <Sparkles color="var(--accent-2)" size={24} />
          <h1 className="logo-title heading-font" style={{ margin: 0 }}>
            Timeless Clicks
          </h1>
          <Sparkles color="var(--accent-3)" size={24} />
        </div>

        {/* CCAPI camera automation disabled — uncomment when camera integration is needed */}
        {/* <button 
          onClick={togglePolling}
          title={isPolling ? "Stop Camera Polling" : "Start Camera Polling"}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: isPolling ? '#10B981' : '#EF4444',
            border: '2px solid rgba(255,255,255,0.8)',
            boxShadow: isPolling ? '0 0 10px #10B981' : '0 0 10px #EF4444',
            cursor: 'pointer',
            padding: 0,
            transition: 'all 0.3s ease',
            zIndex: 100
          }}
        /> */}

        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '1.15rem',
          margin: 0,
          marginBottom: '32px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}>
          <span style={{ width: '40px', height: '1px', background: 'var(--border-color)' }} />
          Turn Moments Into Timeless Stories
          <span style={{ width: '40px', height: '1px', background: 'var(--border-color)' }} />
        </p>

        {/* Category Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          maxWidth: '1100px',
          margin: '0 auto',
        }}>
          {templateCategories.map(cat => {
            const isActive = activeCategory === cat.name;
            return (
              <button
                key={cat.name}
                onClick={() => setActiveCategory(cat.name)}
                style={{
                  position: 'relative',
                  background: isActive ? 'rgba(255,77,141,0.15)' : 'var(--surface-color)',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${isActive ? 'rgba(255,77,141,0.4)' : 'var(--border-color)'}`,
                  padding: '10px 18px',
                  borderRadius: '30px',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'color 0.3s',
                  backdropFilter: 'blur(8px)',
                  fontWeight: isActive ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  outline: 'none',
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(135deg, rgba(255,122,89,0.8), rgba(255,77,141,0.8))',
                      borderRadius: '30px',
                      zIndex: -1,
                      boxShadow: '0 4px 15px rgba(255,77,141,0.3)',
                    }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                {getCategoryIcon(cat.name)}
                <span>{cat.name}</span>
                <span style={{
                  background: isActive ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.08)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  marginLeft: '4px',
                }}>
                  {cat.templates.length}
                </span>
              </button>
            );
          })}
        </div>
      </motion.header>

      {/* ─── Gallery ─── */}
      <div
        ref={containerRef}
        className={isMobile ? "" : "hide-scrollbar"}
        style={{
          flex: 1,
          position: 'relative',
          overflowX: isMobile ? 'auto' : 'hidden',
          overflowY: 'hidden',
          scrollSnapType: isMobile ? 'x mandatory' : 'none',
          WebkitOverflowScrolling: 'touch',
          cursor: showArrows ? (isDragging ? 'grabbing' : 'grab') : 'default',
          zIndex: 10,
        }}
        onWheel={isMobile ? undefined : handleWheel}
        onPointerDown={isMobile ? undefined : handlePointerDown}
        onPointerMove={isMobile ? undefined : handlePointerMove}
        onPointerUp={isMobile ? undefined : handlePointerUp}
        onPointerLeave={isMobile ? undefined : handlePointerUp}
      >
        {/* Navigation Arrows */}
        {showArrows && (
          <button
            onClick={() => scrollByCard('left')}
            style={{
              position: 'absolute',
              left: '32px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 20,
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              border: '1px solid var(--border-color)',
              background: 'var(--surface-color)',
              backdropFilter: 'blur(12px)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {showArrows && (
          <button
            onClick={() => scrollByCard('right')}
            style={{
              position: 'absolute',
              right: '32px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 20,
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              border: '1px solid var(--border-color)',
              background: 'var(--surface-color)',
              backdropFilter: 'blur(12px)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {/* Card Track */}
        <div
          ref={trackRef}
          style={{
            display: 'flex',
            gap: `${CARD_GAP}px`,
            transform: isMobile ? 'none' : `translateX(${scrollX}px)`,
            transition: isDragging || isMobile ? 'none' : 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
            padding: isMobile ? `24px ${CARD_GAP}px` : '20px 0',
            height: '100%',
            alignItems: 'center',
            width: isMobile ? 'max-content' : 'auto',
            willChange: 'transform',
          }}
        >
          {activeTemplates.map((id, index) => {
            const overlay = isMobile ? 0 : getOverlayOpacity(index);
            const scale = isMobile ? 1 : 1 - overlay * 0.06;

            return (
              <TemplateCard
                key={id}
                id={id}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                overlay={overlay}
                scale={scale}
                isMobile={isMobile}
                isFavorite={favorites.has(id)}
                activeCategory={activeCategory}
                toggleFavorite={toggleFavorite}
                onNavigate={handleNavigate}
              />
            );
          })}
        </div>

        {/* Scroll indicator dots */}
        {showArrows && (
          <div style={{
            position: 'absolute',
            bottom: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '8px',
            zIndex: 20,
          }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{
                width: i === 0 ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: i === 0 ? 'var(--accent-2)' : 'var(--surface-color)',
                transition: 'all 0.3s',
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplatesPage;
