CREATE TABLE IF NOT EXISTS payment_users (
  user_id INT PRIMARY KEY,
  name VARCHAR(150) NULL,
  email VARCHAR(255) NULL UNIQUE,
  role ENUM('user', 'admin', 'supplier') NOT NULL DEFAULT 'user',
  account_status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  user_id INT NOT NULL,
  provider ENUM('stripe', 'paymob') NOT NULL,
  provider_payment_id VARCHAR(128) NULL,
  status ENUM('pending', 'succeeded', 'failed', 'cancelled')
    NOT NULL DEFAULT 'pending',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  failure_reason VARCHAR(255) NULL,
  metadata JSON NULL,
  paid_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payments_order_id (order_id),
  INDEX idx_payments_user_id (user_id),
  INDEX idx_payments_status (status),
  UNIQUE KEY uniq_payments_provider_reference (provider, provider_payment_id),
  CONSTRAINT fk_payments_user
    FOREIGN KEY (user_id) REFERENCES payment_users(user_id)
);
