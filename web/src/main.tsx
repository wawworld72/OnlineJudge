import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initAppCheck } from "./shared/appCheck";
import { App } from "./App";

initAppCheck();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
