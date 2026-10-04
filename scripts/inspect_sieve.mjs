import https from 'node:https';
import fs from 'node:fs';

const url = 'https://raw.githubusercontent.com/Phineas1500/sieve-ai-image-detector/main/extension/src/offscreen.js';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('scripts/sieve_offscreen.js', data);
    console.log('Saved sieve_offscreen.js! Size:', data.length);
    const lines = data.split('\n');
    console.log('Total lines:', lines.length);
    // Find all functions
    lines.forEach((line, idx) => {
      if (line.includes('function ') || line.includes('=>') || line.includes('score') || line.includes('logit')) {
        if (!line.includes('CANVAS_PROBE')) {
          console.log(`L${idx+1}: ${line.slice(0, 100)}`);
        }
      }
    });
  });
});
