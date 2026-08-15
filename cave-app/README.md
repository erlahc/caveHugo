# Cave Saint-Terre

Application de gestion de cave à vin : tableau CRUD, génération automatique de liens
Wine-Searcher, ajout de bouteille par photo (lecture d'étiquette via l'API Claude).

## 1. Créer la base de données (Supabase)

1. Crée un compte sur [supabase.com](https://supabase.com) et un nouveau projet (choisis
   une région proche, ex. `eu-west`).
2. Une fois le projet prêt, va dans **SQL Editor** > *New query*, colle le contenu de
   `supabase-schema.sql`, et exécute-le. Ça crée la table `bouteilles` avec les bonnes
   colonnes et les règles d'accès.
3. Va dans **Table Editor > bouteilles > Insert > Import data from CSV**, importe ton
   fichier `Cave_Saint_Terre_vStatique2_liens.csv`. Précise bien **`;`** comme
   délimiteur. Mappe les colonnes :
   - `cuvee` → `cuvee`
   - `domaine` → `domaine`
   - `appellation` → `appellation`
   - `millesime` → `millesime`
   - `region` → `region`
   - `couleur` → `couleur`
   - `lienwinesearch` → `wine_searcher_url`
   - ignore `index`, `liengoogle`, `fiabilite`
4. Récupère tes identifiants : **Project Settings > API** → copie `Project URL` et la
   clé `anon public`. Tu en auras besoin à l'étape 3.

## 2. Développement local (optionnel, pour tester avant de déployer)

```bash
npm install
cp .env.example .env
# remplis VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
npm run dev
```

Le tableau et le CRUD fonctionneront en local. L'ajout par photo ne fonctionnera qu'une
fois déployé sur Netlify (ou via `netlify dev`, voir plus bas), car il dépend de la
Netlify Function.

## 3. Déployer sur Netlify

1. Pousse ce dossier sur un repo GitHub (le plus simple pour les mises à jour futures) :
   ```bash
   git init
   git add .
   git commit -m "Cave Saint-Terre"
   git remote add origin <url-de-ton-repo>
   git push -u origin main
   ```
2. Sur [netlify.com](https://netlify.com), **Add new site > Import an existing project**,
   connecte ton repo GitHub. Netlify détecte `netlify.toml` automatiquement (commande de
   build `npm run build`, dossier `dist`, functions dans `netlify/functions`).
3. Avant le premier déploiement, va dans **Site configuration > Environment variables**
   et ajoute quatre variables :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_CODE` (le code à 4 chiffres qui ouvre l'appli — voir plus bas)
   - `ANTHROPIC_API_KEY` (ta clé API Anthropic, créée sur console.anthropic.com — reste
     secrète, jamais exposée au navigateur puisqu'elle n'est lue que par la function)
4. Lance le déploiement (**Deploy site**). Ton appli est en ligne sur une URL du type
   `nom-aleatoire.netlify.app`, avec le tableau connecté à Supabase et l'ajout par photo
   fonctionnel.

## 4. Domaine personnalisé

Même procédure que pour un site statique classique :
1. Achète un domaine (OVH, Porkbun...).
2. Netlify > **Domain management > Add a domain**, entre ton domaine, accepte
   d'utiliser "Netlify DNS", note les 4 serveurs de noms proposés.
3. Chez ton registrar, remplace les serveurs DNS par ceux de Netlify.
4. HTTPS se configure automatiquement une fois la propagation DNS terminée.

## Code d'accès à 4 chiffres

À l'ouverture, l'appli affiche un pavé numérique (`src/CodeGate.jsx`) : sans le bon code,
le carnet de cave n'est pas affiché. Une fois le bon code saisi, il est mémorisé dans le
navigateur (`localStorage`) — plus besoin de le retaper aux visites suivantes, jusqu'à ce
qu'on clique le bouton 🔒 de la barre d'outils.

- Le code se change via la variable `VITE_APP_CODE` (en local dans `.env`, sur Netlify
  dans les variables d'environnement). Sans elle, le code est `1234`.
- Après modification de la variable sur Netlify, il faut **redéployer** : la valeur est
  injectée au moment du build.

⚠️ **Ce que ce code protège (et ne protège pas).** C'est un verrou côté navigateur : il
cache l'interface aux curieux qui tomberaient sur l'URL, ce qui est le but ici. Il n'est
pas une vraie authentification — le code est présent dans le JavaScript envoyé au
navigateur, et la base Supabase reste joignable directement avec la clé `anon` publique
(cf. les policies dans `supabase-schema.sql`). Pour une protection réelle des données, il
faudrait passer à l'auth Supabase (login email/mot de passe) et filtrer les policies sur
`auth.uid()`.

## Notes

- La clé `anon` Supabase est publique par conception : la vraie protection vient des
  règles *Row Level Security* définies dans `supabase-schema.sql`. Pour du perso
  (pas de login), les règles actuelles autorisent tout le monde muni de cette clé à
  lire/écrire — largement suffisant tant que l'URL de l'appli reste confidentielle. Si tu
  veux fermer ça davantage (login email/mot de passe), on peut ajouter l'auth Supabase
  plus tard.
- Le lien Wine-Searcher est recalculé automatiquement à chaque ajout/modification à
  partir de domaine + cuvée + appellation + millésime, sauf s'il a été importé tel quel
  depuis le CSV.
