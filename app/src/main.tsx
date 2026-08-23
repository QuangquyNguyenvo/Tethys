import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

/**
 * Đẩy mọi lỗi runtime của frontend xuống đĩa (`%TEMP%\noname_frontend_error.log`).
 * Bản release không mở được devtools, nên nếu không có chỗ này thì một lỗi JS lúc khởi
 * động chỉ hiện ra thành cửa sổ trắng và không có manh mối nào.
 */
const report = (message: string) => {
  invoke("frontend_error", { message }).catch(() => {});
};

window.addEventListener("error", (e) => {
  report(`[error] ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack ?? ""}`);
});

window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason as { stack?: string } | undefined;
  report(`[rejection] ${r?.stack ?? String(e.reason)}`);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
