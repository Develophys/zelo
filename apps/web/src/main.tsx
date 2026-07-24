import "./app/index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";

if (import.meta.env.DEV) {
  import("@/dev/seed-assessment-history").then(({ seedAssessmentHistory }) => {
    Object.assign(window, { seedAssessmentHistory });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
