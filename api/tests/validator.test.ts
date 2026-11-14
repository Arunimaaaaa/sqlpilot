import { readOnlyValidator } from '../src/services/validator.service';

describe('ReadOnlyValidatorService', () => {
  describe('Permitted Read-Only Queries', () => {
    it('allows basic SELECT statement', () => {
      const sql = 'SELECT customer_id, email, first_name FROM customers WHERE country = \'US\';';
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(true);
      expect(result.statement_type).toBe('SELECT');
    });

    it('allows SELECT with JOIN, GROUP BY, and aggregations', () => {
      const sql = `
        SELECT 
          c.category_name,
          COUNT(p.product_id) AS total_products,
          AVG(p.price) AS avg_price
        FROM categories c
        INNER JOIN products p ON c.category_id = p.category_id
        WHERE p.is_active = 1
        GROUP BY c.category_name
        HAVING COUNT(p.product_id) > 2
        ORDER BY avg_price DESC;
      `;
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(true);
    });

    it('allows read-only CTE (WITH ... AS (...) SELECT ...)', () => {
      const sql = `
        WITH HighValueCustomers AS (
          SELECT customer_id, SUM(total_amount) AS total_spent
          FROM orders
          GROUP BY customer_id
          HAVING SUM(total_amount) > 500
        )
        SELECT c.first_name, c.email, h.total_spent
        FROM HighValueCustomers h
        JOIN customers c ON h.customer_id = c.customer_id;
      `;
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(true);
    });

    it('allows queries where destructive words appear inside string literals', () => {
      const sql = "SELECT product_id, name, description FROM products WHERE description LIKE '%drop shipping model%' AND name NOT LIKE '%delete%';";
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(true);
    });
  });

  describe('Blocked Destructive & Mutating Queries', () => {
    it('blocks DROP TABLE', () => {
      const sql = 'DROP TABLE customers;';
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
      expect(result.error).toMatch(/Forbidden keyword|Only SELECT/i);
    });

    it('blocks stacked queries (multi-statement injection)', () => {
      const sql = 'SELECT * FROM customers; DROP TABLE orders;';
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
      expect(result.error).toMatch(/Multiple statements/i);
    });

    it('blocks DELETE statements', () => {
      const sql = 'DELETE FROM orders WHERE order_id = 1;';
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
    });

    it('blocks UPDATE statements', () => {
      const sql = 'UPDATE products SET price = 0 WHERE product_id = 1;';
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
    });

    it('blocks INSERT statements', () => {
      const sql = "INSERT INTO categories (category_name, slug) VALUES ('Hacked', 'hacked');";
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
    });

    it('blocks TRUNCATE statements', () => {
      const sql = 'TRUNCATE TABLE reviews;';
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
    });

    it('blocks ALTER statements', () => {
      const sql = 'ALTER TABLE customers ADD hacker_flag BIT;';
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
    });

    it('blocks EXEC and stored procedures', () => {
      const sql = "EXEC sp_executesql N'SELECT * FROM customers';";
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
    });

    it('blocks SELECT ... INTO (table creation)', () => {
      const sql = 'SELECT * INTO TempBackup FROM customers;';
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
      expect(result.error).toMatch(/SELECT ... INTO is forbidden/i);
    });

    it('blocks comment smuggling attempts with newline stacked execution', () => {
      const sql = "SELECT * FROM products; -- comment \n DROP TABLE products;";
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
    });

    it('blocks block-comment smuggling attempts', () => {
      const sql = "SELECT * FROM products; /* comment */ DROP TABLE products;";
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
    });

    it('blocks CTEs that attempt mutation', () => {
      const sql = `
        WITH TargetCustomers AS (
          SELECT customer_id FROM customers WHERE country = 'Unknown'
        )
        DELETE FROM orders WHERE customer_id IN (SELECT customer_id FROM TargetCustomers);
      `;
      const result = readOnlyValidator.validate(sql);
      expect(result.is_valid).toBe(false);
    });
  });
});
