#!/usr/bin/env node

/**
 * OpenClaw AgentOracle Plugin - Environment Doctor
 * 
 * This script checks the environment and diagnoses potential issues
 * before installing or running the plugin.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkMark() {
  return `${colors.green}✓${colors.reset}`;
}

function crossMark() {
  return `${colors.red}✗${colors.reset}`;
}

function warningMark() {
  return `${colors.yellow}⚠${colors.reset}`;
}

// Check results
const results = {
  passed: [],
  warnings: [],
  failed: [],
};

function addResult(type, message) {
  results[type].push(message);
}

// ============================================================================
// Check 1: Node.js Version
// ============================================================================
function checkNodeVersion() {
  log('\n📦 Checking Node.js version...', 'cyan');
  
  const currentVersion = process.version;
  const requiredVersion = '16.0.0';
  
  const current = currentVersion.slice(1).split('.').map(Number);
  const required = requiredVersion.split('.').map(Number);
  
  const isCompatible = 
    current[0] > required[0] ||
    (current[0] === required[0] && current[1] >= required[1]);
  
  if (isCompatible) {
    log(`${checkMark()} Node.js version: ${currentVersion} (compatible)`, 'green');
    addResult('passed', `Node.js ${currentVersion}`);
  } else {
    log(`${crossMark()} Node.js version: ${currentVersion} (requires ${requiredVersion}+)`, 'red');
    addResult('failed', `Node.js version too old: ${currentVersion} < ${requiredVersion}`);
  }
}

// ============================================================================
// Check 2: Dependencies
// ============================================================================
function checkDependencies() {
  log('\n📚 Checking dependencies...', 'cyan');
  
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    log(`${crossMark()} package.json not found`, 'red');
    addResult('failed', 'package.json not found');
    return;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = packageJson.dependencies || {};
  
  const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    log(`${crossMark()} node_modules not found. Run "npm install" first.`, 'red');
    addResult('failed', 'Dependencies not installed');
    return;
  }
  
  let allInstalled = true;
  
  for (const [dep, version] of Object.entries(dependencies)) {
    const depPath = path.join(nodeModulesPath, dep);
    
    if (fs.existsSync(depPath)) {
      log(`${checkMark()} ${dep}@${version}`, 'green');
    } else {
      log(`${crossMark()} ${dep}@${version} (not installed)`, 'red');
      allInstalled = false;
    }
  }
  
  if (allInstalled) {
    addResult('passed', 'All dependencies installed');
  } else {
    addResult('failed', 'Some dependencies missing');
  }
}

// ============================================================================
// Check 3: Build Status
// ============================================================================
function checkBuildStatus() {
  log('\n🔨 Checking build status...', 'cyan');
  
  const distPath = path.join(__dirname, '..', 'dist');
  const indexJsPath = path.join(distPath, 'index.js');
  
  if (!fs.existsSync(distPath)) {
    log(`${warningMark()} dist/ directory not found. Run "npm run build".`, 'yellow');
    addResult('warnings', 'Plugin not built yet');
    return;
  }
  
  if (!fs.existsSync(indexJsPath)) {
    log(`${warningMark()} dist/index.js not found. Run "npm run build".`, 'yellow');
    addResult('warnings', 'Plugin not built yet');
    return;
  }
  
  log(`${checkMark()} Plugin built successfully`, 'green');
  addResult('passed', 'Plugin built');
}

// ============================================================================
// Check 4: OpenClaw Detection
// ============================================================================
function checkOpenClaw() {
  log('\n🦅 Checking OpenClaw installation...', 'cyan');
  
  try {
    const output = execSync('openclaw --version', { encoding: 'utf8', stdio: 'pipe' });
    const version = output.trim();
    log(`${checkMark()} OpenClaw detected: ${version}`, 'green');
    addResult('passed', `OpenClaw ${version}`);
  } catch (error) {
    log(`${warningMark()} OpenClaw not found in PATH`, 'yellow');
    log('  This is OK if you plan to install OpenClaw later.', 'yellow');
    addResult('warnings', 'OpenClaw not detected');
  }
}

// ============================================================================
// Check 5: OpenClaw Gateway
// ============================================================================
function checkOpenClawGateway() {
  log('\n🌐 Checking OpenClaw Gateway...', 'cyan');
  
  const WebSocket = require('ws');
  const gatewayUrl = 'ws://127.0.0.1:18789';
  
  return new Promise((resolve) => {
    const ws = new WebSocket(gatewayUrl, {
      handshakeTimeout: 3000,
    });
    
    const timeout = setTimeout(() => {
      ws.close();
      log(`${warningMark()} OpenClaw Gateway not responding at ${gatewayUrl}`, 'yellow');
      log('  Make sure OpenClaw is running and Gateway is enabled.', 'yellow');
      addResult('warnings', 'OpenClaw Gateway not accessible');
      resolve();
    }, 3000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      log(`${checkMark()} OpenClaw Gateway is accessible at ${gatewayUrl}`, 'green');
      addResult('passed', 'OpenClaw Gateway accessible');
      ws.close();
      resolve();
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      log(`${warningMark()} Cannot connect to OpenClaw Gateway: ${error.message}`, 'yellow');
      addResult('warnings', 'OpenClaw Gateway connection failed');
      resolve();
    });
  });
}

// ============================================================================
// Check 6: File System Permissions
// ============================================================================
function checkFileSystemPermissions() {
  log('\n📁 Checking file system permissions...', 'cyan');
  
  const homeDir = require('os').homedir();
  const logDir = path.join(homeDir, '.openclaw', 'agentoracle_logs');
  
  try {
    // Try to create the directory
    fs.mkdirSync(logDir, { recursive: true });
    
    // Try to write a test file
    const testFile = path.join(logDir, '.test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    log(`${checkMark()} Can write to log directory: ${logDir}`, 'green');
    addResult('passed', 'File system permissions OK');
  } catch (error) {
    log(`${crossMark()} Cannot write to log directory: ${error.message}`, 'red');
    addResult('failed', 'File system permissions issue');
  }
}

// ============================================================================
// Check 7: Network Connectivity
// ============================================================================
function checkNetworkConnectivity() {
  log('\n🌍 Checking network connectivity...', 'cyan');
  
  const https = require('https');
  const apiUrl = 'https://api.agentoracle.network';
  
  return new Promise((resolve) => {
    const req = https.get(apiUrl, { timeout: 5000 }, (res) => {
      log(`${checkMark()} Can reach AgentOracle API at ${apiUrl}`, 'green');
      addResult('passed', 'Network connectivity OK');
      resolve();
    });
    
    req.on('error', (error) => {
      log(`${warningMark()} Cannot reach AgentOracle API: ${error.message}`, 'yellow');
      log('  Check your internet connection and firewall settings.', 'yellow');
      addResult('warnings', 'Network connectivity issue');
      resolve();
    });
    
    req.on('timeout', () => {
      req.destroy();
      log(`${warningMark()} AgentOracle API request timed out`, 'yellow');
      addResult('warnings', 'Network timeout');
      resolve();
    });
  });
}

// ============================================================================
// Check 8: Configuration
// ============================================================================
function checkConfiguration() {
  log('\n⚙️  Checking configuration...', 'cyan');
  
  const homeDir = require('os').homedir();
  const configPath = path.join(homeDir, '.openclaw', 'config.json');
  
  if (!fs.existsSync(configPath)) {
    log(`${warningMark()} OpenClaw config not found at ${configPath}`, 'yellow');
    log('  You will need to configure the plugin after installation.', 'yellow');
    addResult('warnings', 'OpenClaw config not found');
    return;
  }
  
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const pluginConfig = config['agentoracle-native-plugin'];
    
    if (!pluginConfig) {
      log(`${warningMark()} Plugin not configured in OpenClaw config`, 'yellow');
      log('  Add configuration to ~/.openclaw/config.json', 'yellow');
      addResult('warnings', 'Plugin not configured');
      return;
    }
    
    const requiredFields = ['api_key', 'gateway_token'];
    const missingFields = requiredFields.filter(field => !pluginConfig[field]);
    
    if (missingFields.length > 0) {
      log(`${warningMark()} Missing required config fields: ${missingFields.join(', ')}`, 'yellow');
      addResult('warnings', `Missing config: ${missingFields.join(', ')}`);
    } else {
      log(`${checkMark()} Plugin configuration found`, 'green');
      addResult('passed', 'Plugin configured');
    }
  } catch (error) {
    log(`${crossMark()} Error reading config: ${error.message}`, 'red');
    addResult('failed', 'Config read error');
  }
}

// ============================================================================
// Summary
// ============================================================================
function printSummary() {
  log('\n' + '='.repeat(60), 'blue');
  log('DIAGNOSTIC SUMMARY', 'blue');
  log('='.repeat(60), 'blue');
  
  if (results.passed.length > 0) {
    log(`\n${checkMark()} Passed (${results.passed.length}):`, 'green');
    results.passed.forEach(item => log(`  • ${item}`, 'green'));
  }
  
  if (results.warnings.length > 0) {
    log(`\n${warningMark()} Warnings (${results.warnings.length}):`, 'yellow');
    results.warnings.forEach(item => log(`  • ${item}`, 'yellow'));
  }
  
  if (results.failed.length > 0) {
    log(`\n${crossMark()} Failed (${results.failed.length}):`, 'red');
    results.failed.forEach(item => log(`  • ${item}`, 'red'));
  }
  
  log('\n' + '='.repeat(60), 'blue');
  
  if (results.failed.length === 0) {
    if (results.warnings.length === 0) {
      log('\n✨ All checks passed! Your environment is ready.', 'green');
    } else {
      log('\n⚠️  Some warnings found, but you can proceed with installation.', 'yellow');
    }
  } else {
    log('\n❌ Some critical issues found. Please fix them before proceeding.', 'red');
    process.exit(1);
  }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  log('╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║   OpenClaw AgentOracle Plugin - Environment Doctor        ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');
  
  checkNodeVersion();
  checkDependencies();
  checkBuildStatus();
  checkOpenClaw();
  await checkOpenClawGateway();
  checkFileSystemPermissions();
  await checkNetworkConnectivity();
  checkConfiguration();
  
  printSummary();
  
  log('\n📖 For more information, see:');
  log('   • README.md');
  log('   • OPENCLAW-COMPATIBILITY-ANALYSIS.md');
  log('   • QUICK-START.md\n');
}

main().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
