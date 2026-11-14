-- Initialize SQLPilot's internal metadata database
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'SQLPilotMeta')
BEGIN
    CREATE DATABASE SQLPilotMeta;
END
GO

USE SQLPilotMeta;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'users')
BEGIN
    CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        email NVARCHAR(255) NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'connections')
BEGIN
    CREATE TABLE connections (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        name NVARCHAR(100) NOT NULL,
        server_host NVARCHAR(255) NOT NULL,
        port INT NOT NULL DEFAULT 1433,
        database_name NVARCHAR(128) NOT NULL,
        login_username NVARCHAR(128) NOT NULL,
        secret_ref NVARCHAR(255) NOT NULL,
        is_read_only BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_connections_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'schema_cache')
BEGIN
    CREATE TABLE schema_cache (
        id INT IDENTITY(1,1) PRIMARY KEY,
        connection_id INT NOT NULL UNIQUE,
        schema_json NVARCHAR(MAX) NOT NULL,
        refreshed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_schema_cache_connection FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'query_history')
BEGIN
    CREATE TABLE query_history (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        connection_id INT NOT NULL,
        nl_prompt NVARCHAR(MAX) NULL,
        generated_sql NVARCHAR(MAX) NOT NULL,
        status NVARCHAR(50) NOT NULL,
        row_count INT NULL,
        duration_ms INT NULL,
        error NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_query_history_user FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT FK_query_history_connection FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'saved_snippets')
BEGIN
    CREATE TABLE saved_snippets (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        connection_id INT NOT NULL,
        title NVARCHAR(255) NOT NULL,
        sql_text NVARCHAR(MAX) NOT NULL,
        notes NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_saved_snippets_user FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT FK_saved_snippets_connection FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'index_recommendations')
BEGIN
    CREATE TABLE index_recommendations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        connection_id INT NOT NULL,
        table_name NVARCHAR(255) NOT NULL,
        suggested_index NVARCHAR(MAX) NOT NULL,
        impact_estimate FLOAT NULL,
        rationale NVARCHAR(MAX) NULL,
        source NVARCHAR(50) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_index_rec_connection FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
    );
END
GO
