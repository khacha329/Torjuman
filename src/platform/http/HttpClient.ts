// The single seam through which the app reaches shamela.ws and the retrieval
// APIs. Nothing outside src/platform/http calls fetch() against those hosts.
//
// Web phase:    WebHttpClient rewrites shamela.ws URLs onto the Vite dev-server
//               proxy path, because shamela.ws sends no CORS headers.
// Capacitor:    a NativeHttpClient using @capacitor/http talks to shamela.ws
//               directly — native HTTP is not subject to CORS — and the proxy
//               goes away. Only this directory changes.

export interface HttpResponse {
  status: number;
  ok: boolean;
  body: string;
}

export interface HttpRequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}
