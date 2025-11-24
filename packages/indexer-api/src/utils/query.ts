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

type QueryBuilder = {
  getQuery(): string;
  getParameters(): Record<string, any>;
};

/**
 * Combines multiple TypeORM query builders into a single UNION ALL query
 * @param queryBuilders Array of query builders (must have getQuery() and getParameters() methods)
 * @param options Options for ordering and pagination
 * @returns Object containing the final SQL query and merged parameters
 */
export function combineQueriesWithUnionAll(
  queryBuilders: QueryBuilder[],
  options: UnionQueryOptions = {},
): { sql: string; params: any[] } {
  if (queryBuilders.length < 2) {
    throw new Error("At least 2 query builders are required");
  }

  // Convert all queries to positional parameters
  const convertedQueries = queryBuilders.map((qb) => {
    const sql = qb.getQuery();
    const params = qb.getParameters();
    return convertNamedToPositionalParams(sql, params);
  });

  // Calculate cumulative offsets for each query
  let cumulativeOffset = 0;
  const adjustedQueries = convertedQueries.map((converted, index) => {
    if (index === 0) {
      cumulativeOffset = converted.params.length;
      return converted;
    }
    const adjustedSql = converted.sql.replace(
      /\$(\d+)/g,
      (_, num) => `$${parseInt(num, 10) + cumulativeOffset}`,
    );
    cumulativeOffset += converted.params.length;
    return { sql: adjustedSql, params: converted.params };
  });

  // Build UNION ALL query
  const unionParts = adjustedQueries.map(
    (q, i) => `SELECT * FROM (${q.sql}) AS q${i + 1}`,
  );
  const unionSql = unionParts.join(" UNION ALL ");

  // Merge all parameters in order
  const allParams = adjustedQueries.flatMap((q) => q.params);

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
