// In-memory stand-ins so the real scan route runs without PostgreSQL.
export function getDb(){ return { query: async () => ({ rows: [], rowCount: 0 }), connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release(){} }) }; }
