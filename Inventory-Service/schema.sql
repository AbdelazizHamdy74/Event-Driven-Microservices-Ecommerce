CREATE TABLE IF NOT EXISTS inventory_items (
  product_id BIGINT PRIMARY KEY,
  total_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  reserved_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inventory_items_total_quantity (total_quantity),
  INDEX idx_inventory_items_reserved_quantity (reserved_quantity)
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  status ENUM('active', 'released', 'confirmed', 'expired')
    NOT NULL DEFAULT 'active',
  expires_at TIMESTAMP NULL DEFAULT NULL,
  release_reason VARCHAR(80) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inventory_reservations_order_id (order_id),
  INDEX idx_inventory_reservations_product_id (product_id),
  INDEX idx_inventory_reservations_status (status),
  INDEX idx_inventory_reservations_expires_at (expires_at),
  UNIQUE KEY uq_inventory_order_product_status (order_id, product_id, status),
  CONSTRAINT fk_inventory_reservations_item
    FOREIGN KEY (product_id) REFERENCES inventory_items(product_id)
    ON DELETE CASCADE
);
