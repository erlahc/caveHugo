import React, { useState, useRef, useMemo, useEffect } from "react";
import { supabase } from "./supabaseClient";

const COULEURS = ["Rouge", "Blanc", "Rosé", "Effervescent"];
const SEAL_COLOR = { Rouge: "#6b1424", Blanc: "#c8a84b", "Rosé": "#d98a8f", Effervescent: "#c9b878" };

const EMPTY_FORM = { cuvee: "", domaine: "", appellation: "", millesime: "", region: "", couleur: "Rouge", quantite: 1 };

// ---------- Utilitaires ----------
function slugify(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "+")
    .replace(/^\+|\+$/g, "");
}

function buildWineSearcherUrl(bottle) {
  const parts = [bottle.domaine, bottle.cuvee, bottle.appellation].filter(Boolean).join(" ");
  const slug = slugify(parts);
  if (!slug) return null;
  return `https://www.wine-searcher.com/find/${slug}${bottle.millesime ? "/" + bottle.millesime : ""}`;
}

function bottleLabel(b) {
  return [b.domaine, b.cuvee].filter(Boolean).join(" — ") || "Bouteille sans nom";
}

// Convertit une ligne Supabase (snake_case) en objet du formulaire (camelCase côté quantité identique)
function fromRow(row) {
  return {
    id: row.id,
    cuvee: row.cuvee || "",
    domaine: row.domaine || "",
    appellation: row.appellation || "",
    millesime: row.millesime,
    region: row.region || "",
    couleur: row.couleur || "Rouge",
    quantite: row.quantite ?? 1,
    wineSearcherUrl: row.wine_searcher_url || null,
  };
}

export default function CaveApp() {
  const [bottles, setBottles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modal, setModal] = useState(null); // null | "add" | "edit" | "photo"
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [colorFilter, setColorFilter] = useState("Toutes");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);

  // flux photo
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoStatus, setPhotoStatus] = useState("idle"); // idle | analyzing | ready | error
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef(null);

  // ---------- Chargement initial depuis Supabase ----------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      const { data, error } = await supabase
        .from("bouteilles")
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setLoadError("Impossible de charger la cave : " + error.message);
      } else {
        setBottles((data || []).map(fromRow));
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return bottles.filter((b) => {
      const matchesSearch =
        !search ||
        bottleLabel(b).toLowerCase().includes(search.toLowerCase()) ||
        (b.appellation || "").toLowerCase().includes(search.toLowerCase()) ||
        (b.region || "").toLowerCase().includes(search.toLowerCase());
      const matchesColor = colorFilter === "Toutes" || b.couleur === colorFilter;
      return matchesSearch && matchesColor;
    });
  }, [bottles, search, colorFilter]);

  const totalBottles = bottles.reduce((sum, b) => sum + (b.quantite || 0), 0);
  const byColor = COULEURS.map((c) => ({
    couleur: c,
    total: bottles.filter((b) => b.couleur === c).reduce((s, b) => s + (b.quantite || 0), 0),
  })).filter((c) => c.total > 0);

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setModal("add");
  }

  function openEdit(bottle) {
    setForm({
      cuvee: bottle.cuvee || "",
      domaine: bottle.domaine || "",
      appellation: bottle.appellation || "",
      millesime: bottle.millesime || "",
      region: bottle.region || "",
      couleur: bottle.couleur || "Rouge",
      quantite: bottle.quantite || 1,
    });
    setEditingId(bottle.id);
    setModal("edit");
  }

  function buildPayload(f) {
    const millesime = f.millesime ? parseInt(f.millesime, 10) : null;
    const quantite = f.quantite ? parseInt(f.quantite, 10) : 1;
    const wineSearcherUrl = buildWineSearcherUrl({ ...f, millesime });
    return {
      cuvee: f.cuvee,
      domaine: f.domaine,
      appellation: f.appellation,
      millesime,
      region: f.region,
      couleur: f.couleur,
      quantite,
      wine_searcher_url: wineSearcherUrl,
    };
  }

  async function saveForm(e) {
    e.preventDefault();
    setSaving(true);
    const payload = buildPayload(form);

    if (editingId) {
      const { data, error } = await supabase
        .from("bouteilles")
        .update(payload)
        .eq("id", editingId)
        .select()
        .single();
      if (!error && data) {
        setBottles((prev) => prev.map((b) => (b.id === editingId ? fromRow(data) : b)));
      }
    } else {
      const { data, error } = await supabase.from("bouteilles").insert(payload).select().single();
      if (!error && data) {
        setBottles((prev) => [fromRow(data), ...prev]);
      }
    }
    setSaving(false);
    closeModal();
  }

  async function deleteBottle(id) {
    setBottles((prev) => prev.filter((b) => b.id !== id)); // optimiste
    setConfirmDeleteId(null);
    const { error } = await supabase.from("bouteilles").delete().eq("id", id);
    if (error) {
      setLoadError("La suppression a échoué : " + error.message);
    }
  }

  function closeModal() {
    setModal(null);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPhotoPreview(null);
    setPhotoStatus("idle");
    setPhotoError("");
  }

  function openPhotoFlow() {
    setModal("photo");
    setPhotoPreview(null);
    setPhotoStatus("idle");
    setPhotoError("");
  }

  async function handlePhotoSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      setPhotoPreview(dataUrl);
      setPhotoStatus("analyzing");
      setPhotoError("");

      try {
        const base64 = dataUrl.split(",")[1];
        const mediaType = file.type || "image/jpeg";

        // Appel à la Netlify Function (voir netlify/functions/analyze-label.js)
        // qui relaie vers l'API Claude sans exposer la clé API dans le navigateur.
        const response = await fetch("/.netlify/functions/analyze-label", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mediaType }),
        });

        if (!response.ok) throw new Error("Réponse serveur invalide");
        const parsed = await response.json();

        setForm({
          cuvee: parsed.cuvee || "",
          domaine: parsed.domaine || "",
          appellation: parsed.appellation || "",
          millesime: parsed.millesime || "",
          region: parsed.region || "",
          couleur: COULEURS.includes(parsed.couleur) ? parsed.couleur : "Rouge",
          quantite: 1,
        });
        setPhotoStatus("ready");
      } catch (err) {
        setPhotoStatus("error");
        setPhotoError("La lecture de l'étiquette a échoué. Tu peux réessayer ou compléter le formulaire à la main.");
      }
    };
    reader.readAsDataURL(file);
  }

  async function confirmPhotoBottle(e) {
    e.preventDefault();
    setSaving(true);
    const payload = buildPayload(form);
    const { data, error } = await supabase.from("bouteilles").insert(payload).select().single();
    if (!error && data) {
      setBottles((prev) => [fromRow(data), ...prev]);
    }
    setSaving(false);
    closeModal();
  }

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input, select { font-family: 'Inter', sans-serif; }
        ::placeholder { color: #9c8b7a; }
      `}</style>

      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Cave Saint-Terre</p>
          <h1 style={styles.title}>Ton carnet de cave</h1>
        </div>
        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <span style={styles.statNumber}>{totalBottles}</span>
            <span style={styles.statLabel}>bouteilles</span>
          </div>
          {byColor.map((c) => (
            <div key={c.couleur} style={styles.statCard}>
              <span style={{ ...styles.dot, background: SEAL_COLOR[c.couleur] }} />
              <span style={styles.statNumber}>{c.total}</span>
              <span style={styles.statLabel}>{c.couleur.toLowerCase()}</span>
            </div>
          ))}
        </div>
      </header>

      {loadError && <div style={styles.errorBanner}>{loadError}</div>}

      <div style={styles.toolbar}>
        <input
          style={styles.searchInput}
          placeholder="Rechercher un domaine, une appellation, une région…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select style={styles.select} value={colorFilter} onChange={(e) => setColorFilter(e.target.value)}>
          <option>Toutes</option>
          {COULEURS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button style={styles.btnGhost} onClick={openPhotoFlow}>
          📷 Ajouter par photo
        </button>
        <button style={styles.btnPrimary} onClick={openAdd}>
          + Ajouter une bouteille
        </button>
      </div>

      <div style={styles.tableWrap}>
        {loading ? (
          <p style={{ padding: 24, color: "#8a7660" }}>Chargement de la cave…</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}></th>
                <th style={styles.th}>Bouteille</th>
                <th style={styles.th}>Appellation</th>
                <th style={styles.th}>Millésime</th>
                <th style={styles.th}>Région</th>
                <th style={{ ...styles.th, textAlign: "center" }}>Qté</th>
                <th style={{ ...styles.th, textAlign: "center" }}>Wine-Searcher</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const wsUrl = b.wineSearcherUrl || buildWineSearcherUrl(b);
                return (
                  <tr key={b.id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={{ ...styles.seal, background: SEAL_COLOR[b.couleur] || "#999" }} title={b.couleur} />
                    </td>
                    <td style={{ ...styles.td, fontFamily: "'Fraunces', serif", fontWeight: 600, color: "#2b1a14" }}>
                      {bottleLabel(b)}
                    </td>
                    <td style={styles.td}>{b.appellation || "—"}</td>
                    <td style={styles.td}>{b.millesime || "—"}</td>
                    <td style={styles.td}>{b.region || "—"}</td>
                    <td style={{ ...styles.td, textAlign: "center" }}>{b.quantite}</td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      {wsUrl ? (
                        <a href={wsUrl} target="_blank" rel="noopener noreferrer" style={styles.wsLink}>
                          Voir la fiche ↗
                        </a>
                      ) : (
                        <span style={{ color: "#b3a290" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                      <button style={styles.iconBtn} onClick={() => openEdit(b)} aria-label="Modifier">
                        ✎
                      </button>
                      {confirmDeleteId === b.id ? (
                        <>
                          <button style={styles.iconBtnDanger} onClick={() => deleteBottle(b.id)}>
                            Confirmer
                          </button>
                          <button style={styles.iconBtn} onClick={() => setConfirmDeleteId(null)}>
                            Annuler
                          </button>
                        </>
                      ) : (
                        <button style={styles.iconBtn} onClick={() => setConfirmDeleteId(b.id)} aria-label="Supprimer">
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...styles.td, textAlign: "center", padding: "40px 0", color: "#9c8b7a" }}>
                    Aucune bouteille ne correspond à ta recherche.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {(modal === "add" || modal === "edit") && (
        <div style={styles.overlay} onClick={closeModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{modal === "edit" ? "Modifier la bouteille" : "Ajouter une bouteille"}</h2>
            <form onSubmit={saveForm} style={styles.form}>
              <FormFields form={form} setForm={setForm} />
              <div style={styles.modalActions}>
                <button type="button" style={styles.btnGhost} onClick={closeModal}>
                  Annuler
                </button>
                <button type="submit" style={styles.btnPrimary} disabled={saving}>
                  {saving ? "Enregistrement…" : modal === "edit" ? "Enregistrer" : "Ajouter à la cave"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === "photo" && (
        <div style={styles.overlay} onClick={closeModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Ajouter par photo</h2>

            {photoStatus === "idle" && (
              <div style={styles.photoDrop} onClick={() => fileInputRef.current?.click()}>
                <p style={{ fontSize: "2rem", margin: 0 }}>📷</p>
                <p style={{ margin: "8px 0 0", color: "#6b5a49" }}>Prends en photo l'étiquette, ou choisis une image</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={handlePhotoSelected}
                />
              </div>
            )}

            {photoStatus !== "idle" && photoPreview && (
              <div style={styles.photoPreviewRow}>
                <img src={photoPreview} alt="Étiquette" style={styles.photoThumb} />
                <div style={{ flex: 1 }}>
                  {photoStatus === "analyzing" && <p style={styles.photoStatusText}>Lecture de l'étiquette en cours…</p>}
                  {photoStatus === "error" && <p style={{ ...styles.photoStatusText, color: "#a33636" }}>{photoError}</p>}
                  {photoStatus === "ready" && <p style={styles.photoStatusText}>Voici ce que j'ai lu — vérifie et corrige si besoin :</p>}
                </div>
              </div>
            )}

            {(photoStatus === "ready" || photoStatus === "error") && (
              <form onSubmit={confirmPhotoBottle} style={styles.form}>
                <FormFields form={form} setForm={setForm} />
                <div style={styles.modalActions}>
                  <button type="button" style={styles.btnGhost} onClick={closeModal}>
                    Annuler
                  </button>
                  <button type="submit" style={styles.btnPrimary} disabled={saving}>
                    {saving ? "Enregistrement…" : "Ajouter à la cave"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FormFields({ form, setForm }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <>
      <div style={styles.formRow}>
        <label style={styles.label}>
          Domaine / Producteur
          <input style={styles.input} value={form.domaine} onChange={set("domaine")} placeholder="Ex. Ferraton Père & Fils" />
        </label>
        <label style={styles.label}>
          Cuvée
          <input style={styles.input} value={form.cuvee} onChange={set("cuvee")} placeholder="Ex. Les Miaux" />
        </label>
      </div>
      <div style={styles.formRow}>
        <label style={styles.label}>
          Appellation
          <input style={styles.input} value={form.appellation} onChange={set("appellation")} placeholder="Ex. Hermitage" />
        </label>
        <label style={styles.label}>
          Millésime
          <input style={styles.input} type="number" value={form.millesime} onChange={set("millesime")} placeholder="Ex. 2020" />
        </label>
      </div>
      <div style={styles.formRow}>
        <label style={styles.label}>
          Région
          <input style={styles.input} value={form.region} onChange={set("region")} placeholder="Ex. Rhône Nord" />
        </label>
        <label style={styles.label}>
          Couleur
          <select style={styles.input} value={form.couleur} onChange={set("couleur")}>
            {COULEURS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label style={{ ...styles.label, maxWidth: 140 }}>
        Quantité
        <input style={styles.input} type="number" min="0" value={form.quantite} onChange={set("quantite")} />
      </label>
    </>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f6efe2", fontFamily: "'Inter', sans-serif", color: "#2b1a14", padding: "32px 24px 80px" },
  header: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 20, maxWidth: 1100, margin: "0 auto 28px", borderBottom: "2px solid #d8c6a8", paddingBottom: 20 },
  eyebrow: { margin: 0, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#a3401f", fontWeight: 600 },
  title: { margin: "4px 0 0", fontFamily: "'Fraunces', serif", fontSize: "2.1rem", fontWeight: 700, color: "#3b2415" },
  statsRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  statCard: { display: "flex", alignItems: "baseline", gap: 6, background: "#fffaf1", border: "1px solid #e4d5b8", borderRadius: 10, padding: "8px 14px" },
  statNumber: { fontFamily: "'Fraunces', serif", fontSize: "1.3rem", fontWeight: 700, color: "#6b1424" },
  statLabel: { fontSize: 12, color: "#8a7660" },
  dot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block", marginRight: 2 },
  errorBanner: { maxWidth: 1100, margin: "0 auto 16px", background: "#fbe4e4", border: "1px solid #e3a9a9", color: "#7a2323", borderRadius: 10, padding: "10px 16px", fontSize: 14 },
  toolbar: { maxWidth: 1100, margin: "0 auto 18px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" },
  searchInput: { flex: "1 1 260px", padding: "10px 14px", borderRadius: 999, border: "1px solid #d8c6a8", background: "#fffaf1", fontSize: 14, color: "#2b1a14" },
  select: { padding: "10px 14px", borderRadius: 999, border: "1px solid #d8c6a8", background: "#fffaf1", fontSize: 14, color: "#2b1a14" },
  btnPrimary: { background: "#6b1424", color: "#fdf3e4", border: "none", borderRadius: 999, padding: "11px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  btnGhost: { background: "transparent", color: "#6b1424", border: "1.5px solid #6b1424", borderRadius: 999, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  tableWrap: { maxWidth: 1100, margin: "0 auto", background: "#fffaf1", border: "1px solid #e4d5b8", borderRadius: 14, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "12px 14px", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a7660", borderBottom: "1px solid #e4d5b8", background: "#f3e8d3" },
  tr: { borderBottom: "1px solid #efe3cc" },
  td: { padding: "12px 14px", color: "#4a3a2c", verticalAlign: "middle" },
  seal: { width: 12, height: 12, borderRadius: "50%", display: "inline-block" },
  wsLink: { color: "#a3401f", fontWeight: 600, textDecoration: "none", fontSize: 13 },
  iconBtn: { background: "none", border: "1px solid #e4d5b8", borderRadius: 8, padding: "5px 9px", marginRight: 6, cursor: "pointer", fontSize: 13, color: "#6b5a49" },
  iconBtnDanger: { background: "#a33636", color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", marginRight: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  overlay: { position: "fixed", inset: 0, background: "rgba(43,26,20,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 40 },
  modal: { background: "#fffaf1", borderRadius: 16, padding: "28px 28px 24px", maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(43,26,20,0.35)" },
  modalTitle: { fontFamily: "'Fraunces', serif", fontSize: "1.4rem", fontWeight: 700, color: "#3b2415", margin: "0 0 18px" },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  formRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  label: { flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#6b5a49", fontWeight: 600 },
  input: { padding: "9px 12px", borderRadius: 8, border: "1px solid #d8c6a8", fontSize: 14, color: "#2b1a14", background: "#fff" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 },
  photoDrop: { border: "2px dashed #d8c6a8", borderRadius: 12, padding: "36px 20px", textAlign: "center", cursor: "pointer", marginBottom: 8 },
  photoPreviewRow: { display: "flex", gap: 14, alignItems: "center", marginBottom: 16 },
  photoThumb: { width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: "1px solid #e4d5b8" },
  photoStatusText: { margin: 0, fontSize: 14, color: "#4a3a2c" },
};
