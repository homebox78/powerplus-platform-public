/* global Office, document */
import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

/* Office.js가 준비된 뒤에 React를 마운트한다.
   PowerPoint 외부(브라우저)에서 열어도 UI는 보이도록 host 체크는 App 내부에서 처리. */
Office.onReady(() => {
  const container = document.getElementById("root");
  if (!container) return;
  const root = createRoot(container);
  root.render(<App />);
});
