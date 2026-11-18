// What can be chosen in the "Allenati" tab: the 7 movements of exercises.js, in
// two modes:
//   train  "Esercizi": free sets with spoken feedback, the corrected mannequin
//          and the set analysis (charts after J. Park's demos)
//   test   "Test FMS": one test with its 0-3 score, as in the initial assessment
// Each mode shows its own guidelines before the set, with the source.
// User-facing texts are in Italian, like the rest of the app.

import { EXERCISES, ASSESSMENT_ORDER } from "./exercises.js";

const FMS = "Cook G. et al., Functional Movement Screening, Int J Sports Phys Ther 9(3-4), 2014 (criteri ufficiali FMS)";
const FMS_TRAIN = "Cook G. et al. 2014 (istruzioni dei test FMS); serie e ripetizioni dal piano di lavoro dell'app";

// Test mode: the official FMS scoring criteria.
export const GUIDES = {
  deep_squat: { source: FMS, points: [
    "Voto 3: busto parallelo alla tibia o verticale, femore sotto l'orizzontale, ginocchia allineate sopra i piedi, bastone sopra i piedi.",
    "Voto 2: lo stesso ma con i talloni su un rialzo.",
    "Voto 1: non riesce nemmeno con il rialzo. Dolore = 0.",
  ] },
  hurdle_step: { source: FMS, points: [
    "Voto 3: anca, ginocchio e caviglia restano allineati; la schiena lombare quasi non si muove; bastone e ostacolo restano paralleli.",
    "Voto 2: allineamento perso, movimento della schiena, oppure bastone e ostacolo non paralleli.",
    "Voto 1: il piede tocca l'ostacolo o si perde l'equilibrio. Dolore = 0.",
  ] },
  inline_lunge: { source: FMS, points: [
    "Voto 3: il bastone tocca sempre testa, schiena e osso sacro e resta verticale; busto fermo; il ginocchio dietro tocca terra dietro il tallone davanti.",
    "Voto 2: il bastone perde contatto o non resta verticale, il busto si muove, i piedi escono dalla linea.",
    "Voto 1: si perde l'equilibrio. Dolore = 0.",
  ] },
  shoulder_mobility: { source: FMS, points: [
    "Voto 3: pugni entro una lunghezza della mano; voto 2: entro una mano e mezza; voto 1: oltre.",
    "Un solo movimento: i pugni non si avvicinano strisciando dopo.",
    "Prima il test di sicurezza: mano sulla spalla opposta e gomito in alto. Se fa male il voto è 0.",
  ] },
  aslr: { source: FMS, points: [
    "Voto 3: la caviglia della gamba alzata supera la metà della coscia dell'altra gamba.",
    "Voto 2: tra metà coscia e ginocchio; voto 1: sotto il ginocchio.",
    "Gamba alzata tesa, l'altra resta a terra con il piede in posizione neutra. Dolore = 0.",
  ] },
  trunk_pushup: { source: FMS, points: [
    "Voto 3: uomini con i pollici all'altezza della fronte, donne del mento; il corpo sale tutto in un blocco.",
    "Voto 2: lo stesso con le mani più in basso (mento uomini, clavicole donne); voto 1: non riesce.",
    "Prima il test di sicurezza: estensione da prono (press-up). Se fa male il voto è 0.",
  ] },
  rotary_stability: { source: FMS, points: [
    "Voto 3: braccio e gamba dello stesso lato, schiena parallela al suolo, gomito e ginocchio si toccano in linea.",
    "Voto 2: lo fa solo con braccio e gamba opposti (schema diagonale); voto 1: nemmeno così.",
    "Prima il test di sicurezza: da quadrupedia siediti sui talloni. Se fa male il voto è 0.",
  ] },
};

// Train mode: how to do the movement well, from the FMS test instructions.
export const TRAIN = {
  deep_squat: { source: FMS_TRAIN, dose: "3 × 5", points: [
    "Piedi alla larghezza delle spalle, punte in avanti, bastone sopra la testa a braccia tese.",
    "Scendi lento più in basso che puoi, talloni a terra e petto alto.",
    "Ginocchia in linea con i piedi, mai verso l'interno; il bastone resta sopra i piedi.",
    "Risali con lo stesso schema, senza perdere l'allineamento.",
  ] },
  hurdle_step: { source: FMS_TRAIN, dose: "3 × 5 per lato", points: [
    "Ostacolo all'altezza della tibia, piedi uniti dietro con le punte che lo toccano.",
    "Bastone sulle spalle; alza il ginocchio, scavalca, tocca terra col tallone e torna.",
    "Bacino e bastone restano orizzontali, il ginocchio d'appoggio non si sposta.",
  ] },
  inline_lunge: { source: FMS_TRAIN, dose: "3 × 6 per lato", points: [
    "Piedi sulla stessa linea, distanti quanto la tibia; bastone verticale dietro la schiena (testa, dorso, osso sacro).",
    "Scendi finché il ginocchio dietro sfiora terra dietro il tallone davanti.",
    "Busto verticale, bacino che scende dritto senza spostarsi di lato.",
  ] },
  shoulder_mobility: { source: FMS_TRAIN, dose: "3 × 3 per lato", points: [
    "Pugni chiusi col pollice dentro: uno va dietro il collo dall'alto, l'altro dietro la schiena dal basso, insieme.",
    "Avvicinali in un solo movimento, senza strisciarli dopo; tieni 2–3 secondi.",
    "Se senti dolore alla spalla fermati.",
  ] },
  aslr: { source: FMS_TRAIN, dose: "2 × 10 per lato", points: [
    "Supino, braccia lungo i fianchi, gambe tese e punte dei piedi in alto.",
    "Alza una gamba tesa, caviglia a martello; l'altra resta a terra con il ginocchio teso.",
    "Scendi lento e controllato.",
  ] },
  trunk_pushup: { source: FMS_TRAIN, dose: "3 × 5", points: [
    "Prono, mani all'altezza della fronte (uomini) o del mento (donne), gambe unite, punte a terra.",
    "Spingi e sali tutto in un blocco: spalle, anche e caviglie restano sulla stessa retta.",
    "Il bacino non resta indietro e non sale prima delle spalle.",
  ] },
  rotary_stability: { source: FMS_TRAIN, dose: "3 × 8 per lato", points: [
    "A quattro zampe: mani sotto le spalle, ginocchia sotto le anche, schiena parallela al suolo.",
    "Allunga braccio e gamba dello stesso lato, poi porta gomito e ginocchio a toccarsi sotto il corpo.",
    "Troppo difficile? Lo schema diagonale (braccio e gamba opposti) è la versione più facile.",
  ] },
};

const VIEW = { front: "di fronte", side: "di lato", back: "di spalle" };

export const CATALOG = ASSESSMENT_ORDER.map((id) => ({
  id, name: EXERCISES[id].name, bilateral: EXERCISES[id].bilateral, tool: EXERCISES[id].tool,
  view: EXERCISES[id].view, viewName: EXERCISES[id].viewText || VIEW[EXERCISES[id].view],
  // what the set analysis measures, from the rules of the exercise
  checks: EXERCISES[id].rules.map((r) => r.name.replace(/\s*\(.*\)$/, "").toLowerCase()),
}));
export const byId = (id) => CATALOG.find((c) => c.id === id);

// Where to put the phone, before the set.
export const setupSteps = (id) => EXERCISES[id].intro;
