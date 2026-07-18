const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function assertSafeIdentifier(name, label = 'name') {
    const trimmed = name.trim();
    if (!IDENTIFIER.test(trimmed)) {
        throw new Error(`Invalid ${label}: "${name}". Use letters, numbers, underscore only.`);
    }
    return trimmed;
}
function quoteIdent(name) {
    return `[${assertSafeIdentifier(name)}]`;
}
function buildSqlType(col) {
    const type = col.data_type.toUpperCase();
    switch (type) {
        case 'VARCHAR':
        case 'NVARCHAR':
        case 'CHAR':
        case 'NCHAR':
            return `${type}(${col.length && col.length > 0 ? col.length : 50})`;
        case 'DECIMAL':
        case 'NUMERIC':
            return `${type}(${col.precision ?? 18},${col.scale ?? 2})`;
        case 'INT':
        case 'BIGINT':
        case 'SMALLINT':
        case 'TINYINT':
        case 'BIT':
        case 'FLOAT':
        case 'REAL':
        case 'MONEY':
        case 'DATE':
        case 'DATETIME':
        case 'DATETIME2':
        case 'UNIQUEIDENTIFIER':
            return type;
        case 'TEXT':
            return 'NVARCHAR(MAX)';
        default:
            throw new Error(`Unsupported data type: ${col.data_type}`);
    }
}
function buildColumnClause(col) {
    const name = quoteIdent(col.name);
    const sqlType = buildSqlType(col);
    const parts = [name, sqlType];
    if (col.is_identity) {
        parts.push('IDENTITY(1,1)');
    }
    if (col.is_primary_key) {
        parts.push('PRIMARY KEY');
    }
    if (!col.nullable && !col.is_primary_key) {
        parts.push('NOT NULL');
    }
    else if (col.nullable && !col.is_primary_key) {
        parts.push('NULL');
    }
    if (col.default_value !== undefined && col.default_value !== null && String(col.default_value).trim() !== '') {
        const raw = String(col.default_value).trim();
        // Allow simple literals: numbers, bit, quoted strings, or SQL functions like GETDATE()
        if (/^(-?\d+(\.\d+)?|0|1|true|false|NULL|GETDATE\(\)|NEWID\(\)|'[^']*')$/i.test(raw)) {
            const normalized = /^true$/i.test(raw) ? '1' :
                /^false$/i.test(raw) ? '0' :
                    raw;
            parts.push(`DEFAULT ${normalized}`);
        }
        else {
            throw new Error(`Unsafe default value for column ${col.name}: ${raw}`);
        }
    }
    return parts.join(' ');
}
export function generateCreateTableSql(tableName, columns) {
    const table = assertSafeIdentifier(tableName, 'table name');
    if (!columns.length) {
        throw new Error('At least one column is required');
    }
    const colDefs = columns.map(buildColumnClause).join(',\n    ');
    return `-- Create table dbo.${table} (safe to re-run)
IF OBJECT_ID(N'dbo.${table}', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.${table} (
    ${colDefs}
    );
END`;
}
export function generateAddColumnSql(tableName, column) {
    const table = assertSafeIdentifier(tableName, 'table name');
    const colName = assertSafeIdentifier(column.name, 'column name');
    const clause = buildColumnClause(column);
    return `-- Add column ${colName} to dbo.${table} (safe to re-run)
IF COL_LENGTH(N'dbo.${table}', N'${colName}') IS NULL
BEGIN
    ALTER TABLE dbo.${table} ADD ${clause};
END`;
}
export function generateAddColumnsSql(tableName, columns) {
    return columns.map((col) => generateAddColumnSql(tableName, col)).join('\n\n');
}
export function validateCreateTableInput(input) {
    assertSafeIdentifier(input.table_name, 'table name');
    if (!input.columns?.length) {
        throw new Error('At least one column is required');
    }
    for (const col of input.columns) {
        assertSafeIdentifier(col.name, 'column name');
        buildSqlType(col);
    }
}
export function validateAddColumnInput(input) {
    assertSafeIdentifier(input.table_name, 'table name');
    assertSafeIdentifier(input.column.name, 'column name');
    buildSqlType(input.column);
}
