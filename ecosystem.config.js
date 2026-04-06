// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "gongsihegui-site",
      script: "node",
      args: "--localstorage-file=.next/localstorage ./node_modules/next/dist/bin/next dev -p 39017",
      cwd: "D:/gongsihegui",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "development",
        PORT: "39017",
        DATABASE_URL: process.env.DATABASE_URL || "postgresql://gongsi_admin:gongsi_pass_2026@localhost:54333/gongsihegui_db",
        NEXT_DISABLE_TURBOPACK: "1"
      }
    }
  ]
};
