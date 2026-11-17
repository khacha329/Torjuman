// Where this build's proxy Worker is, read once. WebHttpClient.ts routes the
// import and retrieval requests through it (in production; the dev server
// proxies them itself), and library/relayTransfer.ts sends whole-tablet
// transfers to the same Worker. Both used to compute this expression on their
// own; restructure Phase 2 step 2d gave it one home.

/** The proxy Worker this build was given (vite.config.ts), no trailing slash; empty if none. */
export const PROXY_URL: string = (import.meta.env.VITE_PROXY_URL ?? '').replace(/\/+$/, '');
