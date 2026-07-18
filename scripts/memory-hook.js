/**
 * Post-start hook for Bedrock Proxy
 * Automatically runs when proxy starts on port 3000 or 2999
 *
 * This sets up the memory system environment
 */

const { execSync } = require('child_process');
const http = require('http');

const MEMORY_DIR = '/Users/adarshagnihotri/workspace/project/415bbbcd111a4a15ae5a9785d35276ef';
const AIFLOW_DIR = '/Users/adarshagnihotri/aiFlow/future/mcp1.0.0';

function log(message) {
  console.log(`[Memory System] ${message}`);
}

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: port,
      path: '/health',
      method: 'GET',
      timeout: 1000
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function setupMemorySystem(port) {
  log('════════════════════════════════════════════════════════════');
  log('Memory System Auto-Setup');
  log('════════════════════════════════════════════════════════════');

  // Start Neo4j
  log('[1/2] Checking Neo4j...');
  try {
    const neo4jRunning = execSync('docker ps | grep openhands-memory || true', { encoding: 'utf-8' });
    if (!neo4jRunning.trim()) {
      log('  Starting Neo4j...');
      execSync('docker run -d --name openhands-memory -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/test1234 neo4j:latest', {
        stdio: 'ignore'
      });
      log('  ✓ Neo4j started');
    } else {
      log('  ✓ Neo4j already running');
    }
  } catch (error) {
    log('  ✗ Neo4j setup failed (may already be running)');
  }

  // Set environment variables
  log('[2/2] Setting environment...');

  // Read API key from .env if not set
  if (!process.env.BEDROCK_MANTLE_API_KEY) {
    try {
      const fs = require('fs');
      const envPath = `${AIFLOW_DIR}/.env`;
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/BEDROCK_MANTLE_API_KEY=(.+)/);
        if (match) {
          process.env.BEDROCK_MANTLE_API_KEY = match[1].trim();
          log('  ✓ Loaded API key from .env');
        }
      }
    } catch (error) {
      log('  ✗ Could not load API key');
    }
  }

  // Set proxy URL based on detected port
  process.env.BEDROCK_PROXY_URL = `http://localhost:${port}`;
  process.env.BEDROCK_MODEL = process.env.BEDROCK_MODEL || 'anthropic.claude-3-5-sonnet';
  process.env.NEO4J_URI = 'bolt://localhost:7687';
  process.env.NEO4J_USER = 'neo4j';
  process.env.NEO4J_PASSWORD = 'test1234';

  log('  ✓ BEDROCK_PROXY_URL=' + process.env.BEDROCK_PROXY_URL);
  log('  ✓ BEDROCK_MODEL=' + process.env.BEDROCK_MODEL);
  log('  ✓ NEO4J_URI=' + process.env.NEO4J_URI);

  log('════════════════════════════════════════════════════════════');
  log('✅ Memory System Ready');
  log('════════════════════════════════════════════════════════════');
  log('');
  log('Environment variables exported to parent process');
  log('');
  log('To use in separate terminal:');
  log(`  cd ${MEMORY_DIR}`);
  log('  python test_bedrock_integration.py');
  log('');
}

// Auto-detect and setup
async function autoSetup() {
  const port2999 = await checkPort(2999);
  const port3000 = await checkPort(3000);

  if (port2999) {
    await setupMemorySystem(2999);
  } else if (port3000) {
    await setupMemorySystem(3000);
  } else {
    // Wait and retry (proxy might be starting)
    log('Waiting for proxy to start...');
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (await checkPort(2999)) {
        await setupMemorySystem(2999);
        return;
      }
      if (await checkPort(3000)) {
        await setupMemorySystem(3000);
        return;
      }
    }

    log('✗ Proxy did not start within timeout');
  }
}

// Run if called directly
if (require.main === module) {
  autoSetup().catch(console.error);
}

module.exports = { setupMemorySystem, autoSetup };
