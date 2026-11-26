const OriginalResponse = globalThis.Response;

(globalThis as any).Response = class MockResponse extends OriginalResponse {
  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: any }) {
    if (init && init.status === 101) {
      super(null, { status: 200, headers: init.headers });
      Object.defineProperty(this, "status", { value: 101, writable: false });
      if (init.webSocket) {
        (this as any).webSocket = init.webSocket;
      }
    } else {
      super(body, init);
    }
  }
};
