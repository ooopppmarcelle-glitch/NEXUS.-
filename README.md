# NEXUS³

**Trois intelligences. Une mission commune. Des résultats vérifiables.**

NEXUS³ est une plateforme de collaboration multi-IA et de gouvernance humaine. Elle transforme un objectif en missions structurées, conserve les décisions importantes, coordonne les contributions et exige des preuves avant de déclarer un travail terminé.

## État actuel

Le dépôt contient maintenant un premier socle applicatif issu de Google AI Studio :
- Interface React + TypeScript + Vite + Tailwind CSS.
- Serveur Express et stockage local SQLite.
- Modules Missions, DECOMPOSER, MEMORY (ADR), PROOF & REPAIR et GOVERN.
- Exécution directe de Gemini API si une clé serveur est configurée.
- Paquets Relay manuels pour collaborer avec ChatGPT, Claude ou Gemini Web.
- Manifeste PWA et cache initial de l'application.

**Attention :** ce socle est en cours d'audit. L'authentification et l'autorisation des utilisateurs ne sont pas encore implémentées. Ne pas déployer publiquement ni y stocker des données sensibles avant correction des points de sécurité.

## Modèle de collaboration

- **ChatGPT** — direction produit, orchestration, synthèse et coordination.
- **Gemini** — recherche, décomposition et analyse indépendante ; API directe selon configuration.
- **Claude** — contribution d'ingénierie et audit via Relay manuel pour le moment.
- **Fondateur humain** — priorités, permissions, décisions et validation finale.

Ces rôles ne signifient pas que les comptes externes sont automatiquement connectés. Les accès doivent être configurés explicitement.

## Principes fondamentaux

- **MEMORY** — préserver les décisions et le contexte du projet.
- **DECOMPOSER** — transformer un objectif en missions et tâches vérifiables.
- **PROOF** — associer des preuves aux résultats.
- **REPAIR** — analyser et corriger les échecs.
- **EVOLVE** — améliorer par itérations examinées.
- **GOVERN** — conserver les permissions, les validations humaines et la traçabilité.

## Démarrage local

Prérequis : version de Node.js compatible avec les fonctionnalités utilisées par le serveur, puis npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Configure `GEMINI_API_KEY` uniquement dans un gestionnaire de secrets local ou hébergé approprié. Ne commite jamais le fichier `.env` ni une clé réelle.

## Documentation

- [Fondations produit](docs/FOUNDATION.md)
- [Protocole de collaboration IA](docs/AI_COLLABORATION.md)
- [Feuille de route](docs/ROADMAP.md)
- [Base technique actuelle](docs/TECHNICAL_BASELINE.md)
- [Audit de sécurité initial](docs/SECURITY_REVIEW.md)

## Règle de livraison

Aucune fonctionnalité ne doit être présentée comme terminée sans critères d'acceptation, tests pertinents et preuve consultable. Une compilation non exécutée n'est pas une compilation réussie ; une connexion représentée dans l'interface n'est pas une intégration active.
