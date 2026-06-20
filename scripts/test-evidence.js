// Test Evidence Script
// Runs risk assessment on changed files

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function assessRisk() {
  console.log('Running evidence capture...\n');
  
  // Check if coverage directory exists
  const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-final.json');
  
  if (!fs.existsSync(coveragePath)) {
    console.log('⚠ No coverage report found. Run tests first.');
    console.log('  Run: npm test -- --coverage\n');
    
    // Still create basic risk assessment
    createBasicRiskReport();
    return;
  }
  
  // Get test coverage
  const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
  
  // Get changed files (if git exists)
  let changedFiles = [];
  try {
    changedFiles = execSync('git diff --name-only HEAD~1', { encoding: 'utf-8' })
      .split('\n')
      .filter(f => f.endsWith('.ts') || f.endsWith('.js'));
  } catch (e) {
    console.log('⚠ Not a git repository or no previous commit\n');
    changedFiles = Object.keys(coverage).filter(f => f.includes('src/'));
  }
  
  // Risk assessment
  const riskMap = {
    LOW: [],
    MEDIUM: [],
    HIGH: []
  };
  
  changedFiles.forEach(file => {
    const fileCoverage = coverage[file];
    
    if (!fileCoverage) {
      riskMap.HIGH.push({ file, reason: 'No tests' });
    } else {
      const linePct = fileCoverage.lines?.percentage || 0;
      
      if (linePct < 50) {
        riskMap.MEDIUM.push({ file, reason: `Low coverage (${linePct.toFixed(0)}%)` });
      } else {
        riskMap.LOW.push({ file, reason: `Well-tested (${linePct.toFixed(0)}%)` });
      }
    }
  });
  
  // Write risk report
  const outputDir = path.join(process.cwd(), '.ai', 'auto');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const reportPath = path.join(outputDir, 'risk-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(riskMap, null, 2));
  
  console.log('Risk Assessment Complete:');
  console.log(`  HIGH: ${riskMap.HIGH.length} files`);
  console.log(`  MEDIUM: ${riskMap.MEDIUM.length} files`);
  console.log(`  LOW: ${riskMap.LOW.length} files`);
  console.log(`\n✓ Report saved: ${reportPath}\n`);
  
  // Print details
  if (riskMap.HIGH.length > 0) {
    console.log('HIGH risk files:');
    riskMap.HIGH.forEach(f => console.log(`  - ${f.file}: ${f.reason}`));
    console.log('');
  }
  
  if (riskMap.MEDIUM.length > 0) {
    console.log('MEDIUM risk files:');
    riskMap.MEDIUM.forEach(f => console.log(`  - ${f.file}: ${f.reason}`));
    console.log('');
  }
}

function createBasicRiskReport() {
  const riskMap = {
    LOW: [],
    MEDIUM: [],
    HIGH: []
  };
  
  // Create empty report
  const outputDir = path.join(process.cwd(), '.ai', 'auto');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const reportPath = path.join(outputDir, 'risk-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(riskMap, null, 2));
  
  console.log('✓ Empty risk report created');
  console.log('  Run tests with coverage to populate report\n');
}

assessRisk();
