import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import CodeGate from "./CodeGate.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CodeGate>
      <App />
    </CodeGate>
  </React.StrictMode>
);
