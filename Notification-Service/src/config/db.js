const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  queueLimit: 0,
});

const initializeDatabase = async () => {
  await pool.execute(
    [
      "CREATE TABLE IF NOT EXISTS notification_users (",
      "user_id INT PRIMARY KEY,",
      "name VARCHAR(150) NULL,",
      "email VARCHAR(255) NULL UNIQUE,",
      "role ENUM('user', 'admin', 'supplier') NOT NULL DEFAULT 'user',",
      "account_status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',",
      "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,",
      "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
      ")",
    ].join(" "),
  );

  await pool.execute(
    [
      "CREATE TABLE IF NOT EXISTS notifications (",
      "id BIGINT AUTO_INCREMENT PRIMARY KEY,",
      "user_id INT NOT NULL,",
      "channel ENUM('email', 'sms', 'push') NOT NULL,",
      "source_event_id VARCHAR(64) NULL,",
      "source_event_type VARCHAR(64) NOT NULL,",
      "title VARCHAR(180) NOT NULL,",
      "body TEXT NOT NULL,",
      "metadata JSON NULL,",
      "delivery_status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'sent',",
      "is_read TINYINT(1) NOT NULL DEFAULT 0,",
      "read_at TIMESTAMP NULL DEFAULT NULL,",
      "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,",
      "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,",
      "UNIQUE KEY uniq_notifications_source_channel (source_event_id, channel),",
      "INDEX idx_notifications_user_created (user_id, created_at),",
      "INDEX idx_notifications_user_read (user_id, is_read),",
      "CONSTRAINT fk_notifications_user",
      "FOREIGN KEY (user_id) REFERENCES notification_users(user_id)",
      ")",
    ].join(" "),
  );
};

pool.initializeDatabase = initializeDatabase;

module.exports = pool;
