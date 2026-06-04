const fs = require('fs');
const path = require('path');

const editorPath = path.join(__dirname, 'src', 'pages', 'EditorPage.tsx');
const scratchpadPath = path.join(__dirname, 'src', 'pages', 'scratchpad_editor.tsx');

const editorCode = fs.readFileSync(editorPath, 'utf8');
const scratchpadCode = fs.readFileSync(scratchpadPath, 'utf8');

// The scratchpad block starts at line 5: `export const EditorUIRender = \``
// The code itself starts at line 6 and ends at line 777.
// But let's just slice it programmatically.
const scratchLines = scratchpadCode.split('\n');
const startIdx = scratchLines.findIndex(line => line.includes('export const EditorUIRender = `'));
const endIdx = scratchLines.lastIndexOf('`');

if (startIdx === -1 || endIdx === -1) {
  console.error("Failed to find backticks in scratchpad");
  process.exit(1);
}

let newRenderBlock = scratchLines.slice(startIdx + 1, endIdx).join('\n');
// Because it's a template literal inside the scratchpad, we had backslashes escaping template strings.
newRenderBlock = newRenderBlock.replace(/\\`/g, '`').replace(/\\\$/g, '$');

// Find the start of the return block in EditorPage.tsx
const lines = editorCode.split('\n');
let returnStartIndex = -1;
let returnEndIndex = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === 'return (') {
    returnStartIndex = i;
  }
}

for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].trim() === '};') {
    returnEndIndex = i - 1;
    break;
  }
}

if (returnStartIndex === -1 || returnEndIndex === -1) {
  console.error('Failed to find return bounds');
  process.exit(1);
}

const beforeBlock = lines.slice(0, returnStartIndex).join('\n');
const afterBlock = lines.slice(returnEndIndex + 1).join('\n');

const newCode = beforeBlock + '\n' + newRenderBlock + '\n' + afterBlock;

fs.writeFileSync(editorPath, newCode);
console.log('Successfully updated EditorPage.tsx');
