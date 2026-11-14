-- Initialize sample connected database with realistic schema and dedicated read-only login
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'AdventureStore')
BEGIN
    CREATE DATABASE AdventureStore;
END
GO

USE AdventureStore;
GO

-- 1. Create dedicated read-only login at server level if not exists
IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = N'sqlpilot_readonly')
BEGIN
    CREATE LOGIN sqlpilot_readonly WITH PASSWORD = N'ReadOnlyPass2026!', CHECK_POLICY = OFF;
END
GO

-- 2. Create database user mapped to login
IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = N'sqlpilot_readonly')
BEGIN
    CREATE USER sqlpilot_readonly FOR LOGIN sqlpilot_readonly;
END
GO

-- 3. Add to db_datareader (STRICTLY READ-ONLY)
ALTER ROLE db_datareader ADD MEMBER sqlpilot_readonly;
GO

-- 4. Grant view server state for DMV performance inspection
USE master;
GO
GRANT VIEW SERVER STATE TO sqlpilot_readonly;
GO

USE AdventureStore;
GO

-- 5. Seed sample schema tables with PKs, FKs, and data
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'categories')
BEGIN
    CREATE TABLE categories (
        category_id INT IDENTITY(1,1) PRIMARY KEY,
        category_name NVARCHAR(100) NOT NULL,
        slug NVARCHAR(100) NOT NULL UNIQUE,
        description NVARCHAR(500) NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'customers')
BEGIN
    CREATE TABLE customers (
        customer_id INT IDENTITY(1,1) PRIMARY KEY,
        email NVARCHAR(255) NOT NULL UNIQUE,
        first_name NVARCHAR(100) NOT NULL,
        last_name NVARCHAR(100) NOT NULL,
        phone NVARCHAR(50) NULL,
        city NVARCHAR(100) NULL,
        country NVARCHAR(100) NOT NULL DEFAULT N'US',
        loyalty_tier NVARCHAR(50) NOT NULL DEFAULT N'standard',
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'products')
BEGIN
    CREATE TABLE products (
        product_id INT IDENTITY(1,1) PRIMARY KEY,
        category_id INT NOT NULL,
        sku NVARCHAR(50) NOT NULL UNIQUE,
        name NVARCHAR(200) NOT NULL,
        description NVARCHAR(MAX) NULL,
        price DECIMAL(18,2) NOT NULL,
        cost DECIMAL(18,2) NOT NULL,
        stock_quantity INT NOT NULL DEFAULT 0,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_products_category FOREIGN KEY (category_id) REFERENCES categories(category_id)
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'orders')
BEGIN
    CREATE TABLE orders (
        order_id INT IDENTITY(1,1) PRIMARY KEY,
        customer_id INT NOT NULL,
        order_number NVARCHAR(50) NOT NULL UNIQUE,
        order_status NVARCHAR(50) NOT NULL DEFAULT N'pending',
        payment_status NVARCHAR(50) NOT NULL DEFAULT N'unpaid',
        total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        shipping_fee DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        placed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        shipped_at DATETIME2 NULL,
        CONSTRAINT FK_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'order_items')
BEGIN
    CREATE TABLE order_items (
        order_item_id INT IDENTITY(1,1) PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(18,2) NOT NULL,
        discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        CONSTRAINT FK_order_items_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
        CONSTRAINT FK_order_items_product FOREIGN KEY (product_id) REFERENCES products(product_id)
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'reviews')
BEGIN
    CREATE TABLE reviews (
        review_id INT IDENTITY(1,1) PRIMARY KEY,
        product_id INT NOT NULL,
        customer_id INT NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title NVARCHAR(200) NULL,
        comment NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_reviews_product FOREIGN KEY (product_id) REFERENCES products(product_id),
        CONSTRAINT FK_reviews_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
    );
END
GO

-- Seed sample data if empty
IF NOT EXISTS (SELECT 1 FROM categories)
BEGIN
    INSERT INTO categories (category_name, slug, description) VALUES
    (N'Electronics', N'electronics', N'Gadgets, monitors, audio devices and smart tech'),
    (N'Home Office', N'home-office', N'Ergonomic chairs, standing desks, desk accessories'),
    (N'Software', N'software', N'Developer utilities, cloud subscriptions and licenses'),
    (N'Books & Media', N'books-media', N'Technical books, audiobooks, and engineering references');
END
GO

IF NOT EXISTS (SELECT 1 FROM customers)
BEGIN
    INSERT INTO customers (email, first_name, last_name, phone, city, country, loyalty_tier) VALUES
    (N'alice@example.com', N'Alice', N'Smith', N'+1-555-0101', N'Seattle', N'US', N'platinum'),
    (N'bob@example.com', N'Bob', N'Jones', N'+1-555-0102', N'Austin', N'US', N'gold'),
    (N'charlie@example.com', N'Charlie', N'Brown', N'+1-555-0103', N'New York', N'US', N'standard'),
    (N'diana@example.com', N'Diana', N'Prince', N'+1-555-0104', N'San Francisco', N'US', N'platinum'),
    (N'evan@example.com', N'Evan', N'Wright', N'+1-555-0105', N'Chicago', N'US', N'standard');
END
GO

IF NOT EXISTS (SELECT 1 FROM products)
BEGIN
    INSERT INTO products (category_id, sku, name, description, price, cost, stock_quantity) VALUES
    (1, N'EL-4K-01', N'UltraHD 34" Curved Monitor', N'144Hz IPS display with USB-C Hub', 599.99, 380.00, 45),
    (1, N'EL-NC-02', N'Pro Noise-Canceling Headphones', N'Wireless bluetooth with ANC', 249.50, 140.00, 120),
    (1, N'EL-MECH-03', N'Custom Mechanical Keyboard', N'Hot-swappable switches with RGB backlight', 129.99, 70.00, 85),
    (2, N'HO-DESK-01', N'Motorized Standing Desk 60x30', N'Dual motor with memory presets', 489.00, 260.00, 30),
    (2, N'HO-CHAIR-02', N'Ergonomic Mesh Task Chair', N'Adjustable lumbar and 3D armrests', 349.99, 190.00, 60),
    (3, N'SW-IDE-01', N'CodePilot IDE Pro Annual', N'Multi-language intelligent developer tooling', 199.00, 20.00, 9999),
    (4, N'BK-SQL-01', N'T-SQL Querying & Internals 3rd Ed', N'Deep dive into query execution and indexing', 54.99, 22.00, 200);
END
GO

IF NOT EXISTS (SELECT 1 FROM orders)
BEGIN
    INSERT INTO orders (customer_id, order_number, order_status, payment_status, total_amount, shipping_fee, placed_at) VALUES
    (1, N'ORD-2026-001', N'completed', N'paid', 849.49, 0.00, DATEADD(DAY, -10, SYSUTCDATETIME())),
    (2, N'ORD-2026-002', N'completed', N'paid', 489.00, 25.00, DATEADD(DAY, -7, SYSUTCDATETIME())),
    (3, N'ORD-2026-003', N'shipped', N'paid', 129.99, 9.99, DATEADD(DAY, -3, SYSUTCDATETIME())),
    (4, N'ORD-2026-004', N'processing', N'paid', 749.98, 0.00, DATEADD(DAY, -1, SYSUTCDATETIME())),
    (1, N'ORD-2026-005', N'pending', N'unpaid', 54.99, 4.99, SYSUTCDATETIME());
END
GO

IF NOT EXISTS (SELECT 1 FROM order_items)
BEGIN
    INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount_amount) VALUES
    (1, 1, 1, 599.99, 0.00),
    (1, 2, 1, 249.50, 0.00),
    (2, 4, 1, 489.00, 0.00),
    (3, 3, 1, 129.99, 0.00),
    (4, 2, 1, 249.50, 0.00),
    (4, 4, 1, 489.00, 0.00),
    (5, 7, 1, 54.99, 0.00);
END
GO

IF NOT EXISTS (SELECT 1 FROM reviews)
BEGIN
    INSERT INTO reviews (product_id, customer_id, rating, title, comment) VALUES
    (1, 1, 5, N'Flawless display', N'Crisp colors and text, excellent for code editing!'),
    (2, 2, 4, N'Great sound quality', N'Noise cancelling works wonders in busy offices.'),
    (4, 4, 5, N'Worth every penny', N'Sturdy frame and smooth height transition.');
END
GO
