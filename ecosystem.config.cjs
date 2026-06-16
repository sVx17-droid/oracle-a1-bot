module.exports = {
  apps: [
    {
      name: 'super-monitor',
      script: './src/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PORT: 3099,
        NODE_ENV: 'production',
        DB_PATH: './data/bandarmotologi.db',
        MAX_PAIRS: 150,
        RETENTION_DAYS: 30,
      },
      max_memory_restart: '2G',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
    },
  ],
};
