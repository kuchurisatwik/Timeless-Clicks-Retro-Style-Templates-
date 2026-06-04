const fs = require('fs');
const path = require('path');

const templatesDir = path.join(__dirname, 'public', 'templates');

// Regex to find the <img> tags
// It handles attributes in varying orders, capturing the id and src (if any).
const imgRegex = /<img\s+(?:[^>]*?\s+)?id="([^"]+)"\s+(?:[^>]*?\s+)?class="image-preview"\s+(?:[^>]*?\s+)?src="([^"]*)"[^>]*>/g;
const imgRegexAlt = /<img\s+(?:[^>]*?\s+)?class="image-preview"\s+(?:[^>]*?\s+)?id="([^"]+)"\s+(?:[^>]*?\s+)?src="([^"]*)"[^>]*>/g;
// More robust regex since order of attributes varies
const generalImgRegex = /<img([^>]+)>/g;

function migrateTemplate(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;

  // Replace CSS
  // Find `.image-preview { ... }` block
  const cssRegex = /\.image-preview\s*\{([^}]+)\}/g;
  content = content.replace(cssRegex, (match, cssBody) => {
    let newCssBody = cssBody;
    // Replace object-fit: cover with background-size: cover
    newCssBody = newCssBody.replace(/object-fit:\s*cover;/g, 'background-size: cover; background-position: center; background-repeat: no-repeat;');
    // Replace object-position: ... with background-position: ...
    newCssBody = newCssBody.replace(/object-position:\s*([^;]+);/g, 'background-position: $1;');
    return `.image-preview {${newCssBody}}`;
  });

  // Replace HTML <img> with <div>
  content = content.replace(generalImgRegex, (match, attrs) => {
    if (attrs.includes('class="image-preview"')) {
      const idMatch = attrs.match(/id="([^"]+)"/);
      const srcMatch = attrs.match(/src="([^"]*)"/);
      const idStr = idMatch ? `id="${idMatch[1]}"` : '';
      const srcStr = srcMatch && srcMatch[1] ? `style="background-image: url('${srcMatch[1]}');"` : '';
      
      return `<div ${idStr} class="image-preview" ${srcStr}></div>`;
    }
    return match;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Migrated ${filePath}`);
  }
}

function run() {
  const dirs = fs.readdirSync(templatesDir);
  for (const dir of dirs) {
    const templatePath = path.join(templatesDir, dir, 'template.html');
    if (fs.existsSync(templatePath)) {
      migrateTemplate(templatePath);
    }
  }
}

run();
