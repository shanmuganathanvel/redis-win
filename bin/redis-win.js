#!/usr/bin/env node
'use strict';

const RedisServer = require('../src/server');
const packageJson = require('../package.json');

const BANNER = `
                _._                                                  
           _.-""${'\\'.repeat(3)}""-._                                          
      _.-""${'\\'.repeat(6)}""-._        redis-win v${packageJson.version}                 
 .-"${'\\'.repeat(9)}"-._     Port: %PORT%                             
|${'\\'.repeat(12)}|    PID:  %PID%                              
|${'\\'.repeat(12)}|                                                 
|${'\\'.repeat(12)}|    Zero-dependency Redis replacement            
 '-._${'\\'.repeat(9)}_.-'    Ready to accept connections                  
     '-._${'\\'.repeat(6)}_.-'                                               
         '-._${'\\'.repeat(3)}_.-'                                                   
             \`-.\`                                                   
`;

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    port: parseInt(process.env.REDIS_PORT || process.env.PORT || '6379', 10),
    host: '127.0.0.1',
    auth: null,
    savePath: null,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-p' || arg === '--port') {
      options.port = parseInt(args[++i], 10);
    } else if (arg === '-h' || arg === '--host') {
      options.host = args[++i];
    } else if (arg === '-a' || arg === '--auth') {
      options.auth = args[++i];
    } else if (arg === '--save') {
      options.savePath = args[++i];
    } else if (arg === '-v' || arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--help') {
      console.log(`
redis-win v${packageJson.version}
Ultra-lightweight Redis replacement for Windows & Node.js

Usage:
  npx redis-win [options]
  redis-win [options]

Options:
  -p, --port <port>       Port to listen on (default: 6379)
  -h, --host <host>       Bind host address (default: 127.0.0.1)
  -a, --auth <password>   Require password authentication
  --save <filepath>       File path to periodically save/restore data
  -v, --verbose           Enable verbose connection logging
  --help                  Show this help screen
  --version               Show version number
      `);
      process.exit(0);
    } else if (arg === '--version') {
      console.log(`redis-win v${packageJson.version}`);
      process.exit(0);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const server = new RedisServer(options);

  process.on('SIGINT', async () => {
    console.log('\n[redis-win] Received SIGINT. Shutting down gracefully...');
    await server.stop();
    console.log('[redis-win] Server stopped. Bye!');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[redis-win] Received SIGTERM. Shutting down gracefully...');
    await server.stop();
    console.log('[redis-win] Server stopped. Bye!');
    process.exit(0);
  });

  try {
    const addr = await server.start();
    const banner = BANNER
      .replace('%PORT%', String(addr.port))
      .replace('%PID%', String(process.pid));

    console.log(banner);
    console.log(`[redis-win] Listening on ${addr.address}:${addr.port}`);
    if (options.auth) {
      console.log(`[redis-win] Authentication enabled`);
    }
    if (options.savePath) {
      console.log(`[redis-win] Snapshot persistence enabled: ${options.savePath}`);
    }
  } catch (err) {
    console.error(`[redis-win] Fatal error starting server:`, err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
