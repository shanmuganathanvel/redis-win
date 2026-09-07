'use strict';

const os = require('os');
const { OK, PONG } = require('../protocol/serializer');

function registerConnectionCommands(registry) {
  registry.register('PING', (client, args) => {
    if (args.length === 0) {
      return PONG;
    }
    return args[0];
  });

  registry.register('ECHO', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'echo' command");
    }
    return args[0];
  });

  registry.register('SELECT', (client, args) => {
    if (args.length < 1) {
      throw new Error("ERR wrong number of arguments for 'select' command");
    }
    const dbIndex = parseInt(args[0], 10);
    client.selectDB(dbIndex);
    return OK;
  });

  registry.register('QUIT', (client) => {
    client.socket.end(OK);
    return undefined;
  });

  registry.register('AUTH', (client, args) => {
    const serverAuth = client.server.options.auth;
    if (!serverAuth) {
      return OK;
    }
    // AUTH [username] password
    const password = args.length === 1 ? args[0] : args[1];
    if (password === serverAuth) {
      client.authenticated = true;
      return OK;
    }
    throw new Error('ERR invalid password');
  });

  registry.register('INFO', (client, args) => {
    const srv = client.server;
    const uptimeSec = Math.floor((Date.now() - srv.startTime) / 1000);
    const mem = process.memoryUsage();

    let keyspaceInfo = '';
    for (const [idx, db] of srv.datastore.dbs.entries()) {
      const keys = db.dbsize();
      const expires = db.expirations.size;
      if (keys > 0) {
        keyspaceInfo += `db${idx}:keys=${keys},expires=${expires},avg_ttl=0\r\n`;
      }
    }

    const info = [
      '# Server',
      'redis_version:7.2.0',
      'redis_git_sha1:00000000',
      'redis_git_dirty:0',
      'redis_build_id:0',
      'redis_mode:standalone',
      `os:${os.type()} ${os.release()}`,
      `arch_bits:${process.arch === 'x64' || process.arch === 'arm64' ? 64 : 32}`,
      'multiplexing_api:epoll',
      'atomicvar_api:atomic-builtin',
      `process_id:${process.pid}`,
      `tcp_port:${srv.port}`,
      `uptime_in_seconds:${uptimeSec}`,
      `uptime_in_days:${Math.floor(uptimeSec / 86400)}`,
      '',
      '# Clients',
      `connected_clients:${srv.clients.size}`,
      'cluster_connections:0',
      'maxclients:10000',
      'client_recent_max_input_buffer:0',
      'client_recent_max_output_buffer:0',
      'blocked_clients:0',
      'tracking_clients:0',
      '',
      '# Memory',
      `used_memory:${mem.heapUsed}`,
      `used_memory_human:${(mem.heapUsed / 1024 / 1024).toFixed(2)}M`,
      `used_memory_rss:${mem.rss}`,
      `used_memory_rss_human:${(mem.rss / 1024 / 1024).toFixed(2)}M`,
      `used_memory_peak:${mem.heapTotal}`,
      `used_memory_peak_human:${(mem.heapTotal / 1024 / 1024).toFixed(2)}M`,
      'mem_fragmentation_ratio:1.00',
      '',
      '# Persistence',
      'loading:0',
      'rdb_changes_since_last_save:0',
      'rdb_bgsave_in_progress:0',
      'rdb_last_save_time:0',
      'rdb_last_bgsave_status:ok',
      'aof_enabled:0',
      '',
      '# Stats',
      `total_connections_received:${srv.stats.totalConnections}`,
      `total_commands_processed:${srv.stats.totalCommands}`,
      'instantaneous_ops_per_sec:0',
      'total_net_input_bytes:0',
      'total_net_output_bytes:0',
      'rejected_connections:0',
      '',
      '# Replication',
      'role:master',
      'connected_slaves:0',
      'master_replid:0000000000000000000000000000000000000000',
      'master_repl_offset:0',
      '',
      '# CPU',
      'used_cpu_sys:0.0',
      'used_cpu_user:0.0',
      '',
      '# Keyspace',
      keyspaceInfo,
    ].join('\r\n');

    return info;
  });

  registry.register('COMMAND', (client, args) => {
    if (args.length > 0 && args[0].toUpperCase() === 'DOCS') {
      return [];
    }
    if (args.length > 0 && args[0].toUpperCase() === 'COUNT') {
      return registry.commands.size;
    }
    // Return empty list or basic specs for commands
    return [];
  });

  registry.register('CLIENT', (client, args) => {
    if (args.length === 0) {
      throw new Error("ERR wrong number of arguments for 'client' command");
    }
    const sub = args[0].toUpperCase();
    if (sub === 'SETNAME') {
      client.name = args[1] || '';
      return OK;
    }
    if (sub === 'GETNAME') {
      return client.name || null;
    }
    if (sub === 'SETINFO') {
      // Modern Redis 7 handshake (CLIENT SETINFO lib-name ... lib-ver ...)
      return OK;
    }
    if (sub === 'LIST') {
      return `id=${client.id} addr=${client.socket.remoteAddress}:${client.socket.remotePort} fd=0 name=${client.name || ''} age=0 idle=0 flags=N db=${client.dbIndex} sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=0 argv-mem=0 obl=0 oll=0 omem=0 tot-mem=0 events=r cmd=client\n`;
    }
    return OK;
  });

  registry.register('HELLO', (client, args) => {
    // Protocol handshake. Return RESP2 array representing server info:
    // [server, redis, version, 7.2.0, proto, 2, id, client.id, mode, standalone, role, master, modules, []]
    return [
      'server', 'redis',
      'version', '7.2.0',
      'proto', 2,
      'id', client.id,
      'mode', 'standalone',
      'role', 'master',
      'modules', [],
    ];
  });

  registry.register('TIME', () => {
    const now = Date.now();
    const sec = Math.floor(now / 1000);
    const microsec = (now % 1000) * 1000;
    return [String(sec), String(microsec)];
  });
}

module.exports = registerConnectionCommands;
