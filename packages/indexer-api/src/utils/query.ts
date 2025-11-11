/**
 * Converts TypeORM named parameters to PostgreSQL positional parameters
 * @param sql SQL query with named parameters (:paramName)
 * @param paramObj Object containing parameter values
 * @returns SQL with positional parameters ($1, $2, etc.) and array of parameter values
 */
export function convertNamedToPositionalParams(
  sql: string,
  paramObj: Record<string, any>,
): { sql: string; params: any[] } {
  // Extract parameter names in the order they appear in SQL
  const paramMatches = sql.matchAll(/:(\w+)/g);
  const paramOrder: string[] = [];
  const seen = new Set<string>();
  for (const match of paramMatches) {
    const paramName = match[1];
    if (paramName && !seen.has(paramName)) {
      paramOrder.push(paramName);
      seen.add(paramName);
    }
  }

  // Extract parameter order from SQL (TypeORM should always have matching parameters)
  const paramKeys = paramOrder.length > 0 ? paramOrder : Object.keys(paramObj);
  const paramValues: any[] = [];
  let positionalSql = sql;
  let paramIndex = 1;

  // Replace named parameters with positional ones in order
  for (const key of paramKeys) {
    if (!(key in paramObj)) continue;
    const namedParam = `:${key}`;
    const positionalParam = `$${paramIndex}`;
    // Use word boundary regex to avoid partial matches
    positionalSql = positionalSql.replace(
      new RegExp(`\\${namedParam}(?!\\w)`, "g"),
      positionalParam,
    );
    paramValues.push(paramObj[key]);
    paramIndex++;
  }

  return { sql: positionalSql, params: paramValues };
}

export interface UnionQueryOptions {
  orderBy?: string;
  orderDirection?: "ASC" | "DESC";
  limit?: number;
  offset?: number;
}

/**
 * Combines two TypeORM query builders into a single UNION ALL query
 * @param queryBuilder1 First query builder (must have getQuery() and getParameters() methods)
 * @param queryBuilder2 Second query builder (must have getQuery() and getParameters() methods)
 * @param options Options for ordering and pagination
 * @returns Object containing the final SQL query and merged parameters
 */
export function combineQueriesWithUnionAll(
  queryBuilder1: { getQuery(): string; getParameters(): Record<string, any> },
  queryBuilder2: { getQuery(): string; getParameters(): Record<string, any> },
  options: UnionQueryOptions = {},
): { sql: string; params: any[] } {
  // Get SQL and parameters from both queries
  const sql1 = queryBuilder1.getQuery();
  const params1 = queryBuilder1.getParameters();
  const sql2 = queryBuilder2.getQuery();
  const params2 = queryBuilder2.getParameters();

  // Convert named parameters to positional parameters
  const converted1 = convertNamedToPositionalParams(sql1, params1);
  const converted2 = convertNamedToPositionalParams(sql2, params2);

  // Offset second query's parameters to avoid conflicts
  const offset = converted1.params.length;
  const adjustedSql2 = converted2.sql.replace(
    /\$(\d+)/g,
    (_, num) => `$${parseInt(num, 10) + offset}`,
  );

  // Combine queries with UNION ALL
  const unionSql = `
    SELECT * FROM (
      ${converted1.sql}
    ) AS q1
    UNION ALL
    SELECT * FROM (
      ${adjustedSql2}
    ) AS q2
  `.trim();

  // Merge parameters in order
  const allParams = [...converted1.params, ...converted2.params];

  // Apply ORDER BY and pagination to the outer query
  const {
    orderBy,
    orderDirection = "DESC",
    limit = 50,
    offset: skip = 0,
  } = options;

  let finalSql = `SELECT * FROM (${unionSql}) AS combined_results`;

  if (orderBy) {
    finalSql += ` ORDER BY "${orderBy}" ${orderDirection}`;
  }

  finalSql += ` LIMIT ${limit} OFFSET ${skip}`;

  return { sql: finalSql, params: allParams };
}
