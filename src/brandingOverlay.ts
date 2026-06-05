/**
 * brandingOverlay.ts
 *
 * Injects Timeless Clicks branding elements (logo, watermark)
 * into the template iframe at runtime.
 *
 * ── Design Principles ──
 * • Zero modification to template HTML files
 * • pointer-events: none — never interferes with editing
 * • Not marked data-editable — invisible to AI Director & undo/redo
 * • Idempotent — safe to call multiple times (cleans up first)
 * • Print & export compatible via html2canvas capture
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface PlacementResult {
  watermark: Corner;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BRANDING_CLASS = 'tc-branding-overlay';
const STYLES_ID = 'tc-branding-styles';
const CONTAINER_WIDTH = 794;
const CONTAINER_HEIGHT = 1123;

const MARGIN = 15; // edge margin from poster border
const INNER_MARGIN = 8; // padding inside element zone

// ─── Helpers ────────────────────────────────────────────────────────────────

function getOccupiedRects(iframeDoc: Document, container: HTMLElement): Rect[] {
  const rects: Rect[] = [];
  const containerRect = container.getBoundingClientRect();

  // Collect all content elements that branding must avoid
  const selectors = [
    '[data-editable="text"]',
    '[data-editable="image"]',
    'img:not(.tc-branding-overlay)',
    '.image-upload-box',
    '.image-preview-container',
    'svg:not(.tc-branding-overlay svg)',
    '.header-flourish-container',
    '.ticket-border-svg',
    '.text-layer',
  ];

  selectors.forEach((sel) => {
    iframeDoc.querySelectorAll(sel).forEach((el) => {
      // Skip our own branding elements
      if ((el as HTMLElement).closest('.' + BRANDING_CLASS)) return;

      const r = el.getBoundingClientRect();
      // Convert to container-relative coordinates
      rects.push({
        top: r.top - containerRect.top,
        left: r.left - containerRect.left,
        right: r.right - containerRect.left,
        bottom: r.bottom - containerRect.top,
        width: r.width,
        height: r.height,
      });
    });
  });

  return rects;
}

function getCornerZone(corner: Corner, size: number): Rect {
  const m = MARGIN;
  switch (corner) {
    case 'top-left':
      return { top: m, left: m, right: m + size, bottom: m + size, width: size, height: size };
    case 'top-right':
      return { top: m, left: CONTAINER_WIDTH - m - size, right: CONTAINER_WIDTH - m, bottom: m + size, width: size, height: size };
    case 'bottom-left':
      return { top: CONTAINER_HEIGHT - m - size, left: m, right: m + size, bottom: CONTAINER_HEIGHT - m, width: size, height: size };
    case 'bottom-right':
      return { top: CONTAINER_HEIGHT - m - size, left: CONTAINER_WIDTH - m - size, right: CONTAINER_WIDTH - m, bottom: CONTAINER_HEIGHT - m, width: size, height: size };
  }
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function overlapScore(zone: Rect, occupied: Rect[]): number {
  let score = 0;
  for (const r of occupied) {
    if (rectsOverlap(zone, r)) {
      // Calculate overlap area
      const overlapX = Math.max(0, Math.min(zone.right, r.right) - Math.max(zone.left, r.left));
      const overlapY = Math.max(0, Math.min(zone.bottom, r.bottom) - Math.max(zone.top, r.top));
      score += overlapX * overlapY;
    }
  }
  return score;
}

function pickBestCorner(corners: Corner[], size: number, occupied: Rect[], exclude: Corner[] = []): Corner {
  const available = corners.filter((c) => !exclude.includes(c));
  let bestCorner = available[0];
  let bestScore = Infinity;

  for (const corner of available) {
    const zone = getCornerZone(corner, size + INNER_MARGIN * 2);
    const score = overlapScore(zone, occupied);
    if (score < bestScore) {
      bestScore = score;
      bestCorner = corner;
    }
  }

  return bestCorner;
}

function determinePlacements(occupied: Rect[]): PlacementResult {
  // 1. Watermark prefers bottom-right
  const watermark = pickBestCorner(
    ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
    60, // approximate watermark width
    occupied
  );

  return { watermark };
}

// ─── CSS Injection ──────────────────────────────────────────────────────────

function injectStyles(iframeDoc: Document): void {
  if (iframeDoc.getElementById(STYLES_ID)) return;

  const style = iframeDoc.createElement('style');
  style.id = STYLES_ID;
  style.textContent = `
    .${BRANDING_CLASS} {
      position: absolute;
      z-index: 99;
      pointer-events: none;
      user-select: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .tc-branding-watermark {
      font-size: 11px;
      letter-spacing: 1.5px;
      opacity: 0.2;
      font-weight: 600;
      text-transform: uppercase;
      white-space: nowrap;
    }

    @media print {
      .${BRANDING_CLASS} {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  `;
  iframeDoc.head.appendChild(style);
}

// ─── Element Builders ───────────────────────────────────────────────────────

function positionForCorner(corner: Corner): string {
  const m = MARGIN;
  switch (corner) {
    case 'top-left':
      return `top: ${m}px; left: ${m}px;`;
    case 'top-right':
      return `top: ${m}px; right: ${m}px;`;
    case 'bottom-left':
      return `bottom: ${m}px; left: ${m}px;`;
    case 'bottom-right':
      return `bottom: ${m}px; right: ${m}px;`;
  }
}



function createWatermarkElement(iframeDoc: Document, corner: Corner): HTMLElement {
  const el = iframeDoc.createElement('div');
  el.className = `${BRANDING_CLASS} tc-branding-watermark`;

  // Read the template's ink/text color for harmonious blending
  const rootStyles = iframeDoc.defaultView?.getComputedStyle(iframeDoc.documentElement);
  const inkColor = rootStyles?.getPropertyValue('--ink-color')?.trim() || '#1a1a1a';
  const fontSerif = rootStyles?.getPropertyValue('--font-serif')?.trim() || 'serif';

  el.style.cssText = `
    ${positionForCorner(corner)}
    color: ${inkColor};
    font-family: ${fontSerif};
  `;
  el.textContent = 'Timeless Clicks';
  return el;
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

function removeBranding(iframeDoc: Document): void {
  iframeDoc.querySelectorAll('.' + BRANDING_CLASS).forEach((el) => el.remove());
}

// ─── Main Export ────────────────────────────────────────────────────────────

/**
 * Injects branding overlay into a template iframe document.
 *
 * Idempotent — removes existing branding before re-injecting.
 * Must be called AFTER the iframe content has fully loaded.
 */
export function injectBrandingOverlay(iframeDoc: Document): void {
  // 1. Clean up any existing branding
  removeBranding(iframeDoc);

  // 2. Find the poster container
  const container = iframeDoc.querySelector('.poster-scale-container') as HTMLElement;
  if (!container) return;

  // Ensure container is positioned so absolute children are relative to it
  const computedPos = iframeDoc.defaultView?.getComputedStyle(container)?.position;
  if (computedPos !== 'relative' && computedPos !== 'absolute' && computedPos !== 'fixed') {
    container.style.position = 'relative';
  }

  // 3. Inject CSS
  injectStyles(iframeDoc);

  // 4. Analyze layout and determine placements
  const occupied = getOccupiedRects(iframeDoc, container);
  const placements = determinePlacements(occupied);

  // 5. Create and append branding elements
  container.appendChild(createWatermarkElement(iframeDoc, placements.watermark));
}

/**
 * Strips branding elements from the document.
 * Call before capturing editor state for undo/redo to keep
 * branding out of the history stack.
 */
export function stripBrandingOverlay(iframeDoc: Document): void {
  removeBranding(iframeDoc);
}
