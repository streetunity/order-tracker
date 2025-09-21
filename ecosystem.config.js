module.exports = {
  apps: [
    {
      name: 'order-tracker-backend',
      cwd: './api',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      error_file: '../logs/backend-error.log',
      out_file: '../logs/backend-out.log',
      time: true
    },
    {
      name: 'order-tracker-frontend',
      cwd: './web',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '../logs/frontend-error.log',
      out_file: '../logs/frontend-out.log',
      time: true
    }
  ]
};