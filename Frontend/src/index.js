import React from "react";
import { createRoot } from "react-dom/client"; // ⬅️ pastikan pakai createRoot dari react-dom/client
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

// Pastikan ada elemen <div id="root"></div> di public/index.html
const container = document.getElementById("root");

// Tambahan proteksi bila elemen root tidak ditemukan
if (!container) {
  throw new Error("❌ Elemen root tidak ditemukan. Pastikan index.html memiliki <div id='root'>");
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Optional: untuk analytics atau performance log
reportWebVitals();
