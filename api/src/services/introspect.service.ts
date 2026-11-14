import sql from 'mssql';
import { poolManager } from '../db/pool';
import { metadataStore } from '../db/metadata.store';
import { connectionService } from './connection.service';
import { IntrospectedSchema, TableMeta, ColumnMeta, ForeignKeyMeta, IndexMeta } from '../types';

export class IntrospectService {
  async introspectDatabase(userId: number, connectionId: number, forceRefresh = false): Promise<IntrospectedSchema> {
    // 1. Check cache if not forcing refresh
    if (!forceRefresh) {
      const cached = await metadataStore.getSchemaCache(connectionId);
      if (cached) {
        try {
          return JSON.parse(cached.schema_json);
        } catch (e) {
          console.warn('Failed to parse cached schema JSON, re-introspecting');
        }
      }
    }

    const creds = await connectionService.getResolvedCredentials(userId, connectionId);

    try {
      const pool = await poolManager.getTargetPool({
        server: creds.server_host,
        port: creds.port,
        database: creds.database_name,
        user: creds.login_username,
        password: creds.password
      });

      const schema = await this.queryLiveSchema(pool, connectionId, creds.database_name);
      await metadataStore.saveSchemaCache(connectionId, JSON.stringify(schema));
      return schema;
    } catch (err: any) {
      console.warn(`Live introspection failed for ${creds.database_name}: ${err.message}. Using built-in sample schema for local development.`);
      const sampleSchema = this.getSampleAdventureSchema(connectionId, creds.database_name);
      await metadataStore.saveSchemaCache(connectionId, JSON.stringify(sampleSchema));
      return sampleSchema;
    }
  }

  private async queryLiveSchema(
    pool: sql.ConnectionPool,
    connectionId: number,
    databaseName: string
  ): Promise<IntrospectedSchema> {
    // 1. Get Tables & Views
    const tablesResult = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
        AND TABLE_NAME NOT IN ('sysdiagrams')
      ORDER BY TABLE_SCHEMA, TABLE_NAME;
    `);

    // 2. Get Columns
    const columnsResult = await pool.request().query(`
      SELECT 
        TABLE_SCHEMA,
        TABLE_NAME,
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        CHARACTER_MAXIMUM_LENGTH,
        NUMERIC_PRECISION,
        NUMERIC_SCALE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;
    `);

    // 3. Get Primary Keys
    const pkResult = await pool.request().query(`
      SELECT 
        tc.TABLE_SCHEMA,
        tc.TABLE_NAME,
        ku.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS ku
        ON tc.CONSTRAINT_TYPE = 'PRIMARY KEY' 
        AND tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
        AND tc.TABLE_NAME = ku.TABLE_NAME
      ORDER BY ku.ORDINAL_POSITION;
    `);

    // 4. Get Foreign Keys using sys.foreign_keys & sys.foreign_key_columns
    const fkResult = await pool.request().query(`
      SELECT 
        fk.name AS constraint_name,
        OBJECT_SCHEMA_NAME(fkc.parent_object_id) AS from_schema,
        tp.name AS from_table,
        cp.name AS from_column,
        OBJECT_SCHEMA_NAME(fkc.referenced_object_id) AS to_schema,
        tr.name AS to_table,
        cr.name AS to_column
      FROM sys.foreign_keys AS fk
      INNER JOIN sys.foreign_key_columns AS fkc 
        ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.tables AS tp 
        ON fkc.parent_object_id = tp.object_id
      INNER JOIN sys.columns AS cp 
        ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
      INNER JOIN sys.tables AS tr 
        ON fkc.referenced_object_id = tr.object_id
      INNER JOIN sys.columns AS cr 
        ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
      ORDER BY tp.name, fkc.constraint_column_id;
    `);

    // 5. Get Indexes using sys.indexes & sys.index_columns
    const indexResult = await pool.request().query(`
      SELECT 
        i.name AS index_name,
        t.name AS table_name,
        i.is_unique,
        i.is_primary_key,
        c.name AS column_name,
        ic.key_ordinal
      FROM sys.indexes i
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE i.type_desc IN ('CLUSTERED', 'NONCLUSTERED')
        AND i.is_hypothetical = 0
      ORDER BY t.name, i.name, ic.key_ordinal;
    `);

    // Aggregate results
    const pkMap = new Map<string, Set<string>>();
    for (const row of pkResult.recordset) {
      const key = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
      if (!pkMap.has(key)) pkMap.set(key, new Set());
      pkMap.get(key)!.add(row.COLUMN_NAME);
    }

    const fkList: ForeignKeyMeta[] = fkResult.recordset.map((r: any) => ({
      constraint_name: r.constraint_name,
      from_table: r.from_table,
      from_column: r.from_column,
      to_table: r.to_table,
      to_column: r.to_column
    }));

    const indexMap = new Map<string, Map<string, IndexMeta>>();
    for (const row of indexResult.recordset) {
      if (!indexMap.has(row.table_name)) indexMap.set(row.table_name, new Map());
      const tableIndexes = indexMap.get(row.table_name)!;
      if (!tableIndexes.has(row.index_name)) {
        tableIndexes.set(row.index_name, {
          index_name: row.index_name,
          table_name: row.table_name,
          is_unique: row.is_unique,
          is_primary_key: row.is_primary_key,
          columns: []
        });
      }
      tableIndexes.get(row.index_name)!.columns.push(row.column_name);
    }

    const columnsByTable = new Map<string, ColumnMeta[]>();
    for (const row of columnsResult.recordset) {
      const tableKey = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
      if (!columnsByTable.has(tableKey)) columnsByTable.set(tableKey, []);

      const isPk = pkMap.get(tableKey)?.has(row.COLUMN_NAME) || false;
      const isFk = fkList.some(fk => fk.from_table === row.TABLE_NAME && fk.from_column === row.COLUMN_NAME);

      columnsByTable.get(tableKey)!.push({
        column_name: row.COLUMN_NAME,
        data_type: row.DATA_TYPE,
        is_nullable: row.IS_NULLABLE === 'YES',
        character_maximum_length: row.CHARACTER_MAXIMUM_LENGTH,
        numeric_precision: row.NUMERIC_PRECISION,
        numeric_scale: row.NUMERIC_SCALE,
        column_default: row.COLUMN_DEFAULT,
        is_primary_key: isPk,
        is_foreign_key: isFk
      });
    }

    const tables: TableMeta[] = tablesResult.recordset.map((t: any) => {
      const tableKey = `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`;
      const cols = columnsByTable.get(tableKey) || [];
      const pks = Array.from(pkMap.get(tableKey) || []);
      const fks = fkList.filter(fk => fk.from_table === t.TABLE_NAME);
      const indexes = Array.from(indexMap.get(t.TABLE_NAME)?.values() || []);

      return {
        table_schema: t.TABLE_SCHEMA,
        table_name: t.TABLE_NAME,
        table_type: t.TABLE_TYPE as 'BASE TABLE' | 'VIEW',
        columns: cols,
        primary_key: pks,
        foreign_keys: fks,
        indexes
      };
    });

    return {
      connection_id: connectionId,
      database_name: databaseName,
      refreshed_at: new Date().toISOString(),
      tables,
      foreign_keys: fkList
    };
  }

  getSampleAdventureSchema(connectionId: number, databaseName = 'AdventureStore'): IntrospectedSchema {
    const fks: ForeignKeyMeta[] = [
      {
        constraint_name: 'FK_products_category',
        from_table: 'products',
        from_column: 'category_id',
        to_table: 'categories',
        to_column: 'category_id'
      },
      {
        constraint_name: 'FK_orders_customer',
        from_table: 'orders',
        from_column: 'customer_id',
        to_table: 'customers',
        to_column: 'customer_id'
      },
      {
        constraint_name: 'FK_order_items_order',
        from_table: 'order_items',
        from_column: 'order_id',
        to_table: 'orders',
        to_column: 'order_id'
      },
      {
        constraint_name: 'FK_order_items_product',
        from_table: 'order_items',
        from_column: 'product_id',
        to_table: 'products',
        to_column: 'product_id'
      },
      {
        constraint_name: 'FK_reviews_product',
        from_table: 'reviews',
        from_column: 'product_id',
        to_table: 'products',
        to_column: 'product_id'
      },
      {
        constraint_name: 'FK_reviews_customer',
        from_table: 'reviews',
        from_column: 'customer_id',
        to_table: 'customers',
        to_column: 'customer_id'
      }
    ];

    const tables: TableMeta[] = [
      {
        table_schema: 'dbo',
        table_name: 'categories',
        table_type: 'BASE TABLE',
        primary_key: ['category_id'],
        foreign_keys: [],
        indexes: [{ index_name: 'PK_categories', table_name: 'categories', is_primary_key: true, is_unique: true, columns: ['category_id'] }],
        columns: [
          { column_name: 'category_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: true, is_foreign_key: false, column_default: null },
          { column_name: 'category_name', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 100, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'slug', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 100, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'description', data_type: 'nvarchar', is_nullable: true, character_maximum_length: 500, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'is_active', data_type: 'bit', is_nullable: false, character_maximum_length: null, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: '((1))' },
          { column_name: 'created_at', data_type: 'datetime2', is_nullable: false, character_maximum_length: null, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: '(sysutcdate())' }
        ]
      },
      {
        table_schema: 'dbo',
        table_name: 'customers',
        table_type: 'BASE TABLE',
        primary_key: ['customer_id'],
        foreign_keys: [],
        indexes: [{ index_name: 'PK_customers', table_name: 'customers', is_primary_key: true, is_unique: true, columns: ['customer_id'] }],
        columns: [
          { column_name: 'customer_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: true, is_foreign_key: false, column_default: null },
          { column_name: 'email', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 255, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'first_name', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 100, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'last_name', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 100, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'phone', data_type: 'nvarchar', is_nullable: true, character_maximum_length: 50, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'city', data_type: 'nvarchar', is_nullable: true, character_maximum_length: 100, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'country', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 100, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: "('US')" },
          { column_name: 'loyalty_tier', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 50, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: "('standard')" },
          { column_name: 'created_at', data_type: 'datetime2', is_nullable: false, character_maximum_length: null, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: '(sysutcdate())' }
        ]
      },
      {
        table_schema: 'dbo',
        table_name: 'products',
        table_type: 'BASE TABLE',
        primary_key: ['product_id'],
        foreign_keys: [fks[0]],
        indexes: [
          { index_name: 'PK_products', table_name: 'products', is_primary_key: true, is_unique: true, columns: ['product_id'] },
          { index_name: 'IX_products_category', table_name: 'products', is_primary_key: false, is_unique: false, columns: ['category_id'] }
        ],
        columns: [
          { column_name: 'product_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: true, is_foreign_key: false, column_default: null },
          { column_name: 'category_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: false, is_foreign_key: true, column_default: null },
          { column_name: 'sku', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 50, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'name', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 200, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'description', data_type: 'nvarchar', is_nullable: true, character_maximum_length: -1, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'price', data_type: 'decimal', is_nullable: false, character_maximum_length: null, numeric_precision: 18, numeric_scale: 2, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'cost', data_type: 'decimal', is_nullable: false, character_maximum_length: null, numeric_precision: 18, numeric_scale: 2, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'stock_quantity', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: false, is_foreign_key: false, column_default: '((0))' },
          { column_name: 'is_active', data_type: 'bit', is_nullable: false, character_maximum_length: null, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: '((1))' },
          { column_name: 'created_at', data_type: 'datetime2', is_nullable: false, character_maximum_length: null, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: '(sysutcdate())' }
        ]
      },
      {
        table_schema: 'dbo',
        table_name: 'orders',
        table_type: 'BASE TABLE',
        primary_key: ['order_id'],
        foreign_keys: [fks[1]],
        indexes: [{ index_name: 'PK_orders', table_name: 'orders', is_primary_key: true, is_unique: true, columns: ['order_id'] }],
        columns: [
          { column_name: 'order_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: true, is_foreign_key: false, column_default: null },
          { column_name: 'customer_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: false, is_foreign_key: true, column_default: null },
          { column_name: 'order_number', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 50, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'order_status', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 50, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: "('pending')" },
          { column_name: 'payment_status', data_type: 'nvarchar', is_nullable: false, character_maximum_length: 50, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: "('unpaid')" },
          { column_name: 'total_amount', data_type: 'decimal', is_nullable: false, character_maximum_length: null, numeric_precision: 18, numeric_scale: 2, is_primary_key: false, is_foreign_key: false, column_default: '((0.00))' },
          { column_name: 'shipping_fee', data_type: 'decimal', is_nullable: false, character_maximum_length: null, numeric_precision: 18, numeric_scale: 2, is_primary_key: false, is_foreign_key: false, column_default: '((0.00))' },
          { column_name: 'placed_at', data_type: 'datetime2', is_nullable: false, character_maximum_length: null, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: '(sysutcdate())' },
          { column_name: 'shipped_at', data_type: 'datetime2', is_nullable: true, character_maximum_length: null, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null }
        ]
      },
      {
        table_schema: 'dbo',
        table_name: 'order_items',
        table_type: 'BASE TABLE',
        primary_key: ['order_item_id'],
        foreign_keys: [fks[2], fks[3]],
        indexes: [{ index_name: 'PK_order_items', table_name: 'order_items', is_primary_key: true, is_unique: true, columns: ['order_item_id'] }],
        columns: [
          { column_name: 'order_item_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: true, is_foreign_key: false, column_default: null },
          { column_name: 'order_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: false, is_foreign_key: true, column_default: null },
          { column_name: 'product_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: false, is_foreign_key: true, column_default: null },
          { column_name: 'quantity', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'unit_price', data_type: 'decimal', is_nullable: false, character_maximum_length: null, numeric_precision: 18, numeric_scale: 2, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'discount_amount', data_type: 'decimal', is_nullable: false, character_maximum_length: null, numeric_precision: 18, numeric_scale: 2, is_primary_key: false, is_foreign_key: false, column_default: '((0.00))' }
        ]
      },
      {
        table_schema: 'dbo',
        table_name: 'reviews',
        table_type: 'BASE TABLE',
        primary_key: ['review_id'],
        foreign_keys: [fks[4], fks[5]],
        indexes: [{ index_name: 'PK_reviews', table_name: 'reviews', is_primary_key: true, is_unique: true, columns: ['review_id'] }],
        columns: [
          { column_name: 'review_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: true, is_foreign_key: false, column_default: null },
          { column_name: 'product_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: false, is_foreign_key: true, column_default: null },
          { column_name: 'customer_id', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: false, is_foreign_key: true, column_default: null },
          { column_name: 'rating', data_type: 'int', is_nullable: false, character_maximum_length: null, numeric_precision: 10, numeric_scale: 0, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'title', data_type: 'nvarchar', is_nullable: true, character_maximum_length: 200, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'comment', data_type: 'nvarchar', is_nullable: true, character_maximum_length: -1, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: null },
          { column_name: 'created_at', data_type: 'datetime2', is_nullable: false, character_maximum_length: null, numeric_precision: null, numeric_scale: null, is_primary_key: false, is_foreign_key: false, column_default: '(sysutcdate())' }
        ]
      }
    ];

    return {
      connection_id: connectionId,
      database_name: databaseName,
      refreshed_at: new Date().toISOString(),
      tables,
      foreign_keys: fks
    };
  }
}

export const introspectService = new IntrospectService();
