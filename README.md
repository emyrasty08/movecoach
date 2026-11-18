# Movement Coach – web app per telefono

**Novità 18/11/2026: nuova struttura, analisi stile Park per tutti gli esercizi, manichino corretto ovunque.**
- **4 schede in basso**: *Oggi* (allenamento in corso, profilo, esercizi del piano, ultimo allenamento),
  *Allenati*, *Progressi* (storico), *Profilo* (valutazione FMS + piano di lavoro).
- **Allenati** ha due modalità: **Esercizi** (serie libere dei 7 movimenti, linee guida di esecuzione)
  e **Test FMS** (un test con voto 0–3 e domanda sul dolore, come nella valutazione; il voto va nei Progressi).
  Lo **squat laterale è stato tolto**: resta il deep squat del test (con lui se n'è andata la regola IPF
  di Necerini, che valeva solo di lato; il codice resta in `js/coach.js`).
- **Riepilogo di ogni serie** (dai demo di J. Park, github.com/jeremyipark/vision-demos):
  conteggio per regola ("schiena dritta 4/5"), andamento del movimento con le ripetizioni,
  **un grafico per ogni regola** con la fascia consentita e il limite tratteggiato (nel push-up la
  *linea del corpo*: scarto in gradi dalla retta spalla–caviglia, + anca alta / − anca bassa) e la frase
  "quanto sei lontano dal limite", **fasi di ogni ripetizione** (discesa / fermo / risalita) con la
  risalita più veloce e più lenta.
- **Posizione corretta per tutti gli esercizi** (`js/correct.js`): manichino ciano con le parti sbagliate
  spostate dove la regola le vuole (busto, ginocchia, bastone, piede, bacino, gamba, linea del corpo…),
  nelle schede delle ripetizioni e nel replay REALE | CORRETTO al rallentatore.
- **Più persone nell'inquadratura**: MediaPipe ne rileva fino a 3; l'app segue la più grande e centrale
  e poi resta agganciata a lei fotogramma dopo fotogramma; le altre sono disegnate in grigio e
  **toccandole sullo schermo** si cambia persona.
- Test: `node test/browser_session.mjs <video> <prefisso> [esercizio]` (flusso completo in Chrome).
  `test/browser_test.mjs` era il test dello squat laterale e non vale più.

**Novità 17/11/2026 (sera): l'app non è più centrata sullo squat.**
- Home: **Inizia allenamento**, piano di lavoro, **Storico**, valutazione iniziale (resta al primo avvio).
- Un **allenamento** raccoglie più serie di esercizi diversi: "+ Aggiungi esercizio" → scegli
  (squat o uno dei 7 esercizi FMS) → schermata con le **linee guida ufficiali** (fonte citata:
  criteri FMS di Cook et al. 2014; NSCA per lo squat, regola IPF per la profondità), dove mettere
  il telefono e il lato → serie con la fotocamera o da un video → riepilogo → altra serie o altro
  esercizio → "Termina allenamento". L'allenamento aperto è salvato dopo ogni serie.
- **Storico** per allenamento (ogni scheda elenca gli esercizi fatti) + grafico della % di
  ripetizioni corrette per serie, un esercizio alla volta (filtro a chip), e le valutazioni.
  Il vecchio storico dello squat viene convertito automaticamente.
- **Grafici del riepilogo** (ispirati ai demo di Jeremy Park, github.com/jeremyipark/vision-demos):
  andamento del movimento nella serie con le ripetizioni evidenziate (verde corretta, rosso da
  correggere) e tempo di risalita per ripetizione con più veloce / più lenta / % in più.
- **Squat di lato: profondità IPF** (anca sotto la parte alta del ginocchio) con lo scarto
  giunto/anatomia di +0,055 femori tarato da Ivan Necerini su 11 ripetizioni annotate
  (github.com/IvanNece/Streetlifting-RefereeAI, docs/05): nel riepilogo "sotto il parallelo: x su n".
- File nuovi: `js/catalog.js` (esercizi e linee guida), `js/session.js` (allenamenti),
  `js/charts.js` (grafici); `js/history.js` riscritto. Test: `node test/browser_session.mjs <video> <prefisso>`.

**Novità 17/11/2026** (dettagli passo per passo in `../piano-progetto.html`, sezione 13):
- al primo avvio, **valutazione** con i 7 test FMS registrati col Kinect (voto 0–3 per test, totale su 21);
- **piano di lavoro** di 4 settimane sulle aree più deboli (`js/plan.js`);
- **correzione a voce di tutti gli esercizi** (`js/movement.js` motore, `js/exercises.js` regole e soglie scelte
  sulle clip del 14/11), più l'avviso di fatica quando la risalita rallenta;
- `js/flow.js` schermate di valutazione, risultati, piano, elenco esercizi; `js/geometry.js` funzioni geometriche;
- test: `node test/replay_exercises.mjs <KinectCapture>` (motore dell'app sulle clip, senza telefono) e
  `node test/browser_assessment.mjs <video.mjpeg> <prefisso>` (flusso completo in Chrome con fotocamera finta).

Sotto, la descrizione originale dello squat di lato, che resta invariato (salvo la soglia "troppo profondo", ora 40°).

# Squat Coach – web app per telefono

Versione "da palestra" di `python/squat_coach.py`: niente Kinect, solo la
fotocamera del telefono. Il modello di posa è **MediaPipe Pose Landmarker (full)**,
che gira nel browser; le regole sono le stesse di Python (vista laterale) e il
controllo del valgismo è la versione 2D del rapporto ginocchia/caviglie.

## Funzioni
1. **Guida al posizionamento**: "allontanati / devo vedere i piedi / stai fermo".
   Dopo 1,2 s fermo in piedi l'app si calibra e riconosce la vista (di lato / di fronte).
2. **Feedback in tempo reale**: scheletro verde, parti sbagliate in rosso, angoli.
3. **Contatore di ripetizioni** + **voce** a fine ripetizione ("3. Scendi di più…").
4. **Riepilogo** della serie, con la ripetizione peggiore (e l'ultima) da rivedere
   **al rallentatore**: a sinistra REALE, a destra il **manichino ciano** che
   fa il movimento corretto (stessi piedi e proporzioni del soggetto).
5. **Storico** sul telefono (localStorage) con il grafico della percentuale di
   ripetizioni corrette per sessione.

"Analizza un video" fa lo stesso su un video già registrato, fotogramma per
fotogramma.

## File
```
index.html, style.css      interfaccia
js/coach.js                analisi (pura, senza DOM): calibrazione, ripetizioni, regole, correzione
js/draw.js                 scheletro, etichette, manichino
js/history.js              storico e grafico
js/main.js                 fotocamera, MediaPipe, schermate, voce, replay
sw.js, manifest.webmanifest  installazione come app e uso offline
test/replay_csv.mjs        test di coach.js con i CSV di MoveNet (node)
test/browser_test.mjs      test completo in Chrome su un video (puppeteer-core)
```

## Provarla
La fotocamera nel browser richiede **HTTPS** (o `localhost`).
- Sul PC: `python -m http.server 8000` dentro `app/`, poi `http://localhost:8000`.
- Sul telefono: pubblicare la cartella `app/` su un hosting HTTPS statico
  (GitHub Pages, Netlify…) oppure un tunnel temporaneo verso il server locale.
  Poi dal browser del telefono "Aggiungi a schermata Home".

La prima apertura scarica la libreria e il modello (circa 15 MB); dopo l'app
funziona anche offline.

## Taratura (11/11/2026)
Profondità sull'angolo del ginocchio al fondo (anca-ginocchio-caviglia):
poco profondo sopra 100°, troppo profondo sotto 60°, la sagoma corretta va a 90°.
Clip del 10/11 (MediaPipe): squat corretto 174232 ginocchio 70-75° (5/5 ok);
troppo alto 174345 113-115°; troppo profondo 174503 38-45° (5/5 segnalate);
valgismo frontale 174808 rapporto 0,49-0,74 (5/5). Una ripetizione conta anche
se il busto si inclina di 30° in più che in piedi ("good morning"): 174404 di lato
4/4, 174746 di fronte 4/4 (inclinazione stimata dall'accorciamento del busto).
