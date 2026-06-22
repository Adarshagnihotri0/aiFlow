const entryPoint = 'dist/index.js';
const filePath = 'src/index.ts';

console.log('Testing entry point detection:');
console.log('entryPoint:', entryPoint);
console.log('filePath:', filePath);
console.log('');

console.log('Test 1 (direct match):', entryPoint === filePath);
console.log('Test 2 (dist->src):', entryPoint.replace(/^dist\//, 'src/') === filePath);
console.log('Test 3 (dist->src + .js->.ts):', entryPoint.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts') === filePath);
console.log('');

const shouldMatch = entryPoint.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts') === filePath;
console.log('FINAL RESULT: Should mark as entry point?', shouldMatch);
