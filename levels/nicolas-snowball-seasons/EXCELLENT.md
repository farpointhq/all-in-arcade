# EXCELLENT.md — Boules de Neige (le niveau de Nicolas, L7 of ALL IN ARCADE)

> **Addendum v3 (issue #20 contrast sweep, 2026-09-20 — visual only):** one-stop
> glacier tint on the grass cap `#f2f8ff` → `#d7e7f9` so the white snowball and
> white snow pickups separate from the ground they stand on (A1/A3 intact —
> still the arctic "pôle Nord" palette; rows, physics and economy untouched).

Ma définition du « excellent » **pour CE niveau**. Nicolas a demandé, verbatim :
*« je voudrais un jeu où on joue des boules de neige et, en fonction de la saison et en fonction
de la hauteur du soleil, la boule de neige sera plus ou moins grosse. »*
C'est **le niveau qui introduit le système de saisons du jeu** (le chip ❄️🌱☀️🍂 en bas à droite).
Donc la barre : la fonte doit être **lisible en 2 secondes**, la même carte doit **se ressentir
différemment dans chaque saison**, et la boule doit être grosse et ronde, jamais anonyme.

Contraintes moteur que je m'impose (level.json only — le moteur est partagé, je n'y touche pas) :
fonte = `(0.008 + soleil×0.045) × multiplicateur_saison` par seconde, mort si ❄ ≤ 34 % ;
`❄` (+0.07) et `✨` (+0.055) rechargent ; soleil : `sunHeight` → `+sunClock`/s ; saut
`vy0 = 11.6 + melt×1.4`. Mes valeurs : `ballStart 0.62 · sunHeight 0.2 · sunClock 0.02`.
Multiplicateurs saison (chip global, PAS épinglé — le chip commande) :
hiver ×0.35 · printemps/automne ×1.0 · été ×1.9.

Budget calculé : ramassage complet de la ligne gourmande = **8 ❄ (×0.07) + 5 ✨ (×0.055) = +0.835**,
banque de départ 0.62 → trésor total ≈ **1.46**, dont 1.115 peuvent brûler avant la mort. Barème :

| saison | perte sur ~20 s de jeu | ❄ final (tout ramassé, 20 s) |
|---|---|---|
| hiver ×0.35 | ≈ 0.20 | ≈ 1.35 (max) — boule géante |
| printemps/automne ×1.0 | ≈ 0.52 | ≈ 0.93 — gros et serein |
| été ×1.9 | ≈ 0.99 | ≈ 0.64 — gagnable en ligne droite |
| été ×1.9 hésitant 25 s | ≈ 1.34 | ✗ fondu ≈ à 22 s — l'été ne pardonne pas la flânerie |

Règle d'or de conception qui en découle : **une seule carte, quatre météos**. La densité de ❄ est
calibrée pour l'automne/printemps (le niveau d'introduction), l'été est le mode « sprint » de la
même carte, l'hiver est la récompense détente. Je DOIS battre les quatre au playtest avant `ready`.

---

## A. Identité (lire la fiction en 1 seconde)
- **A1.** On EST une boule de neige : sprite = boule blanche dégradée (moteur, pas emoji), elle
  **grossit quand on ramasse** (rayon 11+melt×13) et **rétrécit visiblement** au fil du soleil.
  Noter à l'œil sur deux captures (début vs fin).
- **A2.** Soleil VIVANT à l'écran : il grimpe (dessiné qui monte) pendant la partie — le joueur
  voit la menace physiquement monter. Grade : screenshot t≈0 s vs t≈20 s.
- **A3.** Palette « pôle Nord » : backdrop `ice`, sol bleu glacier, plateformes glace, aucun
  caractère générique type Mario vert. Grade : à l'œil.

## B. La mécanique s'enseigne toute seule
- **B1.** Les 2 premières secondes : HUD `❄ %` visible ET la première vraie `❄` à ~1.5 s de
  marche → le joueur lie « je mange la ❄ = je grossis » AVANT la première pression du soleil.
- **B2.** Le HUD montre `✨ n/N · ❄ %` en continu ; manger une ❄ fait MONTER le compteur
  immédiatement (feedback < 100 ms après contact).
- **B3.** Aucun ❄/✨ n'est inaccessible : chaque pickup est attrapable en marchant ou avec un
  saut normal (vérifier : un run attrape TOUT sur la ligne gourmande sans détours).
- **B4.** Le bandeau `objective` = UNE phrase qui explique fonte + but (« attrape la ❄, le soleil
  monte, atteins le drapeau ») — lisible pendant ses 3.2 s à l'écran.

## C. La route (fair, une seule carte pour les 4 saisons)
- **C1.** Zone de spawn calme : 5 dalles plates, 2 ❄ immédiates (+0.14) — la boule se re-gonfle
  pile à chaque respawn de chute (le melt NE se réinitialise PAS au respawn, il faut rebosser).
- **C2.** Les 2 trous font **exactement 2 cases** — franchissables même depuis l'arrêt complet
  (portée de saut ≈ 4 dalles à melt bas) ; jamais de trou « pixel-perfect ».
- **C3.** Montées : +2 dalles vers la plateforme haute (saut plein), +2 via l'escalier r9 vers
  le plateau r7 ; chaque marche est montable même à melt 0.34 (apex ≈ 132 px > marche 120 px).
  Vérifié au calcul, et on y SAUTE à chaque saison au playtest.
- **C4.** Deux routes vers le drapeau : la route haute (plateau) paie en ❄ (le bonus du
  collecteur), la route du sol reste complète et accessible — personne n'est bloqué.
- **C5.** Zéro pics : toute faute dans ce niveau, c'est la FONTE ou la chute — pas de dégâts
  artificiels ; 3 cœurs = 3 chutes de tolérance. La seule « mort de compétence » est fondue.
- **C6.** Fin sur note haute : dernier ❄ au pied du drapeau (refill de célébration), le drapeau
  est sur sol plat, on peut le toucher sans sauter.

## D. Économie de neige (le cœur)
- **D1.** Densité : **8 ❄ + 5 ✨ sur la ligne gourmande** (gain +0.835). Banque 0.62 → 1.455 max
  contre 1.115 perdables jusqu'à la mort : l'automne finit « gros » si on ramasse tout.
- **D2.** Les 2 premières ❄ (c2–c3) sont une paire de secours : après une chute, elles re-gonflent
  la boule de +0.14 pendant qu'on repart — après une DEUXIÈME chute en été, elles sont déjà
  mangées (les pickups ne réapparaissent pas) : c'est la vraie punition des étés négligents.
- **D3.** Ceinture de sécurité hiver : à ×0.35, même en ramassant la moitié, on finit > 100 %.

## E. La charte des saisons (LE contrat Nicolas)
Le chip (bas-droite) change la PARTIE, pas la carte. Grade par saison, joué au playtest :
- **E1. HIVER ❄️ (×0.35)** — balade. Boule enflée au drapeau même avec des oublis.
- **E2. PRINTEMPS/AUTOMNE 🌱🍂 (×1.0)** — le rythme « ça fond doucement » : tout ramasser en
  marchant ≈ 12–20 s → fin ≈ 0.93–1.19. La pression est visible mais jamais stressante.
- **E3. ÉTÉ ☀️ (×1.9)** — la même carte devient une course : sprinter ≈ 13–15 s jusqu'au
  drapeau, fin ≈ 0.6–0.7 ; s'arrêter pour lire les décors ≈ mort à ~22–26 s. L'été doit rester
  gagnable par un collecteur honnête qui court, **pas** par un joueur qui attend.
- **E4.** Chip plein écran vivant : switch chip → Enter (Retry) et le multiplicateur change —
  pas de F5. (Fonte → « La boule de neige a fondu ⛱ », Enter = retry complet, melt repart à 0.62.)
- **E5. Beatability : OBLIGATOIRE ×4.** Je bats le niveau en hiver, printemps, automne ET été,
  dans MA tab, via chip + retry, sans recharger la page. Note par saison dans le message final.

## F. Rythme (la file derrière toi)
- **F1.** Ligne gourmande = **12–20 s** par tentative (une vraie manche, pas l'étalage).
- **F2.** Visite booth complète (lire, fondre 1 fois, retry, finir) ≈ **60–90 s**, quelle que
  soit la saison choisie au hasard.
- **F3.** Aucun tronçon sans pickup pendant plus de 4 dalles de marche : la cadence ❄ maintient
  le doigt (et l'attention) en action.

## G. Hygiène des données
- **G1.** `prompt` = les mots de Nicolas **verbatim** ; `authors` exactement
  `[{"name":"Nicolas Begey","kind":"original"}]` ; aucun email dans le fichier de niveau.
- **G2.** 12 rangées × 24 caractères exactement, legend `.#=^oPG%` only ; 1 `'P'`, 1 `'G'`,
  le drapeau sur du sol, spawn centré avec de l'air au-dessus.
- **G3.** Saison **NON épinglée** (`style.season` absent) — le chip global commande vraiment.
- **G4.** `validate` OK ; `status` = ready ; `order: 7` (le niveau 7 de la bataille).

## H. C'est joué, pas juste calculé
- **H1.** Playtest complet par moi, dans mon tab du jeu, au clavier : chaque saison battue.
- **H2.** La mort par fonte est VUE au moins une fois (prouve que la pression tue vraiment).
- **H3.** Screenshots d'identité (A1/A2) pris pour mémoire.
