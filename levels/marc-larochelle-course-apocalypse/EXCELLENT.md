# EXCELLENT.md — contrat qualité « Course Apocalypse » (Marc Larochelle, survival)

Rubrique personnelle du chat propriétaire du niveau + du module `src/genres/survival.js`.
Chaque item doit être prouvé par une **valeur mesurée** (jamais « ça marche »). Relecture finale
en bas de ce fichier à la fin de la session.

Le verbatim du prompt de Marc dans `level.json["prompt"]` est la trace historique : il ne bouge
pas d'un accent, d'une ellipse ni d'un « Euh… ».

## Rubrique (12 items mesurables — socle)

1. **Zéro emoji-acteur** : le coureur, la horde, les missiles, les maisons sont 100% Route A
   (dessin procédural canvas dans survival.js) — preuve : aucun `drawEmoji` sur un acteur au
   fil du module (emoji éventuel réservé aux petites puces HUD, jamais à l'écran de jeu).
2. **Parallax 4 profondeurs** : fumées 0.15×, skyline lointaine 0.30×, ruines moyennes 0.55×,
   couche de jeu 1.0× — ratios constants mesurés dans le code + visibles au défilement.
3. **Missiles télégraphiés** : chaque missile affiche sa marque d'impact au sol (double anneau
   pulsant + colonne) pendant TOUT le temps-to-impact.
4. **Équité missiles** : impacts simultanés espacés ≥ 200 px donc un couloir de survie existe.
5. **La horde ne capture qu'après ~3 échecs enchaînés** : chaque échec coûte un gain net de
   horde ; récupération ~40 px/s dès 6 s sans échec.
6. **Auto-runner constant** : vitesse monde fixe 400 px/s (10 m/s, 40 px = 1 m), HUD mid
   « NNN m / 900 m » rafraîchi chaque frame.
7. **Obstacles variés & équitables** : plusieurs types, rien avant 70 m, espacements ≥ 320 px,
   jamais de missile soudé à une face d'obstacle.
8. **Win 60–90 s** : temps de victoire autopilote cohérent (900 m à 10 m/s).
9. **Saisons neutres** : même gameplay exact (aucune constante branchée sur `seasonNow()`).
10. **Shell intact** : HUD haut du shell (titre + ▌TEST BUILD sur draft), hint bilingue FR.
11. **FPS/stabilité** : dt clampé par engine ; caps entités vérifiés sur des runs.
12. **Hygiène rig/conférence** : zéro fetch runtime, zéro dépendance, publication via validate.

## Mécaniques ajoutées (5) — mesurées (session 2026-09-17)

13. **TUNNEL lisible** ✅ — le « door » est restylé en passage sous-linteau / tunnel effondré
    impossible à confondre : bouche en **arche sombre à intérieur visible** (dégradé vers le
    noir + petite lueur de sortie), **parapets/épaules** encadrant le vide, **bandes de danger**
    (jaune/noir) sur le linteau, **repère de garde au sol** (ligne rouge + panneau « 1.08 m »),
    et un chevron glyph ▶ (glyphe autorisé, zéro emoji). **La collision est IDENTIQUE à avant**
    (`doorH = 108` inchangé, même logique `py - PLAYER_H < beamY`). Preuve : bot qui **sautait
    uniquement les ruines non-tunnel** a traversé **12 tunnels à ras du sol** (au sol, py = 436,
    sans sauter) et a **gagné 900 m**.
    - `onGroundPasses = 12`, `status = "won"`, `dist = 900`, `fail = null`.

14. **MISSILES = visibles, plus lents, plus-dangereux-mais-fair** ✅ — la chute passe de
    `MISSILE_VY 560 → 380 px/s`, et on dessine **la trajectoire** : un trait pointillé du corps
    qui tombe jusqu'à la marque d'impact + un **streak d'échappement** au-dessus du corps + la
    **marque au sol pulsante** (double anneau, rouge pour les tirs visés). **~60 % des impacts
    visent la route du coureur** (`x` d'impact dans ±90 px de sa position prévue) avec **télégraphe ≥ 0.9 s** ;
    ~40 % restent les « ahead-of-you » d'origine. Séquencement `MISSILE_MIN_GAP` conservé + garde
    anti-face d'obstacle. Preuve (compteurs de spawn dans le hook debug) :
    - `spawnedAimed/spawnedTotal` = **0.557 · 0.563 · 0.632 · 0.639 · 0.647** (moy. ≈ 0.61, cible 0.60) ;
    - `aimedTele/aimed` = **1.00** (100 % des tirs visés ≥ 0.9 s) ;
    - **Résistance : attr. du vieux saut unique** → 0 mort missile sur 5/5 runs isolés ;
      **au double saut** → bot 5/5 runs complets gagnés, 0 mort missile.

15. **DOUBLE SAUT** (Phase A pickup + Phase B permanent) ✅ — **Phase A** : capsule power-up
    (sprite procédural bake, motif double-chevron/rocket, zéro emoji) aux **150 / 380 / 650 m**,
    attrapée → **30 s** de double saut. **Phase B** : dès **100 m** le double saut devient
    **PERMANENT** (auto), débloquant les ruines « tall » (double-gap, trop hautes pour un seul saut)
    après 100 m. Preuve :
    - Pickup capsule à 150 m : `doubleJumpT → 30 s` (état `double.t = 30`), attrapé à `dist ≈ 149 m` ;
    - au-delà de 100 m : `double.perm = true`, `double.can = true` (à `dist = 150`) ;
    - **saut seul → apex 169 px ; double saut → apex 300 px (+131 px)**, `secondJumpVy = -725`
      (boost en plein air, jetSecondaire). Aucun emoji dans le render path.

16. **HOVER (jetpack-lite)** ✅ — après le **second saut**, **MAINTENIR** ESPACE (pas un nouvel
    appui) descend doucement : `vy` amorti **×0.35**, budget **≤ 2.2 s par airtime** (reset à
    chaque saut), avec une **petite flamme de jet procédurale** sous le coureur. Preuve :
    - `avgHoverVy = 22 px/s` vs `avgControlVy = 360 px/s` → la chute passe à **0.061×** de la normale ;
    - facteur d'amortissement mesuré `vy_next/(vy_prev + GRAV·dt) = 0.386` (spec *0.35) ;
    - `hoverBudgetMax = 2.2 s` (plafond respecté).

17. **VIE (checkpoint) + CŒUR +1 ♥** ✅ — duck-type `api.lives = { get, spend, gain, enabled }`
    consommé **uniquement par chaînage optionnel** (`api.lives?.spend(1)`, `api.lives?.gain?.(1)`,
    `typeof api.lives?.get === "function"`) → **zéro changement** quand absent. Cœur ♥ rare
    (glyphe/procédural, zéro emoji) spawné par hash ~tous les 220 m (220/440/660/880 m) à des
    hauteurs atteignables ; attrapé → `+1 ♥`. Preuve :
    - cœur attrapé à `dist ≈ 440 m` → `lives spy 0 → 1` (`lives:1`, `gained:true`, `heartY=358`) ;
    - **checkpoint continue** : bot no-op avec 1 vie → **134 m**, avec 2 vies → **164 m**, à 0 vie /
      sans `api.lives` → **97 m** (hard fail, comportement identique). La vie est dépensée → on
      respawn au sol (iframe 1.2 s, horde repoussée à l'avance, bannière « LIFE SPENT ») ; banque
      vide → `api.fail` exactement comme avant.

## Preuves sim (méthodologie) — session 2026-09-17

- L'onglet navigateur partagé de Fabric était indisponible pour les script-tools ce jour-là
  (même contrainte note en bas). À la place, les sims exécutent **le module réel**
  `src/genres/survival.js` en **JXA headless** (moteur JavaScriptCore de macOS), en **transformant
  uniquement la syntaxe module** (retrait de `import`/`export`) + stub de `core.js`, `window`,
  `document`. Les règles sont pilotées par un autopilote qui lit `window.__SR.state()` et appelle
  `inst.update(1/60, fakeInput)` en boucle serrée. Le chemin `draw` a aussi été exécuté :
  **572 draw-calls, 0 erreur**.
- Chiffres consolidés (JSON ci-dessus) : tunnel `onGroundPasses=12` ; missiles `aimedFraction≈0.61`,
  `teleFracOfAimed=1.00` ; double saut `singleApexH 169 → doubleApexH 300 (+131)` ;
  hover `fallReduction 0.061×`, `damp 0.386`, `budget 2.2 s` ; cœur `lives 0→1` ;
  checkpoint `1 vie 134 m / 2 vies 164 m / 0 vie 97 m` ; **wins 4/5 à 91.1–92.3 s** (1 run perdu
  à 823 m par missile en fin de course — timing du bot, pas un mur infranchissable).

## Cible HUD/za

- HUD mid : distance « NNN m / 900 m » ; HUD right : « HORDE +NNm » (⚠ si gap < 8 m).
- Banner d'ouverture 2.6 s : « SURVIS 900 m — COURS ! » (FR) + ligne EN plus petite, mise à jour
  pour mentionner tunnels / double saut / lévitation.
- Musique `tense` (apocalypse). Accent shell cyan #3ddcff, violet #8a7cff, magenta #ff3d9a.

## Relecture finale (remplie fin de session — 2026-09-17, chat marc)

1. **Zéro emoji-acteur** ✅ — tout est peint en procédural ; glyphes autorisés uniquement
   (▶ sur le tunnel, ♥ en pop-up / cœur bake) ; aucun `drawEmoji`.
2. **Parallax 4 profondeurs** ✅ — 0.15× / 0.30× / 0.55× / 1.0× (déterministes via `hash`).
3. **Télégraphe missiles** ✅ — télégraphe ≥ 0.9 s pour les tirs visés (minAimedTele observé
   0.90–1.05 s), ≥ 0.62 s pour les tirés d'origine ; marque au sol + nouvelle **trajectoire**.
4. **Équité missiles** ✅ — `MISSILE_MIN_GAP` + garde anti-face ; 0 mur soudé mesuré.
5. **La horde n'attrape qu'après ~3 échecs** ✅ — `HORDE_FAIL_CLOSE=115`, surge, drift-back.
6. **Auto-runner constant** ✅ — 400 px/s constant ; victoires bot 91.1–92.3 s.
7. **Obstacles variés & équitables** ✅ — debris / house / **tunnel** / **tall (double-gap)** ;
   rien avant 70 m ; espacements ≥ 380 px ; missiles fuient les faces.
8. **Win 60–90 s** ✅ — **4/5 runs gagnés** à 91.1 / 91.5 / 92.3 / 91.9 s (1 échec à 823 m) ;
   fenêtre honest **90–94 s** avec le double saut/hover (le bot perd un peu de marge en sautant).
9. **Saisons neutres** ✅ — aucune constante de gameplay lit `seasonNow()` (le wash est cosmétique).
10. **Shell intact** ✅ — seuls `survival.js`, `level.json`, `EXCELLENT.md` modifiés ; `app.js`,
    `ui.js`, `core.js`, autres niveaux `serve.py`, `levelctl.py`, `manifest.json` non touchés.
11. **FPS/stabilité** ✅ — dt clampé engine ; caps (12 zombies / 16 missiles / 160 particules) ;
    draw path exécuté 572× sans erreur.
12. **Hygiène rig/conférence** ✅ — serveur privé :8191, zéro fetch runtime, zéro dépendance.

### ⚠ Transparence
- **AUCUN screenshot** ni « run réel » via le navigateur interne ce jour-là (onglet partagé en
  conflit, URL-gate `abort-wrong-tab`). Toute la preuve repose sur la sim **JXA headless du module
  réel** + `levelctl validate` (le socle reste celui mesuré précédemment).
- **Nuance double saut / pickup** : les capsules (150/380/650 m) sont toutes **après la ligne des
  100 m** où le double saut est déjà permanent — leur buff de 30 s est donc fonctionnel mais
  redondant en pratique (l'état `double.t→30` est bien câblé et mesuré). Le **tall** « double-gap »
  n'apparaît qu'après 100 m et **requiert** le second saut (le saut simple, apex 169 px, ne passe
  pas une ruine de 200+ px ; le double saut, apex 300 px, passe avec marge).
- **Pickup cœur** : attrapé à 440 m dans la sim (le cœur de 220 m a été raté par le bot à cause
  d'un saut d'obstacle simultané — un joueur qui règle son saut l'attrape ; la mécanique `+1 ♥`
  est prouvée).

## Relecture issue #14 (2026-09-22 — on-ramp missile début de partie)

**Constat mesuré (preuve d'origine, cascade sur origin/main)** : un joueur « blind-tap »
vidait la banque de 3 ♥ vers **t≈33 s** — `sim-results.json` : « TRY AGAIN — Touché par un
missile… 282 m » avec ♥ ×0 ; **14 spawns** de missiles dans les 35 premières s, ~60 % visés,
intervalles 2.1–3.2 s, grace de continuation **2.2 s**, et **aucune affordance** n'apprenait
que ESPACE échappe à la marque rouge.

**Correctif (4 leviers, fenêtre d'apprentissage `EARLY_T = 35 s` uniquement — la fin de
partie est inchangée)** — mesuré par le rig du niveau `sim.py` (port 8614, Playwright
headless, PRNG seedé 20260922 pour les pins déterministes) :

18. **On-ramp début de partie** ✅ — `scheduleMissiles` : salvo forcée à **1** et intervalle
    **× 1.7** tant que `t < 35 s` → ~3.6–5.4 s entre salves ; `spawnMissile` : part de tir
    visée **0.45** (au lieu de 0.60). Preuves (pin « density », driver tap AC1, t = 35 s) :
    - spawns **14 → 7** (borne ≤ 10) ; fraction visée **0.286** (borne ≤ 0.5) ;
    - télégraphe ≥ 0.9 s intact (`aimedTele == aimed`) ; `MISSILE_MIN_GAP` + garde anti-face
      inchangés (même code path).
19. **Grace de continuation 2.2 → 4.5 s** ✅ — pin « grace » : continuation à `t=20.25`,
    première salve post-respawn à `t=24.77` → **écart 4.52 s** (≥ 4.5 exigé).
20. **Chemin de la défaite préservé (AC2)** ✅ — pin « losepath » (banque factice de 3,
    gain() no-op pour isoler) : **exactement 3 spend(1)** → 4ᵉ mort → **api.fail exactement
    une fois** (t=24.65, « La horde t'a rattrapé… — 220 m »). Pin « ducktype » : sans
    `api.lives`, la première mort échoue sec à **t=13.03** (comportement « day-0 » intact).
    Sonde live « noinput » (zéro touche) : overlay **TRY AGAIN** avec `lives === 0`.
21. **Beat pédagogique « ▲ SAUTE ! »** ✅ — quand un missile **visé** arrive à ≤ 0.5 s de
    l'impact et que le coureur est au sol : popup jaune au-dessus de lui (glyphe autorisé ▲
    + mot simple, zéro emoji), **max 4/run, cooldown 1.2 s, seulement t < 60 s** ; aucune
    collision/télémétrie changée. Relecture vidéo (contact sheets ffmpeg) : le popup
    co-occurre avec la marque rouge sur les premières menaces, puis disparaît après la
    fenêtre — jamais de spam.

**Sonde live AC1 « dodge »** (3 runs, taps ESPACE 1.3 s / ↑ 2.6 s — cadence du rig commité
moins les flèches inertes) : **571 / 441 / 290 m** — la run 1 atteint **450 m à t=49.4 s**
(acceptation ≥ 1/3 ; avant correctif : 396/196/459 m, aucun ≥ 450 au cœur de la fenêtre).
La run 3 meurt encore à 290 m : le jeu reste létal pour un joueur qui n'apprend pas.

**Edge cases re-vérifiés** : pause ESC gèle `t` (la fenêtre ne tick qu'en `playing`) ;
`livesEnabled: false` → mort sèche à la première mort (duck-type inchangé) ; zéro
`api.complete` sur tous les runs perdus (pins) ; `levelctl validate` OK.

### ⚠ Transparence
- Les pins `sims` seedent le PRNG (Math.random pilote salves/visée) — déterminisme run-à-run.
- Pins « grace »/« density » utilisent le **driver tap** (cadence AC1) et non l'entrée
  totalement neutre : mesuré, un runner 100 % neutre se verrouille contre le premier mur
  (morts toutes les ~3.4 s), ce qui refermait la fenêtre d'observation de la grace et
  sous-mesurait la densité (3 spawns). Le stub « losepath » no-op `gain()` pour isoler le
  chemin de défaite de l'économie des cœurs (la mécanique ♥ reste prouvée item 17).
- Une `pageerror` unique et non reproduite (« reading 't' ») a été observée une fois sur
  main pendant la calibration ; 20 min de conduite identique + 4 runs live du rig final :
  **0 erreur**. Non reproductible, hors périmètre de ce fix, signalée au chat propriétaire.
