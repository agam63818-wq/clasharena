// tests/helpers.js
// A minimal, chainable mock of the Supabase JS client for the API handlers.
// The handlers only use: auth.getUser, from(table).select/insert/update/delete
// chained with .eq(...) and terminals .single() / .maybeSingle() / direct
// await, plus rpc(fn, args).
//
// How it works: every terminal await consumes one "step" — a pre-configured
// outcome matched against the context (table, op, chain, payload). Every
// consumed call is recorded in `calls` so tests can assert exactly what the
// handler sent to the database (e.g. which user id it wrote).

export function createMockClient({ steps = [], getUser } = {}) {
  const calls = [];

  const take = (ctx) => {
    const step = steps.find((s) => !s.used && (!s.match || s.match(ctx)));
    if (!step) {
      throw new Error('No mock step configured for: ' + describeCtx(ctx));
    }
    step.used = true;
    calls.push(ctx);
    return typeof step.value === 'function' ? step.value(ctx) : step.value;
  };

  const build = (ctx) =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') {
            return (res, rej) => Promise.resolve(take(ctx)).then(res, rej);
          }
          if (prop === 'catch') {
            return (rej) => Promise.resolve(take(ctx)).catch(rej);
          }
          if (prop === 'single') return () => build({ ...ctx, single: true });
          if (prop === 'maybeSingle') return () => build({ ...ctx, maybeSingle: true });
          if (['select', 'eq', 'neq', 'in', 'gte', 'gt', 'lte', 'lt', 'is', 'order', 'limit', 'range', 'not'].includes(prop)) {
            return (...args) => build({ ...ctx, chain: [...(ctx.chain || []), [prop, ...args]] });
          }
          if (prop === 'insert' || prop === 'update') {
            return (payload) => build({ ...ctx, op: prop, payload, chain: [] });
          }
          if (prop === 'delete') {
            return () => build({ ...ctx, op: 'delete', chain: [] });
          }
          return undefined;
        }
      }
    );

  const client = {
    auth: { getUser: getUser },
    from: (table) => build({ kind: 'db', table, op: 'select', chain: [] }),
    // supabase.rpc() resolves to { data, error } like every other call.
    // A step value wrapped with rpcFailure(...) makes the call resolve with
    // that object as `error` (a missing function, a transport failure, ...).
    rpc: async (fn, args) => {
      const step = take({ kind: 'rpc', fn, args });
      if (step && step.__rpcError) return { data: null, error: step.__rpcError };
      return { data: step, error: null };
    }
  };

  return { client, calls };
}

function describeCtx(ctx) {
  if (ctx.kind === 'rpc') return `rpc ${ctx.fn}`;
  const chain = (ctx.chain || []).map(([fn, ...args]) => `${fn}(${args.map(String).join(', ')})`).join('.');
  return `${ctx.table}.${ctx.op}${chain ? ' -> ' + chain : ''}${ctx.single ? ' single' : ''}${ctx.maybeSingle ? ' maybeSingle' : ''}`;
}

// Wrap a mock RPC step value so the call resolves as a failure:
//   { match: (c) => c.kind === 'rpc', value: rpcFailure({ code: 'PGRST202', message: '...' }) }
export function rpcFailure(error) {
  return { __rpcError: error };
}

// Standard request/response doubles for Vercel-style handlers.
export function makeReq({ token, body, method = 'POST' } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return { method, headers, body: body || {} };
}

export function makeRes() {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

// Test users
export const USER_A = { id: '11111111-1111-4111-8111-111111111111', email: 'a@test.com' };
export const USER_B = { id: '22222222-2222-4222-8222-222222222222', email: 'b@test.com' };
export const ADMIN = { id: '33333333-3333-4333-8333-333333333333', email: 'admin@test.com' };
export const TOURNAMENT_ID = '44444444-4444-4444-8444-444444444444';

// authGetUserFor({ 'tok-A': USER_A, 'tok-admin': ADMIN })
// -> supabase.auth.getUser(token) double; unknown tokens fail like expired JWTs.
export function authGetUserFor(tokens) {
  return async (token) => {
    const user = tokens[token];
    if (user) return { data: { user }, error: null };
    return { data: { user: null }, error: { message: 'Invalid JWT' } };
  };
}
