import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { ensureDevToken } from "./api/ensureDevToken.js";
import msalClient from "./auth/msalClient.js";

async function bootstrap() {
  try {
    await ensureDevToken(); // <-- get token before any API call happens
  } catch (e) {
    console.error("Dev login failed:", e);
  }

  // In non-development, attempt MSAL sign-in and create server session
  if (import.meta.env.MODE !== 'development') {
    // redirect-based auth handled by backend; navigate to authorize endpoint
    try {
      msalClient.startLoginRedirect();
    } catch (e) {
      console.error('Auth redirect failed', e);
    }
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();