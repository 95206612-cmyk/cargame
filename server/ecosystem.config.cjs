module.exports = {
  apps: [
    {
      name: 'street-racer-server',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8080',
        ROOM_IDLE_MS: '300000',
        MAX_ROOMS: '100',
        MAX_PLAYERS_PER_ROOM: '6',
      },
    },
  ],
};
