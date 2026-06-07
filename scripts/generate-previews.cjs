/**
 * Generate static preview images for all templates.
 * 
 * Usage: 
 *   1. Start the dev server: npm run dev
 *   2. Run: node scripts/generate-previews.js
 * 
 * This opens each template HTML in a headless browser, 
 * takes a screenshot, and saves it as a WebP image.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'public', 'templates');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'previews');
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

async function run() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Get all template directories
  const templateDirs = fs.readdirSync(TEMPLATES_DIR)
    .filter(name => name.startsWith('template_'))
    .sort();

  console.log(`Found ${templateDirs.length} templates. Generating previews...\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  for (const dir of templateDirs) {
    const templateFile = path.join(TEMPLATES_DIR, dir, 'template.html');
    if (!fs.existsSync(templateFile)) {
      console.log(`⚠  Skipping ${dir}: no template.html found`);
      continue;
    }

    const outputFile = path.join(OUTPUT_DIR, `${dir}.webp`);
    
    // Skip if preview already exists and is recent
    if (fs.existsSync(outputFile)) {
      const templateStat = fs.statSync(templateFile);
      const previewStat = fs.statSync(outputFile);
      if (previewStat.mtimeMs > templateStat.mtimeMs) {
        console.log(`✓  ${dir} — up to date, skipping`);
        continue;
      }
    }

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: A4_WIDTH, height: A4_HEIGHT });
      
      // Load the template file directly
      const fileUrl = `file:///${templateFile.replace(/\\/g, '/')}`;
      await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 15000 });
      
      // Wait a bit for fonts and images to load
      await new Promise(r => setTimeout(r, 1500));

      // Take screenshot
      await page.screenshot({
        path: outputFile,
        type: 'webp',
        quality: 80,
        clip: { x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT },
      });
      
      await page.close();
      console.log(`✓  ${dir} — saved`);
    } catch (err) {
      console.error(`✗  ${dir} — error: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\nDone! Previews saved to: ${OUTPUT_DIR}`);
}

run().catch(console.error);
