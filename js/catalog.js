// Exercises that can be chosen in a training session, with the key points of the
// official guidelines shown before the set (and the source they come from).
//
// kind "squat"    -> coach.js (side or front squat, with the corrected mannequin)
// kind "movement" -> movement.js with the rules of exercises.js
// User-facing texts are in Italian, like the rest of the app.

import { EXERCISES, ASSESSMENT_ORDER } from "./exercises.js";

const FMS = "Cook G. et al., Functional Movement Screening, Int J Sports Phys Ther 9(3-4), 2014 (criteri ufficiali FMS)";

export const GUIDES = {
  squat: {
    source: "NSCA, Essentials of Strength Training and Conditioning, 4ª ed. (tecnica dello squat); IPF Technical Rules (profondità)",
    points: [
      "Piedi alla larghezza delle spalle o poco più, punte leggermente in fuori.",
      "Schiena neutra, petto in alto, sguardo avanti; il busto resta circa parallelo alla tibia.",
      "Talloni sempre a terra; ginocchia nella direzione dei piedi, mai verso l'interno.",
      "Scendi fino a cosce parallele al pavimento (NSCA). In gara IPF la piega dell'anca deve arrivare sotto la parte alta del ginocchio.",
      "Risali con lo stesso schema, senza che il bacino salga prima delle spalle.",
    ],
  },
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

const VIEW = { front: "di fronte", side: "di lato", back: "dietro di te" };

// Exercise list of a training session, in the order shown.
export const CATALOG = [
  { id: "squat", kind: "squat", name: "Squat", bilateral: false, group: "Esercizi",
    meta: "telefono di lato (o di fronte) · profondità, busto, ginocchia, talloni · manichino corretto",
    tool: "niente (o un bilanciere)", view: "side" },
  ...ASSESSMENT_ORDER.map((id) => ({
    id, kind: "movement", name: EXERCISES[id].name, bilateral: EXERCISES[id].bilateral, group: "Esercizi dei test FMS",
    meta: `telefono ${VIEW[EXERCISES[id].view]} · ${EXERCISES[id].tool}`, tool: EXERCISES[id].tool, view: EXERCISES[id].view,
  })),
];
export const byId = (id) => CATALOG.find((c) => c.id === id);

// Where to put the phone, before the set.
export function setupSteps(id) {
  if (id === "squat") return [
    "Telefono dritto all'altezza del bacino, a 2–3 m, che ti veda dalla testa ai piedi.",
    "Di lato: profondità, busto, ginocchia e talloni. Di fronte: ginocchia verso l'interno e peso spostato.",
    "Stai fermo in piedi un secondo: quando senti “Pronto”, parti.",
  ];
  return EXERCISES[id].intro;
}
