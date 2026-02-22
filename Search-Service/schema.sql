CREATE TABLE IF NOT EXISTS search_products (
  product_id BIGINT PRIMARY KEY,
  category_id BIGINT NULL,
  category_name VARCHAR(120) NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  stock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  primary_image_url VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_search_products_category_id (category_id),
  INDEX idx_search_products_is_active (is_active),
  INDEX idx_search_products_price (price),
  INDEX idx_search_products_stock_quantity (stock_quantity)
);
