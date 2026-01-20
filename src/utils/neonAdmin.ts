import { neon } from '@neondatabase/serverless';

// Lazy-load SQL connection to avoid build-time errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sql: any = null;

function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// Helper to execute raw SQL with parameters
async function execSql(query: string, params: unknown[] = []): Promise<unknown[]> {
  const sql = getSql();
  // Use sql.unsafe() for raw queries with parameters
  if (params.length === 0) {
    return sql.unsafe(query);
  }
  return sql.unsafe(query, params);
}

// Type for query results
interface QueryResult<T> {
  data: T[] | null;
  error: Error | null;
}

interface SingleQueryResult<T> {
  data: T | null;
  error: Error | null;
}

// Query builder that mimics Supabase's API but uses Neon
class NeonQueryBuilder<T = Record<string, unknown>> {
  private tableName: string;
  private selectColumns: string = '*';
  private whereConditions: { column: string; value: unknown; operator: string }[] = [];
  private orderByColumn: string | null = null;
  private orderDirection: 'ASC' | 'DESC' = 'ASC';
  private limitValue: number | null = null;
  private isSingle: boolean = false;
  private insertData: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private updateData: Record<string, unknown> | null = null;
  private shouldSelect: boolean = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns: string = '*', _options?: { count?: 'exact' | 'planned' | 'estimated' }): NeonQueryBuilder<T> {
    this.selectColumns = columns;
    this.shouldSelect = true;
    // count option is noted but we'll calculate from results
    return this;
  }

  eq(column: string, value: unknown): NeonQueryBuilder<T> {
    this.whereConditions.push({ column, value, operator: '=' });
    return this;
  }

  neq(column: string, value: unknown): NeonQueryBuilder<T> {
    this.whereConditions.push({ column, value, operator: '!=' });
    return this;
  }

  gt(column: string, value: unknown): NeonQueryBuilder<T> {
    this.whereConditions.push({ column, value, operator: '>' });
    return this;
  }

  gte(column: string, value: unknown): NeonQueryBuilder<T> {
    this.whereConditions.push({ column, value, operator: '>=' });
    return this;
  }

  lt(column: string, value: unknown): NeonQueryBuilder<T> {
    this.whereConditions.push({ column, value, operator: '<' });
    return this;
  }

  lte(column: string, value: unknown): NeonQueryBuilder<T> {
    this.whereConditions.push({ column, value, operator: '<=' });
    return this;
  }

  like(column: string, value: string): NeonQueryBuilder<T> {
    this.whereConditions.push({ column, value, operator: 'LIKE' });
    return this;
  }

  ilike(column: string, value: string): NeonQueryBuilder<T> {
    this.whereConditions.push({ column, value, operator: 'ILIKE' });
    return this;
  }

  is(column: string, value: unknown): NeonQueryBuilder<T> {
    this.whereConditions.push({ column, value, operator: 'IS' });
    return this;
  }

  not(column: string, operator: string, value: unknown): NeonQueryBuilder<T> {
    // Handle 'is' operator for NOT NULL checks
    if (operator === 'is' && value === null) {
      this.whereConditions.push({ column, value: null, operator: 'IS NOT' });
    } else {
      this.whereConditions.push({ column, value, operator: `NOT ${operator.toUpperCase()}` });
    }
    return this;
  }

  in(column: string, values: unknown[]): NeonQueryBuilder<T> {
    this.whereConditions.push({ column, value: values, operator: 'IN' });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): NeonQueryBuilder<T> {
    this.orderByColumn = column;
    this.orderDirection = options?.ascending === false ? 'DESC' : 'ASC';
    return this;
  }

  limit(count: number): NeonQueryBuilder<T> {
    this.limitValue = count;
    return this;
  }

  single(): NeonSingleQueryBuilder<T> {
    this.isSingle = true;
    this.limitValue = 1;
    return new NeonSingleQueryBuilder(this);
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]): NeonQueryBuilder<T> {
    this.insertData = data;
    return this;
  }

  update(data: Record<string, unknown>): NeonQueryBuilder<T> {
    this.updateData = data;
    return this;
  }

  upsert(data: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): NeonUpsertBuilder<T> {
    return new NeonUpsertBuilder<T>(this.tableName, data, options?.onConflict, options?.ignoreDuplicates);
  }

  delete(): NeonDeleteFromBuilder {
    return new NeonDeleteFromBuilder(this.tableName, this.whereConditions);
  }

  private buildWhereClause(paramOffset: number = 0): { clause: string; values: unknown[] } {
    if (this.whereConditions.length === 0) {
      return { clause: '', values: [] };
    }

    const clauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = paramOffset + 1;

    for (const condition of this.whereConditions) {
      if (condition.operator === 'IS') {
        clauses.push(`"${condition.column}" IS ${condition.value === null ? 'NULL' : 'NOT NULL'}`);
      } else if (condition.operator === 'IS NOT') {
        clauses.push(`"${condition.column}" IS NOT NULL`);
      } else if (condition.operator === 'IN') {
        const inValues = condition.value as unknown[];
        const placeholders = inValues.map((_, i) => `$${paramIndex + i}`).join(', ');
        clauses.push(`"${condition.column}" IN (${placeholders})`);
        values.push(...inValues);
        paramIndex += inValues.length;
      } else {
        clauses.push(`"${condition.column}" ${condition.operator} $${paramIndex}`);
        values.push(condition.value);
        paramIndex++;
      }
    }

    return { clause: `WHERE ${clauses.join(' AND ')}`, values };
  }

  async then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = await this.execute();
      if (onfulfilled) {
        return onfulfilled(result);
      }
      return result as unknown as TResult1;
    } catch (error) {
      if (onrejected) {
        return onrejected(error);
      }
      throw error;
    }
  }

  async execute(): Promise<QueryResult<T>> {

    try {
      // INSERT operation
      if (this.insertData !== null) {
        const dataArray = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
        if (dataArray.length === 0) {
          return { data: [], error: null };
        }

        const columns = Object.keys(dataArray[0]);
        const columnList = columns.map(c => `"${c}"`).join(', ');

        const allValues: unknown[] = [];
        const valueRows: string[] = [];
        let paramIndex = 1;

        for (const row of dataArray) {
          const placeholders: string[] = [];
          for (const col of columns) {
            placeholders.push(`$${paramIndex++}`);
            allValues.push(row[col]);
          }
          valueRows.push(`(${placeholders.join(', ')})`);
        }

        const returning = this.shouldSelect ? ` RETURNING ${this.selectColumns}` : ' RETURNING *';
        const query = `INSERT INTO "${this.tableName}" (${columnList}) VALUES ${valueRows.join(', ')}${returning}`;

        const result = await execSql(query, allValues);
        return { data: result as T[], error: null };
      }

      // UPDATE operation
      if (this.updateData !== null) {
        const columns = Object.keys(this.updateData);
        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        for (const col of columns) {
          setClauses.push(`"${col}" = $${paramIndex++}`);
          values.push(this.updateData[col]);
        }

        const { clause: whereClause, values: whereValues } = this.buildWhereClause(values.length);
        values.push(...whereValues);

        const returning = this.shouldSelect ? ` RETURNING ${this.selectColumns}` : ' RETURNING *';
        const query = `UPDATE "${this.tableName}" SET ${setClauses.join(', ')} ${whereClause}${returning}`;

        const result = await execSql(query, values);
        return { data: result as T[], error: null };
      }

      // SELECT operation
      const { clause: whereClause, values: whereValues } = this.buildWhereClause();

      let query = `SELECT ${this.selectColumns} FROM "${this.tableName}" ${whereClause}`;

      if (this.orderByColumn) {
        query += ` ORDER BY "${this.orderByColumn}" ${this.orderDirection}`;
      }

      if (this.limitValue !== null) {
        query += ` LIMIT ${this.limitValue}`;
      }

      const result = await execSql(query, whereValues);
      return { data: result as T[], error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  // Internal method to get state for single query builder
  getState() {
    return {
      tableName: this.tableName,
      selectColumns: this.selectColumns,
      whereConditions: this.whereConditions,
      orderByColumn: this.orderByColumn,
      orderDirection: this.orderDirection,
      limitValue: this.limitValue,
      insertData: this.insertData,
      updateData: this.updateData,
      shouldSelect: this.shouldSelect,
    };
  }
}

// Single result query builder
class NeonSingleQueryBuilder<T = Record<string, unknown>> {
  private parent: NeonQueryBuilder<T>;

  constructor(parent: NeonQueryBuilder<T>) {
    this.parent = parent;
  }

  select(columns: string = '*'): NeonSingleQueryBuilder<T> {
    this.parent.select(columns);
    return this;
  }

  async then<TResult1 = SingleQueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: SingleQueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = await this.parent.execute();
      const singleResult: SingleQueryResult<T> = {
        data: result.data && result.data.length > 0 ? result.data[0] : null,
        error: result.error,
      };
      if (onfulfilled) {
        return onfulfilled(singleResult);
      }
      return singleResult as unknown as TResult1;
    } catch (error) {
      if (onrejected) {
        return onrejected(error);
      }
      throw error;
    }
  }
}

// UPSERT query builder
class NeonUpsertBuilder<T = Record<string, unknown>> {
  private tableName: string;
  private data: Record<string, unknown> | Record<string, unknown>[];
  private conflictColumn: string | undefined;
  private ignoreDuplicates: boolean = false;
  private selectColumns: string = '*';
  private isSingle: boolean = false;

  constructor(tableName: string, data: Record<string, unknown> | Record<string, unknown>[], conflictColumn?: string, ignoreDuplicates?: boolean) {
    this.tableName = tableName;
    this.data = data;
    this.conflictColumn = conflictColumn;
    this.ignoreDuplicates = ignoreDuplicates || false;
  }

  select(columns: string = '*'): NeonUpsertBuilder<T> {
    this.selectColumns = columns;
    return this;
  }

  single(): NeonUpsertBuilder<T> {
    this.isSingle = true;
    return this;
  }

  async then<TResult1 = { data: T | T[] | null; error: Error | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: T | T[] | null; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = await this.execute();
      // If single() was called, return just the first item
      const finalResult = this.isSingle
        ? { data: result.data && result.data.length > 0 ? result.data[0] : null, error: result.error }
        : result;
      if (onfulfilled) {
        return onfulfilled(finalResult);
      }
      return finalResult as unknown as TResult1;
    } catch (error) {
      if (onrejected) {
        return onrejected(error);
      }
      throw error;
    }
  }

  private async execute(): Promise<{ data: T[] | null; error: Error | null }> {

    try {
      const dataArray = Array.isArray(this.data) ? this.data : [this.data];
      if (dataArray.length === 0) {
        return { data: [], error: null };
      }

      const columns = Object.keys(dataArray[0]);
      const columnList = columns.map(c => `"${c}"`).join(', ');

      const allValues: unknown[] = [];
      const valueRows: string[] = [];
      let paramIndex = 1;

      for (const row of dataArray) {
        const placeholders: string[] = [];
        for (const col of columns) {
          placeholders.push(`$${paramIndex++}`);
          allValues.push(row[col]);
        }
        valueRows.push(`(${placeholders.join(', ')})`);
      }

      // Build ON CONFLICT clause
      const conflictCol = this.conflictColumn || columns[0];
      let onConflictClause: string;

      if (this.ignoreDuplicates) {
        onConflictClause = `ON CONFLICT ("${conflictCol}") DO NOTHING`;
      } else {
        const updateClauses = columns
          .filter(c => c !== conflictCol)
          .map(c => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');
        onConflictClause = `ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateClauses}`;
      }

      const query = `INSERT INTO "${this.tableName}" (${columnList}) VALUES ${valueRows.join(', ')} ${onConflictClause} RETURNING ${this.selectColumns}`;

      const result = await execSql(query, allValues);
      return { data: result as T[], error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }
}

// DELETE query builder from .from().delete() chain
class NeonDeleteFromBuilder {
  private tableName: string;
  private whereConditions: { column: string; value: unknown; operator: string }[];

  constructor(tableName: string, existingConditions: { column: string; value: unknown; operator: string }[] = []) {
    this.tableName = tableName;
    this.whereConditions = [...existingConditions];
  }

  eq(column: string, value: unknown): NeonDeleteFromBuilder {
    this.whereConditions.push({ column, value, operator: '=' });
    return this;
  }

  neq(column: string, value: unknown): NeonDeleteFromBuilder {
    this.whereConditions.push({ column, value, operator: '!=' });
    return this;
  }

  in(column: string, values: unknown[]): NeonDeleteFromBuilder {
    this.whereConditions.push({ column, value: values, operator: 'IN' });
    return this;
  }

  private buildWhereClause(): { clause: string; values: unknown[] } {
    if (this.whereConditions.length === 0) {
      return { clause: '', values: [] };
    }

    const clauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const condition of this.whereConditions) {
      if (condition.operator === 'IN') {
        const inValues = condition.value as unknown[];
        const placeholders = inValues.map((_, i) => `$${paramIndex + i}`).join(', ');
        clauses.push(`"${condition.column}" IN (${placeholders})`);
        values.push(...inValues);
        paramIndex += inValues.length;
      } else {
        clauses.push(`"${condition.column}" ${condition.operator} $${paramIndex}`);
        values.push(condition.value);
        paramIndex++;
      }
    }

    return { clause: `WHERE ${clauses.join(' AND ')}`, values };
  }

  async then<TResult1 = { data: null; error: Error | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = await this.execute();
      if (onfulfilled) {
        return onfulfilled(result);
      }
      return result as unknown as TResult1;
    } catch (error) {
      if (onrejected) {
        return onrejected(error);
      }
      throw error;
    }
  }

  private async execute(): Promise<{ data: null; error: Error | null }> {

    try {
      const { clause: whereClause, values: whereValues } = this.buildWhereClause();
      const query = `DELETE FROM "${this.tableName}" ${whereClause}`;

      await execSql(query, whereValues);
      return { data: null, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }
}

// DELETE query builder (legacy - used for neonAdmin.delete())
class NeonDeleteBuilder {
  private tableName: string;
  private whereConditions: { column: string; value: unknown; operator: string }[] = [];

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  eq(column: string, value: unknown): NeonDeleteBuilder {
    this.whereConditions.push({ column, value, operator: '=' });
    return this;
  }

  private buildWhereClause(): { clause: string; values: unknown[] } {
    if (this.whereConditions.length === 0) {
      return { clause: '', values: [] };
    }

    const clauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const condition of this.whereConditions) {
      clauses.push(`"${condition.column}" ${condition.operator} $${paramIndex}`);
      values.push(condition.value);
      paramIndex++;
    }

    return { clause: `WHERE ${clauses.join(' AND ')}`, values };
  }

  async then<TResult1 = { data: null; error: Error | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = await this.execute();
      if (onfulfilled) {
        return onfulfilled(result);
      }
      return result as unknown as TResult1;
    } catch (error) {
      if (onrejected) {
        return onrejected(error);
      }
      throw error;
    }
  }

  private async execute(): Promise<{ data: null; error: Error | null }> {

    try {
      const { clause: whereClause, values: whereValues } = this.buildWhereClause();
      const query = `DELETE FROM "${this.tableName}" ${whereClause}`;

      await execSql(query, whereValues);
      return { data: null, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }
}

// Main client object mimicking Supabase interface
export const neonAdmin = {
  from<T = Record<string, unknown>>(tableName: string): NeonQueryBuilder<T> {
    return new NeonQueryBuilder<T>(tableName);
  },

  // For delete operations
  delete(tableName: string): NeonDeleteBuilder {
    return new NeonDeleteBuilder(tableName);
  }
};

// For backwards compatibility
export function getNeonAdmin() {
  return neonAdmin;
}

// Direct SQL access for complex queries
export { getSql };
