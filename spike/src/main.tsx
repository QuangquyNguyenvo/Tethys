import ReactDOM from "react-dom/client";
import App from "./App";

// SPIKE: cố tình bỏ StrictMode — double-mount làm sai số đo và gọi pty_start hai lần.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
