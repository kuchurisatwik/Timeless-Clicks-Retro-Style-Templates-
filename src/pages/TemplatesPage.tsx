import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const templateCategories = [
  {
    name: 'All Templates',
    templates: Array.from({ length: 59 }, (_, i) => `template_${String(i + 1).padStart(2, '0')}`)
  },
  {
    name: 'Birthday',
    templates: ['template_09', 'template_11', 'template_13', 'template_14', 'template_15', 'template_31', 'template_32']
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
    templates: ['template_01', 'template_02', 'template_03', 'template_04', 'template_05', 'template_06', 'template_07', 'template_08', 'template_10', 'template_16', 'template_17', 'template_18', 'template_23', 'template_26', 'template_29', 'template_30', 'template_33', 'template_34', 'template_35', 'template_36', 'template_37', 'template_41', 'template_42', 'template_47']
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

const CARD_GAP = 36;

// A4 at 96 DPI = 794 × 1123 px
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;
const A4_RATIO = A4_WIDTH / A4_HEIGHT; // ~0.707

const TemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollX, setScrollX] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [activeCategory, setActiveCategory] = useState('All Templates');

  const activeTemplates = templateCategories.find(c => c.name === activeCategory)?.templates || templateCategories[0].templates;

  // Derived card dimensions: fit height to container, width from A4 ratio
  const cardHeight = Math.max(200, containerHeight - 120); // 120px for vertical padding
  const cardWidth = Math.round(cardHeight * A4_RATIO);

  // Measure container on mount / resize
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
        setContainerHeight(containerRef.current.offsetHeight);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Center the track initially so middle cards are visible, and reset on category change
  useEffect(() => {
    if (containerWidth > 0 && cardWidth > 0) {
      const totalTrackWidth = activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP;
      // Center them if possible, otherwise left align if there's very few
      if (totalTrackWidth <= containerWidth) {
        setScrollX((containerWidth - totalTrackWidth) / 2); // Center within view
      } else {
        const initialOffset = (totalTrackWidth - containerWidth) / 2;
        setScrollX(-initialOffset);
      }
    }
  }, [containerWidth, cardWidth, activeCategory, activeTemplates.length]);

  // Handle horizontal scroll via mouse wheel
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

  // Drag to scroll
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    const totalTrackWidth = activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP;
    if (totalTrackWidth <= containerWidth) return; // Disable drag if it all fits

    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartScroll.current = scrollX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    const totalTrackWidth = activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP;
    if (totalTrackWidth <= containerWidth) return;
    
    const minX = -(totalTrackWidth - containerWidth);
    const maxX = 0;
    setScrollX(Math.max(minX, Math.min(maxX, dragStartScroll.current + dx)));
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  // Arrow navigation — scroll by one card width
  const scrollByCard = (direction: 'left' | 'right') => {
    const step = cardWidth + CARD_GAP;
    setScrollX(prev => {
      const totalTrackWidth = activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP;
      if (totalTrackWidth <= containerWidth) return (containerWidth - totalTrackWidth) / 2;
      const minX = -(totalTrackWidth - containerWidth);
      const maxX = 0;
      const next = direction === 'left' ? prev + step : prev - step;
      return Math.max(minX, Math.min(maxX, next));
    });
  };

  // Compute overlay opacity per card based on distance from center
  const getOverlayOpacity = (index: number): number => {
    const totalTrackWidth = activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP;
    if (totalTrackWidth <= containerWidth) return 0; // Don't darken if everything fits on screen

    const cardCenter = index * (cardWidth + CARD_GAP) + cardWidth / 2 + scrollX;
    const viewCenter = containerWidth / 2;
    const distFromCenter = Math.abs(cardCenter - viewCenter);

    // Cards within ~1 card width of center get no overlay
    const clearRadius = cardWidth * 0.8;
    // Cards beyond ~2.5 card widths get full overlay
    const maxRadius = containerWidth / 2;

    if (distFromCenter <= clearRadius) return 0;
    if (distFromCenter >= maxRadius) return 0.85;

    const t = (distFromCenter - clearRadius) / (maxRadius - clearRadius);
    // Ease-in for smooth ramp
    return t * t * 0.85;
  };

  const showArrows = (activeTemplates.length * (cardWidth + CARD_GAP) - CARD_GAP) > containerWidth;

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'radial-gradient(ellipse at center, #1e293b 0%, #0f172a 70%)',
    }}>
      <header style={{ padding: '32px 40px 10px', textAlign: 'center', flexShrink: 0 }}>
        <h1 className="logo-title">
          Timeless Clicks
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', margin: 0, marginBottom: '24px' }}>
          Select a template to start generating
        </p>

        {/* Categories Tab Bar */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          maxWidth: '900px',
          margin: '0 auto'
        }}>
          {templateCategories.map(cat => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(cat.name)}
              style={{
                background: activeCategory === cat.name ? 'rgba(59,130,246,0.8)' : 'rgba(255,255,255,0.05)',
                color: activeCategory === cat.name ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${activeCategory === cat.name ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
                padding: '8px 16px',
                borderRadius: '24px',
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backdropFilter: 'blur(4px)',
                fontWeight: activeCategory === cat.name ? 600 : 400
              }}
              onMouseEnter={e => {
                if (activeCategory !== cat.name) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.color = '#fff';
                }
              }}
              onMouseLeave={e => {
                if (activeCategory !== cat.name) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              {cat.name} ({cat.templates.length})
            </button>
          ))}
        </div>
      </header>

      {/* Carousel container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          cursor: showArrows ? (isDragging.current ? 'grabbing' : 'grab') : 'default',
        }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Edge gradient overlays (purely decorative, over the entire viewport) */}
        {showArrows && (
          <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 2,
            background: 'linear-gradient(to right, rgba(15,23,42,0.95) 0%, transparent 25%, transparent 75%, rgba(15,23,42,0.95) 100%)',
          }} />
        )}

        {/* Left arrow */}
        {showArrows && (
          <button
            onClick={() => scrollByCard('left')}
            style={{
              position: 'absolute',
              left: '24px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 5,
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(30,41,59,0.7)',
              backdropFilter: 'blur(8px)',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(59,130,246,0.5)';
              e.currentTarget.style.borderColor = 'rgba(96,165,250,0.5)';
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(30,41,59,0.7)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
              e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {/* Right arrow */}
        {showArrows && (
          <button
            onClick={() => scrollByCard('right')}
            style={{
              position: 'absolute',
              right: '24px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 5,
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(30,41,59,0.7)',
              backdropFilter: 'blur(8px)',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(59,130,246,0.5)';
              e.currentTarget.style.borderColor = 'rgba(96,165,250,0.5)';
              e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(30,41,59,0.7)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
              e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {/* Card track */}
        <div
          ref={trackRef}
          style={{
            display: 'flex',
            gap: `${CARD_GAP}px`,
            transform: `translateX(${scrollX}px)`,
            transition: isDragging.current ? 'none' : 'transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)',
            padding: '24px 0',
            height: '100%',
            alignItems: 'center',
          }}
        >
          {activeTemplates.map((id, index) => {
            const overlay = getOverlayOpacity(index);
            const scale = 1 - overlay * 0.08; // slightly shrink darkened cards

            return (
              <div
                key={id}
                style={{
                  flex: `0 0 ${cardWidth}px`,
                  height: `${cardHeight}px`,
                  position: 'relative',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                  transform: `scale(${scale})`,
                  boxShadow: overlay < 0.2
                    ? '0 12px 40px rgba(0,0,0,0.4)'
                    : '0 4px 16px rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onClick={() => {
                  if (!isDragging.current) navigate(`/editor/${id}`);
                }}
                onMouseEnter={e => {
                  if (overlay < 0.3) {
                    e.currentTarget.style.transform = `scale(${scale * 1.03})`;
                    e.currentTarget.style.boxShadow = '0 16px 50px rgba(59,130,246,0.2)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = `scale(${scale})`;
                  e.currentTarget.style.boxShadow = overlay < 0.2
                    ? '0 12px 40px rgba(0,0,0,0.4)'
                    : '0 4px 16px rgba(0,0,0,0.2)';
                }}
              >
                {/* Card preview */}
                <div style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(160deg, #1e293b, #334155)',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  {/* Scaled iframe preview of the actual template */}
                  <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    <iframe
                      src={`/templates/${id}/template.html`}
                      title={`${id} preview`}
                      tabIndex={-1}
                      style={{
                        width: `${A4_WIDTH}px`,
                        height: `${A4_HEIGHT}px`,
                        border: 'none',
                        transform: `scale(${cardWidth / A4_WIDTH})`,
                        transformOrigin: 'top left',
                        pointerEvents: 'none',
                        background: '#fff',
                      }}
                    />
                  </div>

                  <div style={{
                    padding: '14px 18px',
                    background: 'rgba(15,23,42,0.7)',
                    backdropFilter: 'blur(6px)',
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                  }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                      {id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </h3>
                    <p style={{ margin: '3px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {activeCategory === 'All Templates' ? 'Template Layout' : activeCategory}
                    </p>
                  </div>
                </div>

                {/* Per-card darkening overlay */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: `rgba(10, 15, 30, ${overlay})`,
                  pointerEvents: 'none',
                  transition: 'background 0.2s ease',
                  borderRadius: '16px',
                }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Scroll hint */}
      <div style={{
        textAlign: 'center',
        padding: '16px 0 32px',
        color: 'var(--text-secondary)',
        fontSize: '0.85rem',
        opacity: showArrows ? 0.6 : 0, // hide hint if no scroll
      }}>
        ← Scroll or drag to browse →
      </div>
    </div>
  );
};

export default TemplatesPage;
