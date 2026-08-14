// Cette fonction tourne côté serveur chez Netlify, jamais dans le navigateur.
// La clé API reste donc dans une variable d'environnement Netlify (voir README),
// jamais dans le code livré au client.

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { image, mediaType } = JSON.parse(event.body);
    if (!image) {
      return { statusCode: 400, body: JSON.stringify({ error: "Image manquante" }) };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } },
              {
                type: "text",
                text:
                  "Voici la photo d'une étiquette de bouteille de vin. Extrait les informations et réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises markdown, au format exact : " +
                  '{"cuvee": "", "domaine": "", "appellation": "", "millesime": null, "region": "", "couleur": "Rouge|Blanc|Rosé|Effervescent"}. ' +
                  "Si une information n'est pas lisible sur l'étiquette, laisse le champ vide (ou null pour millesime). Le champ 'region' doit être la région viticole française ou étrangère la plus probable au vu de l'appellation.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 502, body: JSON.stringify({ error: "Erreur API Claude", detail: errText }) };
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    const raw = (textBlock?.text || "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Erreur serveur", detail: String(err) }) };
  }
}
