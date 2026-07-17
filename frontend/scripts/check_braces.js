const fs = require('fs');
const code = fs.readFileSync('secondary-screens.jsx', 'utf8');

// Find all lines with template literals containing braces
const lines = code.split('\n');
lines.forEach((line, i) => {
  if (line.includes('function ') && line.includes('{')) {
    console.log(`L${i+1}: ${line.trim().substring(0, 100)}`);
  }
});

// Check for suspicious propTypes patterns
const propTypeMatches = code.matchAll(/(\w+)\.propTypes\s*=\s*\{/g);
for (const m of propTypeMatches) {
  const pos = m.index;
  const lineNum = code.substring(0, pos).split('\n').length;
  console.log(`PropTypes at L${lineNum}: ${m[0]}`);
}
