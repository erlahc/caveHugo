-- À exécuter dans Supabase : Dashboard > SQL Editor > New query

create table bouteilles (
  id uuid primary key default gen_random_uuid(),
  cuvee text default '',
  domaine text default '',
  appellation text default '',
  millesime int,
  region text default '',
  couleur text default 'Rouge',
  quantite int default 1,
  wine_searcher_url text,
  created_at timestamptz default now()
);

-- Active la sécurité au niveau des lignes (obligatoire pour exposer la table à l'API publique)
alter table bouteilles enable row level security;

-- Pour un usage perso (pas de login), on autorise tout le monde muni de la clé publique
-- anon à lire et écrire. Si tu ajoutes un jour un login, remplace ces policies par des
-- règles filtrant sur auth.uid().
create policy "Public read access"
  on bouteilles for select
  using (true);

create policy "Public insert access"
  on bouteilles for insert
  with check (true);

create policy "Public update access"
  on bouteilles for update
  using (true);

create policy "Public delete access"
  on bouteilles for delete
  using (true);

-- Ensuite : Table Editor > bouteilles > Insert > Import data from CSV
-- Importe Cave_Saint_Terre_vStatique2_liens.csv avec le délimiteur ";"
-- Mappe les colonnes du CSV vers : cuvee, domaine, appellation, millesime, region,
-- couleur, lienwinesearch -> wine_searcher_url (ignore index, liengoogle, fiabilite)
