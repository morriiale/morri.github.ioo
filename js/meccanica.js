// meccanica.js – le stanghette che si aprono e chiudono e l'esploso degli occhiali Morri
// (lo usa morri.js con "import")
//
// le stanghette vengono riconosciute dalla forma (pezzi laterali che vanno lontano dal frontale)
//
// tutto lavora su uno "stato" (un oggetto) che contiene il gruppo dove sta il modello (oggetto),
// il piano dell'ombra (pavimento) e i dati dell'animazione (vedi nuovoStato)

import * as THREE from 'three';
import { analizza } from './prova.js';

// ===== REGOLAZIONI =====
const GRANDEZZA = 2.0;          // quanto è grande il modello nella scena (il lato più lungo)
const FATTORE_ESPLOSO = 0.7;    // di quante volte la sua distanza dal centro si allontana ogni pezzo
const SPOSTAMENTO_FISSO = 0.05; // in più, in proporzione al modello (così si staccano anche i pezzi centrali)
const VELOCITA_ESPLOSO = 0.9;
const VELOCITA_STANGHETTE = 1.2;
const RITARDO = 0.35;           // la seconda stanghetta parte un po' dopo la prima

// i dati dell'animazione di un visore
export function nuovoStato() {
    return {
        pezzi: [],              // per l'esploso: ogni pezzo con la posizione da riunito e da esploso
        esploso: false,
        avanzamentoEsploso: 0,  // 0 = riunito, 1 = esploso
        perni: { sinistra: null, destra: null },
        chiuse: false,
        avanzamentoStanghette: 0,
        info: null
    };
}

// prepara il modello già pulito (vedi pulizia.js) e lo mette nella scena del visore
export function preparaModello(v, modello, pezzi) {
    const info = analizza(pezzi);
    v.info = info;
    preparaStanghette(v, modello, pezzi, info);
    preparaEsploso(v, pezzi);
    sistemaModello(v, modello, info);
}

export function stanghetteMobili(v) {
    return Boolean(v.perni.sinistra || v.perni.destra);
}

// ===== STANGHETTE =====
// fa parte di una stanghetta un pezzo laterale, stretto, che sta dietro il frontale
// (alcune stanghette sono un pezzo solo, altre sono fatte di tante superfici o hanno il terminale in gomma)
function dietroIlFrontale(m, info) {
    if (m.userData.fisso) return false;
    const b = new THREE.Box3().setFromObject(m);
    const c = b.getCenter(new THREE.Vector3());
    const laterale = Math.abs(c.x - info.centro.x) > info.dimensioni.x / 2 * 0.3;
    const stretto = (b.max.x - b.min.x) < info.dimensioni.x * 0.4;
    const distanza = (c.z - info.zFrontale) * info.verso;
    return laterale && stretto && distanza > info.dimensioni.z * 0.3;
}

// i pezzi delle due stanghette (usato anche dal rilievo, per misurare l'asta)
export function trovaStanghette(pezzi, info) {
    const lati = { sinistra: [], destra: [] };
    pezzi.forEach(function(m) {
        if (!dietroIlFrontale(m, info)) return;
        const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
        lati[c.x < info.centro.x ? 'sinistra' : 'destra'].push(m);
    });
    // tutti insieme, i pezzi di un lato devono formare una stanghetta lunga che arriva in fondo;
    // altrimenti sono solo dettagli (e in quel modello le stanghette non sono separate)
    Object.keys(lati).forEach(function(lato) {
        if (lati[lato].length === 0) return;
        const b = new THREE.Box3();
        lati[lato].forEach(function(m) {
            b.union(new THREE.Box3().setFromObject(m));
        });
        const lontano = info.verso < 0 ? info.zFrontale - b.min.z : b.max.z - info.zFrontale;
        const lunga = (b.max.z - b.min.z) > info.dimensioni.z * 0.35;
        if (!(lontano > info.dimensioni.z * 0.5 && lunga)) lati[lato] = [];
    });
    return lati;
}

function preparaStanghette(v, modello, pezzi, info) {
    const lati = trovaStanghette(pezzi, info);

    // margine dal frontale: la prima stanghetta si chiude più vicino, la seconda le si appoggia sopra
    const margini = { sinistra: info.dimensioni.x * 0.05, destra: info.dimensioni.x * 0.1 };

    Object.keys(lati).forEach(function(lato) {
        if (lati[lato].length === 0) return;
        const box = new THREE.Box3();
        lati[lato].forEach(function(m) {
            box.union(new THREE.Box3().setFromObject(m));
        });

        // il perno: sul lato esterno, all'inizio della stanghetta (verso il frontale)
        const perno = new THREE.Group();
        perno.position.set(
            lato === 'sinistra' ? box.min.x : box.max.x,
            (box.min.y + box.max.y) / 2,
            info.verso < 0 ? box.max.z : box.min.z
        );
        // ruotando intorno a y la stanghetta va verso il centro: il segno dipende dal lato e dal verso
        const segno = (lato === 'sinistra' ? 1 : -1) * info.verso;
        const angolo = angoloMassimo(lati[lato], perno.position, segno, info.verso, margini[lato]);
        if (angolo < THREE.MathUtils.degToRad(10)) return;   // non si riesce a chiudere: la lasciamo ferma

        modello.add(perno);
        modello.updateMatrixWorld(true);
        lati[lato].forEach(function(m) {
            perno.attach(m);   // la sposta dentro il perno lasciandola dove si trova
        });
        perno.userData.segno = segno;
        perno.userData.chiusura = angolo;
        v.perni[lato] = perno;
    });
    modello.updateMatrixWorld(true);
}

// di quanto si può chiudere una stanghetta senza entrare nel frontale:
// proviamo un grado alla volta e controlliamo che la parte lunga resti dietro il perno
function angoloMassimo(stanghette, perno, segno, verso, margine) {
    const punti = [];
    const p = new THREE.Vector3();
    let lunghezza = 0;
    stanghette.forEach(function(pezzo) {
        pezzo.traverse(function(m) {
            if (!m.isMesh) return;
            const pos = m.geometry.attributes.position;
            const passo = Math.max(1, Math.floor(pos.count / 500));   // bastano poche centinaia di punti per parte
            for (let i = 0; i < pos.count; i += passo) {
                p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).sub(perno);
                punti.push(p.x, p.z);
                lunghezza = Math.max(lunghezza, p.z * verso);
            }
        });
    });
    let migliore = 0;
    for (let gradi = 1; gradi <= 100; gradi++) {
        const a = THREE.MathUtils.degToRad(gradi) * segno;
        const s = Math.sin(a), c = Math.cos(a);
        let ok = true;
        for (let i = 0; i < punti.length; i += 2) {
            if (punti[i + 1] * verso < lunghezza * 0.3) continue;   // la parte vicino alla cerniera non conta
            const zRuotata = -punti[i] * s + punti[i + 1] * c;
            if (zRuotata * verso < margine) { ok = false; break; }
        }
        if (!ok) break;
        migliore = gradi;
    }
    return THREE.MathUtils.degToRad(migliore);
}

// ===== ESPLOSO =====
// ogni pezzo si allontana dal centro degli occhiali nella direzione in cui si trova
function preparaEsploso(v, pezzi) {
    const box = new THREE.Box3();
    pezzi.forEach(function(m) {
        if (!m.userData.fisso) box.union(new THREE.Box3().setFromObject(m));
    });
    const centro = box.getCenter(new THREE.Vector3());
    const lato = box.getSize(new THREE.Vector3()).length();

    pezzi.forEach(function(m) {
        if (m.userData.fisso) return;
        const direzione = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).sub(centro);
        const spostamento = direzione.clone().multiplyScalar(FATTORE_ESPLOSO);
        if (direzione.lengthSq() > 0) {
            spostamento.addScaledVector(direzione.clone().normalize(), lato * SPOSTAMENTO_FISSO);
        }
        // la posizione di arrivo, nelle coordinate del "genitore" del pezzo
        const arrivo = m.getWorldPosition(new THREE.Vector3()).add(spostamento);
        m.parent.worldToLocal(arrivo);
        v.pezzi.push({ oggetto: m, riunito: m.position.clone(), esploso: arrivo });
    });
}

// ===== IL MODELLO NELLA SCENA =====
function sistemaModello(v, modello, info) {
    const box = new THREE.Box3().setFromObject(modello);
    const dimensioni = box.getSize(new THREE.Vector3());
    const centro = box.getCenter(new THREE.Vector3());
    const scala = GRANDEZZA / Math.max(dimensioni.x, dimensioni.y, dimensioni.z);
    modello.scale.setScalar(scala);
    modello.position.copy(centro).multiplyScalar(-scala);
    v.oggetto.add(modello);
    // se le stanghette vanno verso +z, giriamo il modello così il frontale guarda la camera
    if (info.verso > 0) v.oggetto.rotation.y = Math.PI;
    v.pavimento.position.y = -dimensioni.y * scala / 2 - 0.35;
}

// ===== OGNI FOTOGRAMMA =====
function morbido(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
}

export function aggiorna(v, dt) {
    v.avanzamentoEsploso = THREE.MathUtils.clamp(v.avanzamentoEsploso + (v.esploso ? 1 : -1) * dt * VELOCITA_ESPLOSO, 0, 1);
    const t = morbido(v.avanzamentoEsploso);
    v.pezzi.forEach(function(p) {
        p.oggetto.position.lerpVectors(p.riunito, p.esploso, t);
    });

    const fine = 1 + RITARDO;
    v.avanzamentoStanghette = THREE.MathUtils.clamp(v.avanzamentoStanghette + (v.chiuse ? 1 : -1) * dt * VELOCITA_STANGHETTE, 0, fine);
    // la sinistra si chiude per prima (e si riapre per ultima)
    const s = v.perni.sinistra, d = v.perni.destra;
    if (s) s.rotation.y = s.userData.segno * s.userData.chiusura * morbido(v.avanzamentoStanghette);
    if (d) d.rotation.y = d.userData.segno * d.userData.chiusura * morbido(v.avanzamentoStanghette - (s ? RITARDO : 0));
}
