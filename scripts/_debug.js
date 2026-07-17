const fs = require("fs");
const code = fs.readFileSync("frontend/parts-screen.jsx", "utf8");
const lines = code.split("\n");
for (let i = 525; i < 540; i++) {
  console.log((i+1) + ": " + lines[i]);
}
console.log("---");
console.log("Line 535:", JSON.stringify(lines[534]));
console.log("Line 536:", JSON.stringify(lines[535]));
