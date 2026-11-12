// onnxruntime-web for the browser, WebAssembly only. Pass it to createKtpReader({ort}).
// On the server (Node, SSR) "ktp-kit/ort" resolves to ort.server.js instead, so imports never break a server build.
export * from "onnxruntime-web/wasm";
