// src/polyfill.ts

if (typeof (globalThis as any).DOMException === 'undefined') {
  class DOMExceptionPolyfill extends Error {
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name || 'DOMException';
    }
  }
  (globalThis as any).DOMException = DOMExceptionPolyfill;
}