// In-memory stand-ins so the real scan route runs without PostgreSQL.
export function getDb(){ return { query: async () => ({ rows: [], rowCount: 0 }), connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release(){} }) }; }
export function databaseFailureCode(error){ const c=String(error?.code||""); return /^[0-9A-Z]{5}$/.test(c)?c:null; }
