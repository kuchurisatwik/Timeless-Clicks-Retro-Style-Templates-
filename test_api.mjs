import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = "AIzaSyDkBlveqFiVRVMltgPByFTw8VW0kVQZ6Hg";
const genAI = new GoogleGenerativeAI(API_KEY);

async function test() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const textDict = {
      "headline": "The Newlywed Times",
      "wedding-title": "WEDDING OF THE YEAR"
    };
    
    const themeDict = {
      "--paper-bg": "radial-gradient(circle at center, #faf8f5 0%, #f4eee1 100%)",
      "--ink-color": "#1c1b18",
      "--font-serif": "'Cormorant Garamond', serif",
      "--font-sans": "'Oswald', sans-serif"
    };

    const prompt = `You are an expert AI Art Director. The user wants to modify an HTML poster template globally.
        You can change text content, themes (CSS variables), and element visibility.
        
        Current Text Content:
        ${JSON.stringify(textDict, null, 2)}
        
        Current CSS Variables (Theme):
        ${JSON.stringify(themeDict, null, 2)}
        
        Available Fonts: Use only fonts already defined in the CSS variables (e.g., var(--font-serif), var(--font-sans)). Do not introduce new font names.
        
        User Instructions: "change it to stranger things style theme"
        
        Return ONLY a JSON object representing the updates. Do NOT include markdown blocks like \`\`\`json. The format must be exactly:
        {
          "text": {
            "element-id": "new text content"
          },
          "theme": {
            "--variable-name": "new value"
          },
          "visibility": {
            "element-id": false
          }
        }
        Only include keys in the JSON that need to be changed. If no theme changes, omit "theme". For visibility, set false to hide an element, true to show.`;

    console.log("Sending prompt...");
    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    
    console.log("Raw Response:");
    console.log(responseText);

    if (responseText.startsWith('\`\`\`')) {
      responseText = responseText.replace(/^\`\`\`(json)?\n?/, '').replace(/\n?\`\`\`$/, '');
    }

    console.log("Cleaned Response:");
    console.log(responseText);

    const updates = JSON.parse(responseText);
    console.log("Parsed Successfully!", updates);
  } catch (error) {
    console.error("API Error:", error);
  }
}

test();
