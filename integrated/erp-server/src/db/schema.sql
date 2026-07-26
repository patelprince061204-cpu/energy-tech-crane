-- =============================================================================
-- Energy Tech Crane ERP — Professional MySQL Schema
-- =============================================================================
-- Design principles:
--   • Every table has proper column types (not JSON blobs)
--   • Foreign key constraints enforce referential integrity
--   • Indexes on every FK column and commonly filtered columns
--   • utf8mb4 throughout for full Unicode / emoji support
--   • Soft-delete via activity_logs (see logDeletion in models.js)
--   • Timestamps: created_at auto-set, updated_at maintained by app
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+05:30'; -- IST

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS & AUTH
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(100) NOT NULL,
  `email`       VARCHAR(150) NOT NULL,
  `mobile`      VARCHAR(15)  NOT NULL DEFAULT '',
  `password`    VARCHAR(255) NOT NULL,
  `role`        ENUM('admin','sales','production','accounts') NOT NULL DEFAULT 'sales',
  `active`      TINYINT(1) NOT NULL DEFAULT 1,
  `is_demo`     TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- CUSTOMERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `customers` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_name`   VARCHAR(200) NOT NULL,
  `contact_person` VARCHAR(100) NOT NULL DEFAULT '',
  `mobile`         VARCHAR(15)  NOT NULL,
  `email`          VARCHAR(150) NOT NULL DEFAULT '',
  `address`        TEXT,
  `reference`      VARCHAR(200) NOT NULL DEFAULT '',
  `remarks`        TEXT,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_customers_mobile`       (`mobile`),
  KEY `idx_customers_company_name` (`company_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- WEBSITE LEADS (auto-synced from company website contact form)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `website_leads` (
  `id`                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `website_lead_id`        VARCHAR(32)  NOT NULL COMMENT 'Unique ID from website',
  `name`                   VARCHAR(100) NOT NULL,
  `phone`                  VARCHAR(20)  NOT NULL,
  `email`                  VARCHAR(150) NOT NULL DEFAULT '',
  `company`                VARCHAR(200) NOT NULL DEFAULT '',
  `product`                VARCHAR(150) NOT NULL DEFAULT '',
  `capacity`               VARCHAR(60)  NOT NULL DEFAULT '',
  `span`                   VARCHAR(20)  NOT NULL DEFAULT '' COMMENT 'Span (m) - from product page enquiry form',
  `lift_height`            VARCHAR(20)  NOT NULL DEFAULT '' COMMENT 'Lift Height (m) - from product page enquiry form',
  `girder_type`            VARCHAR(30)  NOT NULL DEFAULT '' COMMENT 'Single/Double Girder - from product page enquiry form',
  `message`                TEXT,
  `source`                 VARCHAR(60)  NOT NULL DEFAULT 'website_contact_form',
  `status`                 ENUM('New','Contacted','Qualified','Converted','Closed','Spam')
                           NOT NULL DEFAULT 'New',
  `notes`                  TEXT COMMENT 'Internal sales notes',
  `assigned_to`            INT UNSIGNED NULL COMMENT 'FK → users.id',
  `converted_customer_id`  INT UNSIGNED NULL COMMENT 'FK → customers.id after conversion',
  `converted_enquiry_id`   INT UNSIGNED NULL COMMENT 'FK → enquiries.id after conversion',
  `converted_at`           DATETIME NULL,
  `converted_by`           INT UNSIGNED NULL COMMENT 'FK → users.id',
  `submitted_at`           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_website_lead_id` (`website_lead_id`),
  KEY `idx_wl_status`        (`status`),
  KEY `idx_wl_submitted_at`  (`submitted_at`),
  KEY `idx_wl_phone`         (`phone`),
  KEY `idx_wl_assigned_to`   (`assigned_to`),
  CONSTRAINT `fk_wl_assigned_to`  FOREIGN KEY (`assigned_to`)           REFERENCES `users`     (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wl_customer`     FOREIGN KEY (`converted_customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wl_converted_by` FOREIGN KEY (`converted_by`)          REFERENCES `users`     (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Auto-synced website contact form submissions';

-- ─────────────────────────────────────────────────────────────────────────────
-- DOCUMENT NUMBER COUNTERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `counters` (
  `id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `prefix`  VARCHAR(10)  NOT NULL,
  `value`   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_counters_prefix` (`prefix`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- ENQUIRIES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `enquiries` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `enquiry_number`    VARCHAR(20)  NOT NULL,
  `date`              DATE         NOT NULL,
  `customer_id`       INT UNSIGNED NOT NULL,
  `product_required`  VARCHAR(100) NOT NULL,
  `capacity`          VARCHAR(30)  NOT NULL,
  `span`              VARCHAR(20)  NOT NULL DEFAULT '',
  `lift_height`       VARCHAR(20)  NOT NULL DEFAULT '',
  `length`            VARCHAR(20)  NOT NULL DEFAULT '',
  `girder_type`       VARCHAR(30)  NOT NULL DEFAULT '',
  `column_distance`   VARCHAR(20)  NOT NULL DEFAULT '',
  `reference`         VARCHAR(200) NOT NULL DEFAULT '',
  `extra_requirements` TEXT,
  `assigned_to`       INT UNSIGNED NULL,
  `follow_up_date`    DATE         NULL,
  `remarks`           TEXT,
  `status`            ENUM('New','Under Discussion','Quotation Sent','Won','Lost')
                      NOT NULL DEFAULT 'New',
  `created_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_enquiry_number` (`enquiry_number`),
  KEY `idx_enquiries_customer_id`  (`customer_id`),
  KEY `idx_enquiries_status`       (`status`),
  KEY `idx_enquiries_date`         (`date`),
  KEY `idx_enquiries_assigned_to`  (`assigned_to`),
  KEY `idx_enquiries_follow_up`    (`follow_up_date`),
  CONSTRAINT `fk_enq_customer`    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_enq_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `users`     (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- SPEC LISTS & QUOTATION TEMPLATES (used by Quotations)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `spec_lists` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(100) NOT NULL,
  `product`    VARCHAR(100) NOT NULL DEFAULT '',
  `rows`       JSON         NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `quotation_templates` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(100) NOT NULL,
  `product`    VARCHAR(100) NOT NULL DEFAULT '',
  `sections`   JSON         NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- QUOTATIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `quotations` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `quotation_number` VARCHAR(20)  NOT NULL,
  `date`             DATE         NOT NULL,
  `valid_until`      DATE         NULL,
  `enquiry_id`       INT UNSIGNED NULL,
  `customer_id`      INT UNSIGNED NOT NULL,
  `crane_type`       VARCHAR(100) NOT NULL DEFAULT '',
  `capacity`         VARCHAR(30)  NOT NULL DEFAULT '',
  `span`             VARCHAR(20)  NOT NULL DEFAULT '',
  `lift_height`      VARCHAR(20)  NOT NULL DEFAULT '',
  `girder_type`      VARCHAR(30)  NOT NULL DEFAULT '',
  `total_price`      DECIMAL(15,2) NOT NULL DEFAULT 0,
  `gst_percent`      DECIMAL(5,2)  NOT NULL DEFAULT 18,
  `gst_amount`       DECIMAL(15,2) NOT NULL DEFAULT 0,
  `grand_total`      DECIMAL(15,2) NOT NULL DEFAULT 0,
  `spec_rows`        JSON         NULL COMMENT 'Technical spec table rows',
  `notes`            TEXT,
  `terms`            TEXT,
  `status`           ENUM('Draft','Sent','Accepted','Rejected') NOT NULL DEFAULT 'Draft',
  `created_by`       INT UNSIGNED NULL,
  `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_quotation_number` (`quotation_number`),
  KEY `idx_quot_customer_id` (`customer_id`),
  KEY `idx_quot_enquiry_id`  (`enquiry_id`),
  KEY `idx_quot_status`      (`status`),
  KEY `idx_quot_date`        (`date`),
  CONSTRAINT `fk_quot_customer`   FOREIGN KEY (`customer_id`) REFERENCES `customers`  (`id`),
  CONSTRAINT `fk_quot_enquiry`    FOREIGN KEY (`enquiry_id`)  REFERENCES `enquiries`  (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_quot_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`      (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- SALES ORDERS (PO Numbers)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `sales_orders` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `so_number`      VARCHAR(20)  NOT NULL,
  `quotation_id`   INT UNSIGNED NULL,
  `customer_id`    INT UNSIGNED NOT NULL,
  `crane_type`     VARCHAR(100) NOT NULL DEFAULT '',
  `capacity`       VARCHAR(30)  NOT NULL DEFAULT '',
  `span`           VARCHAR(20)  NOT NULL DEFAULT '',
  `lift_height`    VARCHAR(20)  NOT NULL DEFAULT '',
  `girder_type`    VARCHAR(30)  NOT NULL DEFAULT '',
  `po_number`      VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'Customer PO reference',
  `po_date`        DATE         NULL,
  `final_price`    DECIMAL(15,2) NOT NULL DEFAULT 0,
  `delivery_date`  DATE         NULL,
  `status`         ENUM('Pending','Production','Ready for Dispatch','Completed')
                   NOT NULL DEFAULT 'Pending',
  `notes`          TEXT,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_so_number` (`so_number`),
  KEY `idx_so_customer_id`  (`customer_id`),
  KEY `idx_so_quotation_id` (`quotation_id`),
  KEY `idx_so_status`       (`status`),
  CONSTRAINT `fk_so_customer`   FOREIGN KEY (`customer_id`)  REFERENCES `customers`  (`id`),
  CONSTRAINT `fk_so_quotation`  FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- JOB CARDS (Production)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `job_cards` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_card_number` VARCHAR(20)  NOT NULL,
  `so_id`           INT UNSIGNED NOT NULL,
  `start_date`      DATE         NOT NULL,
  `crane_type`      VARCHAR(100) NOT NULL DEFAULT '',
  `production_note` TEXT,
  `status`          ENUM('Pending','In Progress','Completed') NOT NULL DEFAULT 'Pending',
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_job_card_number` (`job_card_number`),
  KEY `idx_jc_so_id`  (`so_id`),
  KEY `idx_jc_status` (`status`),
  CONSTRAINT `fk_jc_so` FOREIGN KEY (`so_id`) REFERENCES `sales_orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- MATERIAL HIERARCHY
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(100) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `subcategories` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(100) NOT NULL,
  `category_id` INT UNSIGNED NULL,
  `parent_id`   INT UNSIGNED NULL COMMENT 'Self-reference for 5-level hierarchy',
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_subcat_category_id` (`category_id`),
  KEY `idx_subcat_parent_id`   (`parent_id`),
  CONSTRAINT `fk_subcat_category` FOREIGN KEY (`category_id`) REFERENCES `categories`    (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subcat_parent`   FOREIGN KEY (`parent_id`)   REFERENCES `subcategories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `materials` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `material_code`  VARCHAR(20)  NOT NULL,
  `material_name`  VARCHAR(200) NOT NULL DEFAULT '',
  `category_id`    INT UNSIGNED NULL,
  `subcategory_id` INT UNSIGNED NULL,
  `unit`           VARCHAR(20)  NOT NULL DEFAULT 'unit',
  `quantity`       DECIMAL(15,3) NOT NULL DEFAULT 0,
  `company_name`   VARCHAR(200) NOT NULL DEFAULT '' COMMENT 'Primary supplier',
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_material_code` (`material_code`),
  KEY `idx_mat_category_id`    (`category_id`),
  KEY `idx_mat_subcategory_id` (`subcategory_id`),
  CONSTRAINT `fk_mat_category`    FOREIGN KEY (`category_id`)    REFERENCES `categories`    (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mat_subcategory` FOREIGN KEY (`subcategory_id`) REFERENCES `subcategories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `material_id` INT UNSIGNED NOT NULL,
  `type`        ENUM('in','out') NOT NULL,
  `quantity`    DECIMAL(15,3)    NOT NULL,
  `reference`   VARCHAR(300)     NOT NULL DEFAULT '',
  `po_number`   VARCHAR(100)     NOT NULL DEFAULT '' COMMENT 'PO Number this arrival/usage is linked to - selected from PO Number list or typed manually',
  `user_id`     INT UNSIGNED     NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sm_material_id` (`material_id`),
  KEY `idx_sm_type`        (`type`),
  KEY `idx_sm_po_number`   (`po_number`),
  KEY `idx_sm_created_at`  (`created_at`),
  CONSTRAINT `fk_sm_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`),
  CONSTRAINT `fk_sm_user`     FOREIGN KEY (`user_id`)     REFERENCES `users`     (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `material_purchases` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `material_id`   INT UNSIGNED NULL,
  `quantity`      DECIMAL(15,3)    NOT NULL,
  `company_name`  VARCHAR(200)     NOT NULL,
  `purchase_date` DATE             NOT NULL,
  `po_number`     VARCHAR(100)     NOT NULL DEFAULT '' COMMENT 'PO Number this purchase is linked to - selected from PO Number list or typed manually',
  `remarks`       VARCHAR(300)     NOT NULL DEFAULT '' COMMENT 'Remarks / Usage Location (optional)',
  `recorded_by`   INT UNSIGNED     NULL,
  `bill_data`     LONGTEXT         NULL COMMENT 'Base64-encoded bill file',
  `bill_mime_type` VARCHAR(100)    NULL,
  `bill_filename`  VARCHAR(255)    NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mp_material_id`   (`material_id`),
  KEY `idx_mp_company_name`  (`company_name`(50)),
  KEY `idx_mp_purchase_date` (`purchase_date`),
  KEY `idx_mp_po_number`     (`po_number`),
  CONSTRAINT `fk_mp_material`    FOREIGN KEY (`material_id`)  REFERENCES `materials` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mp_recorded_by` FOREIGN KEY (`recorded_by`)  REFERENCES `users`     (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- WORKERS & ASSIGNMENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `workers` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `worker_name` VARCHAR(100) NOT NULL,
  `mobile`      VARCHAR(15)  NOT NULL DEFAULT '',
  `skill`       VARCHAR(100) NOT NULL DEFAULT '',
  `active`      TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_workers_mobile` (`mobile`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `work_assignments` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `worker_id`   INT UNSIGNED NOT NULL,
  `job_card_id` INT UNSIGNED NULL,
  `work_desc`   TEXT         NOT NULL,
  `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` DATETIME    NULL,
  `status`      ENUM('Assigned','Completed') NOT NULL DEFAULT 'Assigned',
  PRIMARY KEY (`id`),
  KEY `idx_wa_worker_id`   (`worker_id`),
  KEY `idx_wa_job_card_id` (`job_card_id`),
  CONSTRAINT `fk_wa_worker`   FOREIGN KEY (`worker_id`)   REFERENCES `workers`   (`id`),
  CONSTRAINT `fk_wa_job_card` FOREIGN KEY (`job_card_id`) REFERENCES `job_cards` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPANY DEALERS / SUPPLIERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `dealers` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_name`        VARCHAR(200) NOT NULL,
  `contact_person`      VARCHAR(100) NOT NULL DEFAULT '',
  `mobile`              VARCHAR(15)  NOT NULL DEFAULT '',
  `email`               VARCHAR(150) NOT NULL DEFAULT '',
  `address`             TEXT,
  `materials_supplied`  TEXT COMMENT 'Free-text description of what they supply',
  `gst_number`          VARCHAR(20)  NOT NULL DEFAULT '',
  `notes`               TEXT,
  `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- ESTIMATIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `estimations` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`       VARCHAR(200) NOT NULL,
  `customer_id` INT UNSIGNED NULL,
  `product`     VARCHAR(100) NOT NULL DEFAULT '',
  `capacity`    VARCHAR(30)  NOT NULL DEFAULT '',
  `data`        JSON         NOT NULL COMMENT 'Full estimation component breakdown',
  `total_cost`  DECIMAL(15,2) NOT NULL DEFAULT 0,
  `selling_price` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `margin_pct`  DECIMAL(6,2)  NOT NULL DEFAULT 0,
  `created_by`  INT UNSIGNED NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_est_customer_id` (`customer_id`),
  KEY `idx_est_created_by`  (`created_by`),
  CONSTRAINT `fk_est_customer`   FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_est_created_by` FOREIGN KEY (`created_by`)  REFERENCES `users`     (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `price_lists` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(100) NOT NULL,
  `product`    VARCHAR(100) NOT NULL DEFAULT '',
  `items`      JSON         NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- DISPATCHES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `dispatches` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dispatch_number` VARCHAR(20)  NOT NULL,
  `so_id`           INT UNSIGNED NOT NULL,
  `job_card_id`     INT UNSIGNED NULL,
  `vehicle_number`  VARCHAR(30)  NOT NULL,
  `transporter_name` VARCHAR(150) NOT NULL DEFAULT '',
  `driver_name`     VARCHAR(100) NOT NULL DEFAULT '',
  `driver_mobile`   VARCHAR(15)  NOT NULL DEFAULT '',
  `dispatch_address` TEXT,
  `dispatch_city`   VARCHAR(100) NOT NULL DEFAULT '',
  `dispatch_state`  VARCHAR(100) NOT NULL DEFAULT '',
  `dispatch_date`   DATE         NOT NULL,
  `status`          ENUM('Ready','Dispatched','Delivered') NOT NULL DEFAULT 'Ready',
  -- Form data (saved by sales team)
  `material_list_data`  JSON NULL COMMENT 'Saved Dispatch Material List form',
  `hoist_material_data` JSON NULL COMMENT 'Saved Hoist & Girder form',
  -- File attachments (JSON array of {filename, mimeType, data, size, uploaded_at})
  `attachments`     JSON NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dispatch_number` (`dispatch_number`),
  KEY `idx_dispatch_so_id`       (`so_id`),
  KEY `idx_dispatch_job_card_id` (`job_card_id`),
  KEY `idx_dispatch_status`      (`status`),
  KEY `idx_dispatch_date`        (`dispatch_date`),
  CONSTRAINT `fk_disp_so`       FOREIGN KEY (`so_id`)       REFERENCES `sales_orders` (`id`),
  CONSTRAINT `fk_disp_job_card` FOREIGN KEY (`job_card_id`) REFERENCES `job_cards`    (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACCOUNTS — INVOICES & PAYMENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `invoices` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_number`  VARCHAR(20)  NOT NULL,
  `so_id`           INT UNSIGNED NOT NULL,
  `customer_id`     INT UNSIGNED NOT NULL,
  `invoice_date`    DATE         NOT NULL,
  `due_date`        DATE         NULL,
  `amount`          DECIMAL(15,2) NOT NULL DEFAULT 0,
  `gst_amount`      DECIMAL(15,2) NOT NULL DEFAULT 0,
  `total_amount`    DECIMAL(15,2) NOT NULL DEFAULT 0,
  `advance_payment` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `balance`         DECIMAL(15,2) NOT NULL DEFAULT 0,
  `status`          ENUM('Not Invoiced','Paid','Partial','Overdue') NOT NULL DEFAULT 'Not Invoiced',
  `notes`           TEXT,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoice_number` (`invoice_number`),
  KEY `idx_inv_so_id`       (`so_id`),
  KEY `idx_inv_customer_id` (`customer_id`),
  KEY `idx_inv_status`      (`status`),
  KEY `idx_inv_due_date`    (`due_date`),
  CONSTRAINT `fk_inv_so`       FOREIGN KEY (`so_id`)       REFERENCES `sales_orders` (`id`),
  CONSTRAINT `fk_inv_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`   (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payments` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id`     INT UNSIGNED NOT NULL,
  `amount`         DECIMAL(15,2) NOT NULL,
  `payment_date`   DATE         NOT NULL,
  `payment_mode`   ENUM('Cash','Cheque','NEFT','RTGS','UPI','Other') NOT NULL DEFAULT 'NEFT',
  `reference`      VARCHAR(200) NOT NULL DEFAULT '' COMMENT 'Cheque/UTR/UPI ref',
  `notes`          TEXT,
  `recorded_by`    INT UNSIGNED NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pay_invoice_id` (`invoice_id`),
  KEY `idx_pay_date`       (`payment_date`),
  CONSTRAINT `fk_pay_invoice`      FOREIGN KEY (`invoice_id`)  REFERENCES `invoices` (`id`),
  CONSTRAINT `fk_pay_recorded_by`  FOREIGN KEY (`recorded_by`) REFERENCES `users`    (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOCUMENTS (Accounts file storage)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `documents` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`           VARCHAR(255) NOT NULL,
  `category`       VARCHAR(100) NOT NULL DEFAULT '',
  `file_data`      LONGTEXT     NOT NULL COMMENT 'Base64-encoded file',
  `file_mime_type` VARCHAR(100) NOT NULL DEFAULT '',
  `file_filename`  VARCHAR(255) NOT NULL DEFAULT '',
  `file_size`      INT UNSIGNED NOT NULL DEFAULT 0,
  `uploaded_by`    INT UNSIGNED NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_uploaded_by` (`uploaded_by`),
  KEY `idx_doc_category`    (`category`),
  CONSTRAINT `fk_doc_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPANY SETTINGS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `company_settings` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_name` VARCHAR(200) NOT NULL DEFAULT 'Energy Tech Crane Pvt. Ltd.',
  `address`      TEXT,
  `phone`        VARCHAR(20)  NOT NULL DEFAULT '',
  `email`        VARCHAR(150) NOT NULL DEFAULT '',
  `website`      VARCHAR(200) NOT NULL DEFAULT '',
  `gst_number`   VARCHAR(20)  NOT NULL DEFAULT '',
  `pan_number`   VARCHAR(20)  NOT NULL DEFAULT '',
  `bank_name`    VARCHAR(100) NOT NULL DEFAULT '',
  `bank_account` VARCHAR(30)  NOT NULL DEFAULT '',
  `bank_ifsc`    VARCHAR(20)  NOT NULL DEFAULT '',
  `bank_branch`  VARCHAR(100) NOT NULL DEFAULT '',
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `company_certificates` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(200) NOT NULL,
  `cert_number` VARCHAR(100) NOT NULL DEFAULT '',
  `issued_by`   VARCHAR(200) NOT NULL DEFAULT '',
  `valid_until` DATE         NULL,
  `file_data`   LONGTEXT     NULL COMMENT 'Base64 file',
  `file_mime`   VARCHAR(100) NULL,
  `file_name`   VARCHAR(255) NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `company_team` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(100) NOT NULL,
  `title`      VARCHAR(150) NOT NULL DEFAULT '',
  `mobile`     VARCHAR(15)  NOT NULL DEFAULT '',
  `email`      VARCHAR(150) NOT NULL DEFAULT '',
  `photo_data` LONGTEXT     NULL COMMENT 'Base64 photo',
  `photo_mime` VARCHAR(100) NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACTIVITY LOG (immutable audit trail for every create/update/delete)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED NULL,
  `user_name`   VARCHAR(100) NOT NULL DEFAULT '',
  `action`      VARCHAR(30)  NOT NULL,
  `module`      VARCHAR(50)  NOT NULL,
  `record_id`   INT UNSIGNED NULL,
  `details`     TEXT,
  `snapshot`    JSON         NULL COMMENT 'Full record snapshot for restorable deletes',
  `restorable`  TINYINT(1)   NOT NULL DEFAULT 0,
  `restored_at` DATETIME     NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_al_user_id`    (`user_id`),
  KEY `idx_al_module`     (`module`),
  KEY `idx_al_action`     (`action`),
  KEY `idx_al_created_at` (`created_at`),
  CONSTRAINT `fk_al_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
