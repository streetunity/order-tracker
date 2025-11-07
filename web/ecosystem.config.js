module.exports = {
  apps: [{
    name: 'order-tracker-frontend',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/order-tracker/web',
    env: {
      NODE_ENV: 'production',
      API_URL: 'http://50.19.66.100:4000'
    }
  }]
};
