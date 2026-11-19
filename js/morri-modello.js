// morri-modello.js – quello che serve a tutte e due le pagine di Morri (index.html e prova.html):
// il file 3D con i suoi materiali, le opzioni dello shop (colori e prezzi) e la borsa

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { pulisci } from './pulizia.js';

// il percorso è calcolato da questo file, così funziona da qualsiasi pagina
export const FILE = new URL('../modelli/morri.glb', import.meta.url).href;
export const PESO_FILE = 13956440;   // se il server non dice quanto pesa il file, per la percentuale

// ===== I MATERIALI =====
// acetato nero lucido (frontale e aste separati, così nella prova si possono colorare a parte),
// cerniere in metallo canna di fucile, lenti nere trasparenti specchiate azzurre
export function creaMaterialiMorri() {
    const acetato = function(nome) {
        return new THREE.MeshPhysicalMaterial({
            name: nome,
            color: 0x0a0a0b,
            roughness: 0.16,
            clearcoat: 1,
            clearcoatRoughness: 0.03,
            side: THREE.DoubleSide
        });
    };
    return {
        frontale: acetato('Frontale'),
        aste: acetato('Aste'),
        cerniere: new THREE.MeshPhysicalMaterial({
            name: 'Cerniere',
            color: 0x34373d,
            metalness: 1,
            roughness: 0.22
        }),
        lenti: new THREE.MeshPhysicalMaterial({
            name: 'Lenti',
            color: 0x07121f,          // nero bluastro: da dentro si vede scuro
            metalness: 0.65,          // lo specchio
            roughness: 0.02,
            transparent: true,
            opacity: 0.84,            // ma resta trasparente
            iridescence: 1,           // la specchiatura cambia colore con l'angolo (sull'azzurro)
            iridescenceIOR: 1.7,
            iridescenceThicknessRange: [260, 420],
            envMapIntensity: 2.4,
            side: THREE.DoubleSide
        })
    };
}

// ===== IL MODELLO =====
// nel file le parti hanno colori "di lavoro": rosso = frontale (e lenti), verde = aste, blu = cerniere
export function caricaModelloMorri(avanzamento, scelta) {
    return new Promise(function(risolvi, rifiuta) {
        new GLTFLoader().load(FILE, risolvi, function(e) {
            if (avanzamento) avanzamento(e.loaded / (e.total || PESO_FILE));
        }, rifiuta);
    }).then(function(gltf) {
        const modello = gltf.scene;
        const materiali = creaMaterialiMorri();
        const daTogliere = [];
        modello.traverse(function(o) {
            if (!o.isMesh) return;
            const c = o.material.color;
            let parte = null;
            if (c.r > 0.5 && c.g < 0.5 && c.b < 0.5) parte = 'frontale';
            else if (c.g > 0.5 && c.r < 0.5) parte = 'aste';
            else if (c.b > 0.5 && c.r < 0.5) parte = 'cerniere';
            if (parte) {
                o.userData.parte = parte;
                o.material = materiali[parte];
            } else {
                daTogliere.push(o);   // quote e tavole del disegno
            }
        });
        daTogliere.forEach(function(o) { o.removeFromParent(); });

        let pezzi = pulisci(modello, gltf.parser.associations);

        // le lenti: pezzi "rossi" grandi come una lente (larghi 4-7 cm, alti più di 3 cm).
        // nel file la lente sinistra c'è due volte: teniamo solo le lenti che hanno
        // una gemella uguale (stesso numero di punti) dall'altra parte
        const info = function(p) {
            let parte = null, punti = 0;
            p.traverse(function(o) {
                if (!o.isMesh) return;
                parte = o.userData.parte;
                punti += o.geometry.attributes.position.count;
            });
            const box = new THREE.Box3().setFromObject(p);
            return { pezzo: p, parte: parte, punti: punti, box: box, centro: box.getCenter(new THREE.Vector3()), misura: box.getSize(new THREE.Vector3()) };
        };
        const candidate = pezzi.map(info).filter(function(c) {
            return c.parte === 'frontale' && c.misura.x > 0.035 && c.misura.x < 0.07 && c.misura.y > 0.03;
        });
        candidate.forEach(function(c) {
            const gemella = candidate.some(function(altra) {
                return altra !== c && Math.sign(altra.centro.x) !== Math.sign(c.centro.x) && altra.punti === c.punti;
            });
            if (gemella) {
                c.pezzo.traverse(function(o) {
                    if (!o.isMesh) return;
                    o.material = materiali.lenti;
                    o.userData.parte = 'lenti';
                });
            } else {
                c.pezzo.removeFromParent();
            }
        });
        pezzi = pezzi.filter(function(p) { return p.parent; });
        applicaScelta(materiali, scelta || SCELTA_INIZIALE);   // i colori scelti nello shop
        return { modello: modello, pezzi: pezzi, materiali: materiali };
    });
}

// ===== LO SHOP =====
// le opzioni di ogni parte. extra = quanto costa in più
export const PREZZO_BASE = 220;
export const OPZIONI = {
    montatura: [
        { id: 'nero',   nome: 'Nero lucido',      colore: '#0a0a0b', ruvido: 0.16, laccato: 1 },
        { id: 'opaco',  nome: 'Nero opaco',       colore: '#141414', ruvido: 0.65, laccato: 0 },
        { id: 'avana',  nome: 'Avana',            colore: '#4a2c17', ruvido: 0.16, laccato: 1 },
        { id: 'blu',    nome: 'Blu notte',        colore: '#0f1a2e', ruvido: 0.16, laccato: 1 },
        { id: 'verde',  nome: 'Verde bottiglia',  colore: '#12261c', ruvido: 0.16, laccato: 1 },
        { id: 'fume',   nome: 'Cristallo fumé',   colore: '#3a3a3c', ruvido: 0.1,  laccato: 1, opacita: 0.72, extra: 20 }
    ],
    lenti: [
        { id: 'azzurro', nome: 'Specchio azzurro', colore: '#07121f', metallo: 0.65, iridescenza: 1, opacita: 0.84, specchio: true, campione: '#5aa9ff', extra: 20 },
        { id: 'argento', nome: 'Specchio argento', colore: '#1b1d20', metallo: 0.9,  iridescenza: 0, opacita: 0.88, specchio: true, campione: '#b9bec6', extra: 20 },
        { id: 'fume',    nome: 'Fumé',             colore: '#161616', metallo: 0.1,  iridescenza: 0, opacita: 0.86 },
        { id: 'marrone', nome: 'Marrone',          colore: '#3a2414', metallo: 0.1,  iridescenza: 0, opacita: 0.82 },
        { id: 'verde',   nome: 'Verde',            colore: '#1d2b1f', metallo: 0.1,  iridescenza: 0, opacita: 0.84 }
    ],
    cerniere: [
        { id: 'canna',   nome: 'Canna di fucile', colore: '#34373d' },
        { id: 'argento', nome: 'Argento',         colore: '#c8c8c8' },
        { id: 'oro',     nome: 'Oro',             colore: '#c9a646' },
        { id: 'nero',    nome: 'Nero',            colore: '#151515' }
    ]
};
export const SCELTA_INIZIALE = { montatura: 'nero', lenti: 'azzurro', cerniere: 'canna' };

// l'opzione di un gruppo (es. opzione('lenti', 'fume'))
export function opzione(gruppo, id) {
    return OPZIONI[gruppo].find(function(o) { return o.id === id; }) || OPZIONI[gruppo][0];
}

export function prezzo(config) {
    return PREZZO_BASE + Object.keys(OPZIONI).reduce(function(somma, gruppo) {
        return somma + (opzione(gruppo, config[gruppo]).extra || 0);
    }, 0);
}

export function euro(n) {
    return '€ ' + n.toLocaleString('it-IT');
}

// dà ai materiali (frontale, aste, cerniere, lenti) i colori della configurazione
export function applicaScelta(materiali, scelta) {
    const m = opzione('montatura', scelta.montatura), l = opzione('lenti', scelta.lenti), c = opzione('cerniere', scelta.cerniere);
    [materiali.frontale, materiali.aste].forEach(function(mat) {
        if (!mat) return;
        mat.color.set(m.colore);
        mat.roughness = m.ruvido;
        mat.clearcoat = m.laccato;
        mat.transparent = Boolean(m.opacita);
        mat.opacity = m.opacita || 1;
        mat.depthWrite = !m.opacita;
        mat.needsUpdate = true;
    });
    const lente = materiali.lenti;
    if (lente) {
        lente.color.set(l.colore);
        lente.metalness = l.metallo;
        lente.iridescence = l.iridescenza;
        lente.transparent = true;
        lente.opacity = l.opacita;
        lente.needsUpdate = true;
    }
    if (materiali.cerniere) materiali.cerniere.color.set(c.colore);
}

// i campioni di un gruppo dentro "fila"; quando ne scegli uno chiama quandoScegli(id)
export function creaCampioni(fila, gruppo, scelta, quandoScegli) {
    fila.innerHTML = '';
    OPZIONI[gruppo].forEach(function(o) {
        const campione = document.createElement('button');
        campione.type = 'button';
        campione.className = 'm-campione' + (o.specchio ? ' specchio' : '') + (o.id === scelta[gruppo] ? ' selected' : '');
        campione.style.background = o.campione || o.colore;
        if (o.opacita && gruppo === 'montatura') campione.style.opacity = 0.75;
        campione.setAttribute('aria-label', o.nome);
        campione.title = o.nome;
        if (o.extra) campione.dataset.extra = '+' + o.extra;
        campione.addEventListener('click', function() {
            fila.querySelectorAll('.m-campione').forEach(function(c) { c.classList.remove('selected'); });
            campione.classList.add('selected');
            quandoScegli(o.id);
        });
        fila.appendChild(campione);
    });
}

// ===== LA CONFIGURAZIONE NELL'INDIRIZZO =====
// prova.html?montatura=nero&lenti=azzurro&cerniere=canna
export function indirizzoProva(scelta) {
    return 'prova.html?' + new URLSearchParams(scelta).toString();
}

export function sceltaDallIndirizzo() {
    const p = new URLSearchParams(window.location.search);
    const scelta = Object.assign({}, SCELTA_INIZIALE);
    Object.keys(OPZIONI).forEach(function(gruppo) {
        const id = p.get(gruppo);
        if (id && OPZIONI[gruppo].some(function(o) { return o.id === id; })) scelta[gruppo] = id;
    });
    return scelta;
}

// ===== LA BORSA =====
// resta salvata in questo browser (localStorage), ma non viene mandata da nessuna parte
export function leggiBorsa() {
    try {
        return JSON.parse(localStorage.getItem('morri-borsa')) || [];
    } catch (e) {
        return [];
    }
}

export function salvaBorsa(borsa) {
    try {
        localStorage.setItem('morri-borsa', JSON.stringify(borsa));
    } catch (e) { /* senza salvataggio la borsa vale solo per questa visita */ }
}
