const fs = require('fs');
const path = 'C:/Users/sathwik.kusuri/Documents/Timeless Clicks/src/pages/TemplatesPage.tsx';
let code = fs.readFileSync(path, 'utf8');
code = code.trim();
if (code.startsWith('"') && code.endsWith('"')) {
    const unescaped = JSON.parse(code);
    fs.writeFileSync(path, unescaped);
    console.log('Unescaped successfully.');
} else {
    console.log('Not starting with quotes. First 10 chars:', code.substring(0, 10));
}
