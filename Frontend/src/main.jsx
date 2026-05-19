import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { ensureDevToken } from "./api/ensureDevToken.js";

async function bootstrap() {
  try {
    await ensureDevToken(); // <-- get token before any API call happens
  } catch (e) {
    console.error("Dev login failed:", e);
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();