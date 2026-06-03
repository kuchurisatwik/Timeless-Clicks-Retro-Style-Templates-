import sharp from 'sharp';
import fs from 'fs';

async function generateCircularIcon() {
  const input = 'logo.jpeg';
  const size = 1024; // Capacitor recommends 1024x1024
  const radius = size / 2;

  if (!fs.existsSync('assets')) {
    fs.mkdirSync('assets');
  }

  // Create an SVG mask to crop the image into a circle
  const circleSvg = `<svg width="${size}" height="${size}"><circle cx="${radius}" cy="${radius}" r="${radius}"/></svg>`;

  await sharp(input)
    .resize(size, size, { fit: 'cover' })
    .composite([{
      input: Buffer.from(circleSvg),
      blend: 'dest-in'
    }])
    .png()
    .toFile('assets/icon.png');

  console.log('Icon cropped and saved successfully at assets/icon.png');
}

generateCircularIcon().catch(console.error);
