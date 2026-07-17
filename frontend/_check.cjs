const acorn = require('acorn');
const fs = require('fs');
const content = fs.readFileSync('src/services/__tests__/screenDataBridge.test.js', 'utf8');
try {
  acorn.parse(content, { ecmaVersion: 'latest', sourceType: 'module' });
  console.log('PARSE OK');
} catch(e) {
  console.log('Error at line ' + e.loc.line + ' col ' + e.loc.column + ': ' + e.message.substring(0, 200));
}
