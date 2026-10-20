import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The theme comes first, so each component's own styles can build on it.
import "./styles/theme.css";
import { App } from "./App.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing the #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
