#!/usr/bin/env npx tsx
/**
 * Process Management CLI for Lead Gen Scraper
 * 
 * Usage:
 *   npx tsx scripts/manage-processes.ts status    # Show process status
 *   npx tsx scripts/manage-processes.ts kill      # Kill our scraper processes
 *   npx tsx scripts/manage-processes.ts kill-all  # Kill ALL headless browsers
 *   npx tsx scripts/manage-processes.ts help      # Show help
 */

import { 
  processManager,
  getProcessStatus,
  killAllScraperProcesses,
  printProcessStatus,
} from './lead-seeding-scraper/process-manager';

async function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║             Lead Gen Scraper Process Manager                      ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Usage: npx tsx scripts/manage-processes.ts <command>            ║
║                                                                   ║
║  Commands:                                                        ║
║    status     Show status of running scraper processes           ║
║    kill       Kill all tracked scraper browser processes         ║
║    kill-all   Kill ALL headless Chrome/Chromium processes        ║
║               (Use with caution - affects all headless browsers) ║
║    help       Show this help message                              ║
║                                                                   ║
║  Examples:                                                        ║
║    npx tsx scripts/manage-processes.ts status                    ║
║    npx tsx scripts/manage-processes.ts kill                      ║
║    npx tsx scripts/manage-processes.ts kill-all                  ║
║                                                                   ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

async function showStatus() {
  await printProcessStatus();
  
  const status = await getProcessStatus();
  
  if (status.runningProcesses.length > 0) {
    console.log('To kill these processes, run:');
    console.log('  npx tsx scripts/manage-processes.ts kill');
    console.log('');
  }
}

async function killScraper() {
  console.log('🔍 Finding scraper processes...\n');
  
  const statusBefore = await getProcessStatus();
  
  if (statusBefore.runningProcesses.length === 0) {
    console.log('✅ No scraper processes found running.');
    return;
  }
  
  console.log(`Found ${statusBefore.runningProcesses.length} scraper process(es).`);
  console.log('Killing them now...\n');
  
  const result = await killAllScraperProcesses();
  
  console.log(`\n✅ Result:`);
  console.log(`   Killed: ${result.killed}`);
  console.log(`   Failed: ${result.failed}`);
  if (result.pids.length > 0) {
    console.log(`   PIDs: ${result.pids.join(', ')}`);
  }
}

async function killAll() {
  console.log('⚠️  WARNING: This will kill ALL headless Chrome/Chromium processes!');
  console.log('   This includes any headless browsers from other applications.\n');
  
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('Are you sure you want to continue? (yes/no): ', resolve);
  });
  rl.close();
  
  if (answer.toLowerCase() !== 'yes') {
    console.log('\nCancelled.');
    return;
  }
  
  console.log('\n🔍 Finding headless browser processes...');
  
  const result = await processManager.killAllHeadless();
  
  console.log(`\n✅ Result:`);
  console.log(`   Kill commands executed: ${result.killed}`);
  console.log(`   Failed: ${result.failed}`);
}

async function main() {
  const command = process.argv[2]?.toLowerCase() || 'help';
  
  console.log('\n🤖 Lead Gen Scraper Process Manager\n');
  
  switch (command) {
    case 'status':
      await showStatus();
      break;
    case 'kill':
      await killScraper();
      break;
    case 'kill-all':
      await killAll();
      break;
    case 'help':
    default:
      await showHelp();
  }
  
  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
