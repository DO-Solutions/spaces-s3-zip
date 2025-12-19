#!/usr/bin/env node

/**
 * Local test script for the backup function
 * Loads environment variables from .env file and runs the function
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env file not found');
    console.error('Please create a .env file based on .env.example');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE format
    const equalIndex = trimmedLine.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmedLine.substring(0, equalIndex).trim();
    const value = trimmedLine.substring(equalIndex + 1).trim();

    // Remove quotes if present
    const cleanValue = value.replace(/^["']|["']$/g, '');

    // Only set if not already set (allows override via actual env vars)
    if (!process.env[key]) {
      process.env[key] = cleanValue;
    }
  }
}

// Main test function
async function runTest() {
  console.log('='.repeat(60));
  console.log('Testing Backup Function Locally');
  console.log('='.repeat(60));
  console.log('');

  // Load environment variables
  console.log('Loading environment variables from .env file...');
  try {
    loadEnvFile();
    console.log('✓ Environment variables loaded\n');
  } catch (error) {
    console.error('✗ Failed to load environment variables:', error.message);
    process.exit(1);
  }

  // Validate required env vars are set
  const required = ['SOURCE_BUCKET', 'DEST_BUCKET', 'SPACES_KEY', 'SPACES_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('✗ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }

  // Display configuration (without secrets)
  console.log('Configuration:');
  console.log(`  Source Bucket: ${process.env.SOURCE_BUCKET}`);
  console.log(`  Source Region: ${process.env.SOURCE_REGION || 'nyc3'}`);
  console.log(`  Dest Bucket: ${process.env.DEST_BUCKET}`);
  console.log(`  Dest Region: ${process.env.DEST_REGION || 'nyc3'}`);
  console.log(`  Archive Prefix: ${process.env.ARCHIVE_PREFIX || 'backups'}`);
  console.log(`  Spaces Key: ${process.env.SPACES_KEY ? '***' + process.env.SPACES_KEY.slice(-4) : 'NOT SET'}`);
  console.log(`  Spaces Secret: ${process.env.SPACES_SECRET ? '***' + process.env.SPACES_SECRET.slice(-4) : 'NOT SET'}`);
  console.log('');

  // Import and run the function
  console.log('Running backup function...');
  console.log('-'.repeat(60));
  
  try {
    const { main } = await import('./packages/backup/backup/backup.js');
    
    const startTime = Date.now();
    const result = await main({});
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('-'.repeat(60));
    console.log('');
    console.log('Result:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    console.log(`Total test duration: ${duration} seconds`);
    console.log('');

    // Check if there was an error
    if (result.statusCode >= 400) {
      console.error('✗ Function returned an error status code');
      process.exit(1);
    } else {
      console.log('✓ Function completed successfully');
      process.exit(0);
    }

  } catch (error) {
    console.error('-'.repeat(60));
    console.error('');
    console.error('✗ Function threw an error:');
    console.error('');
    console.error('Error Message:', error.message);
    console.error('');
    console.error('Stack Trace:');
    console.error(error.stack);
    console.error('');
    process.exit(1);
  }
}

// Run the test
runTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

