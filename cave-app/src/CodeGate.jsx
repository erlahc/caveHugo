import React, { useState, useEffect, useCallback } from "react";
import pixGif from "./pix_gif.gif";

// Code d'accès : défini via la variable d'environnement VITE_APP_CODE
// (Netlify > Site configuration > Environment variables). Valeur de repli si absente.
const CODE = String(import.meta.env.VITE_APP_CODE || "1234");
const STORAGE_KEY = "cave-saint-terre-unlocked";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"];

// Reverrouille l'appli (appelé depuis le bouton "Verrouiller" de la barre d'outils)
export function lockApp() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* rien à nettoyer */
  }
  window.location.reload();
}

export default function CodeGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === CODE;
    } catch {
      return false;
    }
  });
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);

  const push = useCallback((d) => {
    setError(false);
    setDigits((prev) => (prev.length >= 4 ? prev : prev + d));
  }, []);

  const back = useCallback(() => {
    setError(false);
    setDigits((prev) => prev.slice(0, -1));
  }, []);

  // Validation dès que 4 chiffres sont saisis
  useEffect(() => {
    if (digits.length < 4) return;
    if (digits === CODE) {
      try {
        localStorage.setItem(STORAGE_KEY, CODE);
      } catch {
        /* mode privé : on déverrouille quand même pour la session */
      }
      setUnlocked(true);
    } else {
      setError(true);
      const t = setTimeout(() => setDigits(""), 600);
      return () => clearTimeout(t);
    }
  }, [digits]);

  // Saisie au clavier (desktop)
  useEffect(() => {
    if (unlocked) return;
    function onKeyDown(e) {
      if (/^[0-9]$/.test(e.key)) push(e.key);
      else if (e.key === "Backspace") back();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [unlocked, push, back]);

  if (unlocked) return children;

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-7px); }
          40% { transform: translateX(7px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .gate-shake { animation: shake 0.4s ease; }
        .gate-key:active { background: #f3e8d3; transform: scale(0.96); }
      `}</style>

      <div style={styles.bg} aria-hidden="true" />
      <div style={styles.scrim} aria-hidden="true" />

      <div style={styles.card}>
        <p style={styles.eyebrow}>Cave Saint-Terre</p>
        <h1 style={styles.title}>Accès protégé</h1>
        <p style={styles.subtitle}>Entre le code à 4 chiffres pour ouvrir la cave.</p>

        <div className={error ? "gate-shake" : undefined} style={styles.dots}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              style={{
                ...styles.dot,
                background: i < digits.length ? (error ? "#a33636" : "#6b1424") : "transparent",
                borderColor: error ? "#a33636" : "#d8c6a8",
              }}
            />
          ))}
        </div>

        <p style={{ ...styles.errorText, visibility: error ? "visible" : "hidden" }}>
          Code incorrect.
        </p>

        <div style={styles.pad}>
          {KEYS.map((k, i) =>
            k === "" ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                className="gate-key"
                style={k === "←" ? { ...styles.key, ...styles.keyBack } : styles.key}
                onClick={() => (k === "←" ? back() : push(k))}
                aria-label={k === "←" ? "Effacer" : k}
              >
                {k}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    position: "relative",
    minHeight: "100vh",
    background: "#f6efe2",
    fontFamily: "'Inter', sans-serif",
    color: "#2b1a14",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    overflow: "hidden",
  },
  // Fond animé : le GIF boucle indéfiniment (loop count = 0 dans le fichier)
  bg: {
    position: "fixed",
    inset: 0,
    backgroundImage: `url(${pixGif})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    zIndex: 0,
  },
  // Voile pour garder le pavé numérique lisible par-dessus le GIF
  scrim: {
    position: "fixed",
    inset: 0,
    background: "rgba(43,26,20,0.45)",
    zIndex: 0,
  },
  card: {
    position: "relative",
    zIndex: 1,
    background: "rgba(255,250,241,0.94)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    border: "1px solid #e4d5b8",
    borderRadius: 16,
    padding: "32px 28px 28px",
    width: "100%",
    maxWidth: 340,
    textAlign: "center",
    boxShadow: "0 24px 60px rgba(43,26,20,0.35)",
  },
  eyebrow: { margin: 0, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#a3401f", fontWeight: 600 },
  title: { margin: "6px 0 0", fontFamily: "'Fraunces', serif", fontSize: "1.6rem", fontWeight: 700, color: "#3b2415" },
  subtitle: { margin: "8px 0 0", fontSize: 14, color: "#8a7660" },
  dots: { display: "flex", justifyContent: "center", gap: 14, margin: "26px 0 0" },
  dot: { width: 15, height: 15, borderRadius: "50%", border: "1.5px solid #d8c6a8", display: "inline-block", transition: "background 0.15s" },
  errorText: { margin: "12px 0 4px", fontSize: 13, color: "#a33636", fontWeight: 600, minHeight: 18 },
  pad: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 8 },
  key: {
    background: "#fff",
    border: "1px solid #e4d5b8",
    borderRadius: 12,
    padding: "16px 0",
    fontSize: "1.3rem",
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    color: "#3b2415",
    cursor: "pointer",
    transition: "transform 0.08s, background 0.12s",
  },
  keyBack: { fontFamily: "'Inter', sans-serif", fontSize: "1.1rem", color: "#8a7660" },
};
