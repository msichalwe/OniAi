import React, { useState, useEffect, useRef, useCallback } from "react";
import { Delete } from "lucide-react";
import "./Calculator.css";

export default function Calculator({ expression: initialExpr }) {
  const [display, setDisplay] = useState(initialExpr || "0");
  const [expression, setExpression] = useState("");
  const [shouldReset, setShouldReset] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const calcRef = useRef(null);

  const handleNumber = useCallback(
    (num) => {
      if (shouldReset) {
        setDisplay(num);
        setShouldReset(false);
      } else {
        setDisplay(display === "0" ? num : display + num);
      }
    },
    [display, shouldReset],
  );

  const handleOperator = useCallback(
    (op) => {
      setExpression(display + " " + op + " ");
      setShouldReset(true);
    },
    [display],
  );

  const handleEquals = useCallback(() => {
    try {
      const fullExpr = expression + display;
      const result = Function(
        '"use strict"; return (' +
          fullExpr.replace(/×/g, "*").replace(/÷/g, "/") +
          ")",
      )();
      const resultStr = String(parseFloat(result.toFixed(10)));
      setDisplay(resultStr);
      setLastResult(resultStr);
      setExpression(fullExpr + " =");
      setShouldReset(true);
    } catch {
      setDisplay("Error");
      setShouldReset(true);
    }
  }, [expression, display]);

  const handleClear = useCallback(() => {
    setDisplay("0");
    setExpression("");
    setShouldReset(false);
    setLastResult(null);
  }, []);

  const handlePercent = useCallback(() => {
    setDisplay(String(parseFloat(display) / 100));
  }, [display]);

  const handleToggleSign = useCallback(() => {
    setDisplay(String(-parseFloat(display)));
  }, [display]);

  const handleDecimal = useCallback(() => {
    if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  }, [display]);

  const handleBackspace = useCallback(() => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay("0");
    }
  }, [display]);

  // Keyboard support
  useEffect(() => {
    const el = calcRef.current;
    if (!el) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      const key = e.key;

      if (/^[0-9]$/.test(key)) {
        handleNumber(key);
      } else if (key === "." || key === ",") {
        handleDecimal();
      } else if (key === "+" || key === "-") {
        handleOperator(key);
      } else if (key === "*") {
        handleOperator("×");
      } else if (key === "/") {
        handleOperator("÷");
      } else if (key === "Enter" || key === "=") {
        handleEquals();
      } else if (key === "Backspace") {
        handleBackspace();
      } else if (key === "Escape" || key === "c" || key === "C") {
        handleClear();
      } else if (key === "%") {
        handlePercent();
      }
    };

    el.addEventListener("keydown", handleKeyDown);
    el.focus();
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [
    handleNumber,
    handleOperator,
    handleEquals,
    handleClear,
    handleDecimal,
    handleBackspace,
    handlePercent,
  ]);

  const buttons = [
    { label: "AC", type: "function", action: handleClear },
    { label: "±", type: "function", action: handleToggleSign },
    { label: "%", type: "function", action: handlePercent },
    { label: "÷", type: "operator", action: () => handleOperator("÷") },
    { label: "7", type: "number", action: () => handleNumber("7") },
    { label: "8", type: "number", action: () => handleNumber("8") },
    { label: "9", type: "number", action: () => handleNumber("9") },
    { label: "×", type: "operator", action: () => handleOperator("×") },
    { label: "4", type: "number", action: () => handleNumber("4") },
    { label: "5", type: "number", action: () => handleNumber("5") },
    { label: "6", type: "number", action: () => handleNumber("6") },
    { label: "−", type: "operator", action: () => handleOperator("-") },
    { label: "1", type: "number", action: () => handleNumber("1") },
    { label: "2", type: "number", action: () => handleNumber("2") },
    { label: "3", type: "number", action: () => handleNumber("3") },
    { label: "+", type: "operator", action: () => handleOperator("+") },
    { label: "⌫", type: "function", action: handleBackspace },
    { label: "0", type: "number", action: () => handleNumber("0") },
    { label: ".", type: "number", action: handleDecimal },
    { label: "=", type: "equals", action: handleEquals },
  ];

  // Auto-size display text
  const displayLen = display.length;
  const fontSize =
    displayLen > 12
      ? "clamp(18px, 4vw, 24px)"
      : displayLen > 8
        ? "clamp(24px, 5vw, 32px)"
        : "clamp(32px, 7vw, 48px)";

  return (
    <div className="calculator-widget" ref={calcRef} tabIndex={0}>
      <div className="calc-display">
        <div className="calc-expression">{expression}</div>
        <div className="calc-result" style={{ fontSize }}>
          {display}
        </div>
        {lastResult && expression.includes("=") && (
          <div className="calc-last-result">= {lastResult}</div>
        )}
      </div>
      <div className="calc-grid">
        {buttons.map((btn, i) => (
          <button
            key={i}
            className={`calc-btn ${btn.type}`}
            onClick={btn.action}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
