# CoachPlan (nom provisoire) · projet Web app IHME

Application web de planification de l'entraînement entre un **coach** et ses **athlètes**, inspirée de Nolio.
Le coach prépare les séances dans un calendrier, l'athlète les consulte, les réalise et donne son retour.

Projet réalisé seul dans le cadre d'un master. Rendu sur GitHub.

---

## 1. Objectif

- Permettre à un coach de planifier les entraînements de plusieurs athlètes.
- Permettre à un athlète de voir son programme et de faire un retour après chaque séance.
- Mettre en pratique une architecture web complète : front React, API Node/Express, base PostgreSQL, Docker, et un déploiement sur le serveur du cours IHME.

## 2. Utilisateurs et rôles

| Rôle | Ce qu'il peut faire |
|------|---------------------|
| **Coach** | Gérer ses athlètes, créer / modifier / supprimer des séances, consulter les retours |
| **Athlète** | Voir son calendrier de séances, marquer une séance comme faite, laisser un retour (ressenti, commentaire) |

Chaque utilisateur a un compte (email + mot de passe) et un seul rôle, choisi à l'inscription.

## 3. Fonctionnalités

### Version 1 (MVP : le minimum à livrer)

**Commun**
- Inscription (choix du rôle coach ou athlète), connexion, déconnexion.
- Pages protégées : on ne voit que ses propres données.

**Coach**
- Inviter / ajouter un athlète à son groupe (via un code d'invitation que l'athlète saisit).
- Voir la liste de ses athlètes.
- Créer une séance pour un athlète : date, titre, sport, type (endurance, fractionné, renfo, repos…), durée prévue, description.
- Modifier et supprimer une séance.
- Voir le calendrier (vue semaine) d'un athlète avec le statut de chaque séance.
- Lire les retours des athlètes.

**Athlète**
- Rejoindre un coach avec le code d'invitation.
- Voir son calendrier (vue semaine) avec les séances prévues.
- Ouvrir une séance pour voir le détail.
- Marquer la séance comme réalisée ou non réalisée, avec un retour : ressenti (note de 1 à 10), durée réelle, commentaire.

### Version 2 (si le temps le permet)
- Vue mois du calendrier.
- Dupliquer une séance ou une semaine complète.
- Bibliothèque de séances types réutilisables par le coach.
- Statistiques simples (volume d'entraînement par semaine, taux de séances réalisées).
- Commentaires échangés sur une séance (mini-discussion coach/athlète).
- Déploiement en ligne.

### Hors périmètre
- Synchronisation avec des montres ou applis (Garmin, Strava…).
- Paiement, application mobile native.

## 4. Stack technique

| Partie | Technologie | Rôle |
|--------|-------------|------|
| Front-end | React (avec Vite) | L'interface dans le navigateur |
| Back-end | Node.js + Express | L'API sous `/api` ; en production, sert aussi le React compilé |
| Base de données | PostgreSQL | Stocke utilisateurs, séances, retours |
| Persistance | Volume Docker (en local) | Garde les données de PostgreSQL même après arrêt des conteneurs |
| Conteneurs | Docker + Docker Compose | Lance PostgreSQL en local ; construit l'image de l'app pour le déploiement |
| Authentification | JWT + mots de passe hachés (bcrypt) | Connexion sécurisée et gestion des rôles |
| Versionnement / CI | Git + GitHub + GitHub Actions | Historique du code, construction de l'image Docker et déploiement |

## 5. Architecture

### En production (serveur du cours IHME)

Une **seule image Docker** : Express sert à la fois le React compilé et l'API, sur le port 3000.
La base PostgreSQL est fournie par le serveur du cours via la variable `DATABASE_URL`.

```
Navigateur ──► https://…/web-app-ihme/ ──► proxy du cours ──► conteneur de l'app (Express, port 3000)
                                           (retire /web-app-ihme)     ├── /api/...  → API
                                                                      └── le reste  → React compilé (dist/)
                                                                             │
                                                                     PostgreSQL du serveur (DATABASE_URL)
```

### En local (développement sur mon PC)

- PostgreSQL tourne dans Docker (`docker compose up -d`), avec un **volume nommé** pour garder les données.
- Express tourne avec Node sur le port 3000, React avec le serveur de développement Vite sur le port 5173.
- Vite redirige les appels `/api` vers Express (proxy), comme le fera le serveur en production.

### Contrat imposé par le serveur du cours

- React compilé et Express servis par Node sur `0.0.0.0:3000`.
- API sous `/api`, avec une route `GET /api/health` qui teste la base (`SELECT 1`) et renvoie `{ "status": "ok" }`, ou `503` avec `{ "status": "unavailable" }`.
- Connexion SQL lue dans `DATABASE_URL`, pool PostgreSQL limité à **4 connexions**.
- Application servie sous le chemin `/web-app-ihme/` : Vite reçoit ce chemin au build (`--base`), les appels API s'écrivent `fetch(`${import.meta.env.BASE_URL}api/...`)` et React Router utilise `basename`.
- Le proxy retire le préfixe : `/web-app-ihme/api/seances` arrive dans Express comme `/api/seances`.
- Tables créées par une **migration idempotente** au démarrage du serveur (`CREATE TABLE IF NOT EXISTS …`), qui ne casse pas une base existante.
- **Uniquement des données fictives.**
- Fichiers lisibles par l'utilisateur 1000 (`node`) du conteneur.

## 6. Modèle de données (première version)

- **users** : id, email, mot_de_passe_hash, prénom, nom, rôle (`coach` | `athlete`), date_création
- **coach_athletes** : id, coach_id → users, athlete_id → users (unique : un athlète n'a qu'un coach), date_ajout
- **invitations** : id, coach_id → users, code, date_expiration
- **seances** : id, coach_id, athlete_id, date, titre, sport, type, durée_prévue_min, description, statut (`prévue` | `réalisée` | `non_réalisée`)
- **retours** : id, seance_id → seances, ressenti (1-10), durée_réelle_min, commentaire, date
- **app_settings** : clé, valeur (sert à stocker le secret JWT généré au premier démarrage si la variable `JWT_SECRET` n'existe pas, car le serveur du cours ne fournit que `DATABASE_URL`)

## 7. API (première version)

| Méthode | Route | Qui | Description |
|---------|-------|-----|-------------|
| GET | `/api/health` | tous | État de l'app et de la base |
| POST | `/api/auth/register` | tous | Créer un compte |
| POST | `/api/auth/login` | tous | Se connecter, renvoie un jeton JWT |
| GET | `/api/me` | connecté | Infos de l'utilisateur connecté |
| POST | `/api/invitations` | coach | Générer un code d'invitation |
| POST | `/api/invitations/accept` | athlète | Rejoindre un coach avec un code |
| GET | `/api/athletes` | coach | Liste de ses athlètes |
| GET | `/api/seances?athleteId=&from=&to=` | coach / athlète | Séances sur une période |
| POST | `/api/seances` | coach | Créer une séance |
| PUT | `/api/seances/:id` | coach | Modifier une séance |
| DELETE | `/api/seances/:id` | coach | Supprimer une séance |
| POST | `/api/seances/:id/retour` | athlète | Envoyer son retour |

## 8. Structure du dépôt

Un seul `package.json` à la racine (front et back ensemble), pour correspondre au Dockerfile fourni par l'enseignant.

```
web_app_ihme/
├── .github/workflows/publish.yml   # Fourni par l'enseignant : construit l'image et déploie
├── deploy/request.py               # Fourni par l'enseignant : client de déploiement
├── Dockerfile                      # Fourni par l'enseignant : image de production
├── .dockerignore                   # Fourni par l'enseignant
├── docker-compose.yml              # PostgreSQL local avec volume persistant
├── package.json                    # Dépendances et scripts (dev, build, start)
├── vite.config.js                  # Config Vite (proxy /api en local)
├── index.html                      # Point d'entrée de React
├── src/                            # Code React (pages, composants)
├── server/
│   ├── index.js                    # Serveur Express : API + fichiers React compilés
│   ├── db.js                       # Pool PostgreSQL (max 4 connexions)
│   ├── migrate.js                  # Création des tables (idempotente)
│   └── routes/                     # Routes de l'API
├── .env.example                    # Modèle des variables locales (sans secrets)
├── .gitignore
└── README.md
```

## 9. Installation et lancement en local

### Prérequis (Windows)
- [VS Code](https://code.visualstudio.com/) + extension **Claude Code**
- [Git](https://git-scm.com/download/win)
- [Node.js LTS](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (avec WSL 2)

### Lancer le projet
```bash
git clone https://github.com/titouanprud/web_app_ihme.git
cd web_app_ihme
copy .env.example .env      # puis remplir les valeurs
npm install
docker compose up -d        # démarre PostgreSQL
npm run dev                 # démarre Express (3000) et Vite (5173)
```
- Application : http://localhost:5173
- API : http://localhost:3000/api/health

### Arrêter
```bash
docker compose down          # les données sont conservées grâce au volume
```

## 10. Déploiement sur le serveur du cours

- Espace : https://node219697-ihme26.jcloud.ik-server.com/web-app-ihme/
- Image autorisée : `ghcr.io/titouanprud/web_app_ihme`
- Guide de l'enseignant : https://github.com/cedrictisseyre/ihme-suivi/blob/main/docs/deployer-son-projet.md

Étapes :
1. Dans GitHub, **Settings → Secrets and variables → Actions** : secret `IHME_DEPLOY_TOKEN`, variables `IHME_DEPLOY_URL` et `IHME_BASE_PATH` (valeurs dans le fichier d'accès privé).
2. Chaque push sur `main` construit l'image (onglet **Actions → Construire et publier l'image**).
3. Pour mettre en ligne : **Run workflow**, cocher **Déployer cette version après construction**.

Les fichiers d'accès privés (`acces-p16.txt`, `deploy.curl`) ne doivent **jamais** être ajoutés dans Git.

## 11. Planning indicatif

1. Mise en place : structure du dépôt, fichiers de l'enseignant, PostgreSQL local, `/api/health`, page React minimale, **premier déploiement réussi**.
2. Authentification : inscription, connexion, rôles.
3. Lien coach/athlète : invitations.
4. Séances : création, modification, calendrier semaine.
5. Retours athlète.
6. Finitions : design, données fictives de démonstration, tests, documentation, version 2 si le temps le permet.

## 12. Décisions prises
- Un athlète a **un seul coach** ; un coach peut avoir plusieurs athlètes.
- L'application gère **tous les sports** (le sport est un champ libre de la séance).

## 13. Questions ouvertes
- Date de rendu à confirmer.
- Nom définitif de l'application.
