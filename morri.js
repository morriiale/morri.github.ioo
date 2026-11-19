// morri.js – il sito Morri: gli occhiali 3D che seguono lo scroll
// (collegato a morri/index.html con <script type="module" src="morri.js">)
//
// - un solo canvas fisso: gli occhiali passano dietro ai testi e davanti al marchio gigante
// - ogni sezione ha uno "stato" degli occhiali (posizione, rotazione, grandezza, esploso, stanghette):
//   scorrendo, gli occhiali passano con calma da uno stato all'altro
// - le lenti sono nere e trasparenti, specchiate: riflettono un cielo azzurro costruito apposta,
//   che gira seguendo il mouse
// - in js/: il modello, i materiali, lo shop e la borsa (morri-modello.js, in comune con prova.html)
//   e stanghette ed esploso (meccanica.js)
// - "Provali" apre la pagina prova.html con i colori scelti nello shop

import * as THREE from 'three';
import { nuovoStato, preparaModello } from './js/meccanica.js';
import {
    caricaModelloMorri, applicaScelta, creaCampioni, opzione, prezzo, euro,
    SCELTA_INIZIALE, indirizzoProva, leggiBorsa, salvaBorsa
} from './js/morri-modello.js';

const pocoMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


// ===== IL CIELO DA RIFLETTERE =====
// una sfera con una sfumatura (nero in basso, bianco all'orizzonte, azzurro in alto)
// e qualche pannello luminoso: è quello che si specchia nelle lenti e nell'acetato
function creaCielo(renderer) {
    const cielo = new THREE.Scene();
    cielo.add(new THREE.Mesh(
        new THREE.SphereGeometry(10, 64, 32),
        new THREE.ShaderMaterial({
            side: THREE.BackSide,
            vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: [
                'varying vec3 vPos;',
                'void main() {',
                '  float h = normalize(vPos).y;',
                '  vec3 basso = vec3(0.015, 0.02, 0.03);',
                '  vec3 orizzonte = vec3(0.78, 0.9, 1.0);',
                '  vec3 alto = vec3(0.08, 0.42, 1.0);',
                '  vec3 c = h > 0.0 ? mix(orizzonte, alto, pow(h, 0.55)) : mix(orizzonte, basso, pow(-h, 0.3));',
                '  gl_FragColor = vec4(c * 1.3, 1.0);',
                '}'
            ].join('\n')
        })
    ));
    // i pannelli luminosi: danno i riflessi netti
    const pannello = function(larghezza, altezza, colore, forza, x, y, z) {
        const m = new THREE.Mesh(
            new THREE.PlaneGeometry(larghezza, altezza),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(colore).multiplyScalar(forza), side: THREE.DoubleSide })
        );
        m.position.set(x, y, z);
        m.lookAt(0, 0, 0);
        cielo.add(m);
    };
    pannello(9, 1.2, '#ffffff', 6, 0, 6, 4);       // una striscia bianca in alto, davanti
    pannello(2.5, 6, '#9ad6ff', 4, -7, 1, 3);      // un pannello azzurro a sinistra
    pannello(2, 4, '#ffffff', 3, 7, 0.5, -2);      // un pannello bianco a destra, dietro
    pannello(1.2, 1.2, '#3d9bff', 8, 3, 3, 6);     // un punto azzurro intenso
    const pmrem = new THREE.PMREMGenerator(renderer);
    return pmrem.fromScene(cielo, 0.02).texture;
}

// ===== LA SCENA =====
const canvas = document.getElementById('scena');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scena = new THREE.Scene();
scena.environment = creaCielo(renderer);

// una luce principale per i riflessi e una "di contorno" azzurra da dietro (si vede sul nero)
const luce = new THREE.DirectionalLight(0xffffff, 1.6);
luce.position.set(2, 4, 5);
scena.add(luce);
const contorno = new THREE.DirectionalLight(0x9ad6ff, 2.5);
contorno.position.set(-3, 2, -4);
scena.add(contorno);

const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 7);

// perno: il gruppo che si muove con lo scroll. dentro c'è "oggetto", dove meccanica.js mette il modello
const perno = new THREE.Group();
scena.add(perno);
const v = Object.assign(nuovoStato(), { oggetto: new THREE.Group(), pavimento: new THREE.Object3D() });
perno.add(v.oggetto);

// ===== GLI STATI DEGLI OCCHIALI, SEZIONE PER SEZIONE =====
// x, y: posizione (1 = bordo dello schermo); s: grandezza; rx, ry, rz: rotazione;
// esploso, chiuse: da 0 a 1; gira: rotazione continua
const STATI = {
    apertura:          { x: 0,     y: -0.04, s: 1.25, rx: 0.12, ry: 0,     rz: 0,     esploso: 0, chiuse: 0, gira: 0 },
    // la forma: quasi di fronte, per leggere il disegno del frontale
    forma:             { x: 0.45,  y: 0,     s: 1.15, rx: 0.04, ry: -0.12, rz: 0,     esploso: 0, chiuse: 0, gira: 0 },
    // la materia (sezione scura): di tre quarti e da vicino, la luce scorre sull'acetato
    materia:           { x: 0.4,   y: -0.05, s: 1.6,  rx: 0.22, ry: -0.85, rz: 0.08,  esploso: 0, chiuse: 0, gira: 0 },
    // i dettagli: da dietro, per vedere cerniere e interno delle aste
    dettagli:          { x: 0.45,  y: 0,     s: 1.25, rx: 0.35, ry: 2.35,  rz: 0,     esploso: 0, chiuse: 0, gira: 0 },
    costruzioneInizio: { x: 0.42,  y: 0,     s: 0.9,  rx: 0.45, ry: -0.55, rz: 0,     esploso: 0, chiuse: 0, gira: 0 },
    costruzioneFine:   { x: 0.42,  y: 0,     s: 0.85, rx: 0.55, ry: -0.95, rz: 0,     esploso: 1, chiuse: 0, gira: 0 },
    chiusuraInizio:    { x: -0.4,  y: 0,     s: 1.05, rx: 0.28, ry: 0.7,   rz: 0,     esploso: 0, chiuse: 0, gira: 0 },
    chiusuraFine:      { x: -0.4,  y: 0,     s: 1.15, rx: 0.4,  ry: 1.25,  rz: -0.05, esploso: 0, chiuse: 1, gira: 0 },
    misure:            { x: 0.5,   y: 0.42,  s: 0.62, rx: 0.15, ry: 0.35,  rz: 0,     esploso: 0, chiuse: 0, gira: 0 },
    // il progetto (sezione scura): girano piano, come su un tavolo da lavoro
    progetto:          { x: 0.42,  y: 0,     s: 1.0,  rx: 0.5,  ry: -0.4,  rz: 0,     esploso: 0, chiuse: 0, gira: 0.5 },
    // le viste fisse: gli occhiali 3D escono dallo schermo verso l'alto (parlano le immagini)
    viste:             { x: 0.3,   y: 1.9,   s: 0.7,  rx: 0.3,  ry: 0.6,   rz: 0,     esploso: 0, chiuse: 0, gira: 0 },
    // lo shop: a sinistra, grandi, girano piano mentre scegli i colori (il pannello è a destra)
    shop:              { x: -0.42, y: 0,     s: 1.2,  rx: 0.18, ry: 0.5,   rz: 0,     esploso: 0, chiuse: 0, gira: 0.35 },
    prova:             { x: 0.42,  y: 0,     s: 1.1,  rx: 0.12, ry: -0.3,  rz: 0,     esploso: 0, chiuse: 0, gira: 1 }
};
const CHIAVI = Object.keys(STATI.apertura);

// i punti dello scroll in cui gli occhiali raggiungono ogni stato
let tappe = [];
function calcolaTappe() {
    tappe = [];
    document.querySelectorAll('[data-scena]').forEach(function(sezione) {
        const nome = sezione.dataset.scena;
        const alto = sezione.getBoundingClientRect().top + window.scrollY;
        if (sezione.classList.contains('m-lunga')) {
            // sezione lunga: uno stato all'inizio e uno alla fine (in mezzo, esploso o stanghette avanzano)
            tappe.push({ y: alto, stato: STATI[nome + 'Inizio'] });
            tappe.push({ y: alto + sezione.offsetHeight - window.innerHeight, stato: STATI[nome + 'Fine'] });
        } else {
            tappe.push({ y: Math.max(0, alto - window.innerHeight * 0.3), stato: STATI[nome] });
        }
    });
    tappe.sort(function(a, b) { return a.y - b.y; });
}

function morbido(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
}

// lo stato che corrisponde allo scroll di adesso
const obiettivo = Object.assign({}, STATI.apertura);
function statoDelloScroll() {
    const y = window.scrollY;
    if (tappe.length === 0) return;
    let da = tappe[0], a = tappe[0];
    if (y >= tappe[tappe.length - 1].y) {
        da = a = tappe[tappe.length - 1];
    } else {
        for (let i = 0; i < tappe.length - 1; i++) {
            if (y >= tappe[i].y && y < tappe[i + 1].y) {
                da = tappe[i];
                a = tappe[i + 1];
                break;
            }
        }
    }
    const t = da === a ? 0 : morbido((y - da.y) / (a.y - da.y));
    CHIAVI.forEach(function(k) {
        obiettivo[k] = da.stato[k] + (a.stato[k] - da.stato[k]) * t;
    });
}

// ===== IL MOUSE =====
// il cielo riflesso gira seguendo il mouse, e gli occhiali si inclinano appena
const mouse = { x: 0, y: 0, mx: 0, my: 0 };
window.addEventListener('pointermove', function(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});

// ===== OGNI FOTOGRAMMA =====
const attuale = Object.assign({}, STATI.apertura);
let angoloGiro = 0;
let tempo = 0;
const barraEsploso = document.getElementById('barra-esploso');
const orologio = new THREE.Clock();

// esploso e stanghette: da 0 a 1
function impostaMeccanica(esploso, chiuse) {
    const t = morbido(esploso);
    v.pezzi.forEach(function(p) {
        p.oggetto.position.lerpVectors(p.riunito, p.esploso, t);
    });
    const s = v.perni.sinistra, d = v.perni.destra;
    const c = chiuse * 1.35;   // la seconda stanghetta parte un po' dopo la prima
    if (s) s.rotation.y = s.userData.segno * s.userData.chiusura * morbido(c);
    if (d) d.rotation.y = d.userData.segno * d.userData.chiusura * morbido(c - (s ? 0.35 : 0));
}

function applicaMeccanica() {
    // l'esploso e le stanghette seguono lo scroll (non un bottone)
    impostaMeccanica(attuale.esploso, attuale.chiuse);
    if (barraEsploso) barraEsploso.style.transform = 'scaleX(' + attuale.esploso.toFixed(3) + ')';
}

// ===== LE VISTE FISSE =====
// al caricamento, il renderer "scatta" una foto del modello per ogni casella della griglia:
// stesse luci e stessi materiali del 3D, sfondo trasparente (il colore lo dà la casella)
// w, h: misura della foto; s: grandezza; rx, ry: rotazione; dettaglio: primo piano su un punto
const VISTE = {
    treQuarti: { w: 1100, h: 1100, s: 1.15, rx: 0.25, ry: -0.7 },
    frontale:  { w: 1400, h: 700,  s: 1.25, rx: 0,    ry: 0 },
    profilo:   { w: 700,  h: 700,  s: 0.9,  rx: 0,    ry: Math.PI / 2 },
    alto:      { w: 700,  h: 700,  s: 0.9,  rx: Math.PI / 2, ry: 0 },
    cerniera:  { w: 600,  h: 1200, s: 1,    rx: 0.15, ry: -0.9, dettaglio: 'cerniera', distanza: 1.3 },
    esploso:   { w: 1400, h: 700,  s: 0.95, rx: 0.45, ry: -0.6, esploso: 1 },
    chiusi:    { w: 700,  h: 700,  s: 0.95, rx: 0.35, ry: -0.5, chiuse: 1 },
    dietro:    { w: 1400, h: 700,  s: 1.15, rx: 0.2,  ry: Math.PI - 0.45 },
    ponte:     { w: 700,  h: 700,  s: 1,    rx: 0.05, ry: 0, dettaglio: 'ponte', distanza: 1.2 }
};

// il punto da guardare da vicino (nelle misure della scena)
function puntoDettaglio(nome) {
    if (nome === 'cerniera') {
        const perno = v.perni.destra || v.perni.sinistra;
        if (perno) return perno.getWorldPosition(new THREE.Vector3());
    }
    // il ponte: al centro, nella parte alta del frontale, sul davanti
    const box = new THREE.Box3().setFromObject(v.oggetto);
    return new THREE.Vector3(0, box.max.y - (box.max.y - box.min.y) * 0.3, box.max.z);
}

function fotografaViste() {
    const pixelPrima = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    scena.environmentRotation.set(0, 0.4, 0);
    const davanti = new THREE.Vector3(0, 0.12, 1).normalize();

    document.querySelectorAll('[data-vista]').forEach(function(figura) {
        const vista = VISTE[figura.dataset.vista];
        if (!vista) return;
        renderer.setSize(vista.w, vista.h, false);
        camera.aspect = vista.w / vista.h;

        perno.position.set(0, 0, 0);
        perno.scale.setScalar(vista.s || 1);
        perno.rotation.set(vista.rx || 0, vista.ry || 0, 0);
        impostaMeccanica(vista.esploso || 0, vista.chiuse || 0);
        scena.updateMatrixWorld(true);

        camera.position.set(0, 0, 7);
        camera.lookAt(0, 0, 0);
        if (vista.dettaglio) {
            const punto = puntoDettaglio(vista.dettaglio);
            camera.position.copy(punto).addScaledVector(davanti, vista.distanza);
            camera.lookAt(punto);
        }
        camera.updateProjectionMatrix();
        renderer.render(scena, camera);
        figura.querySelector('img').src = renderer.domElement.toDataURL('image/png');
    });

    // tutto come prima
    renderer.setPixelRatio(pixelPrima);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.position.set(0, 0, 7);
    camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix();
    impostaMeccanica(0, 0);
}

function fotogramma() {
    const dt = Math.min(orologio.getDelta(), 0.05);
    tempo += dt;
    statoDelloScroll();

    // gli occhiali raggiungono lo stato con calma (più è alto il numero, più sono rapidi)
    const k = 1 - Math.exp(-dt * 5);
    CHIAVI.forEach(function(chiave) {
        attuale[chiave] += (obiettivo[chiave] - attuale[chiave]) * k;
    });
    mouse.mx += (mouse.x - mouse.mx) * k;
    mouse.my += (mouse.y - mouse.my) * k;

    // la rotazione continua (nella sezione "Provali"); fuori, torna al giro intero più vicino
    angoloGiro += dt * 0.6 * attuale.gira;
    const giroIntero = Math.round(angoloGiro / (Math.PI * 2)) * Math.PI * 2;
    angoloGiro += (giroIntero - angoloGiro) * (1 - attuale.gira) * k;

    // posizione in proporzione allo schermo: sul telefono gli occhiali stanno in alto, al centro
    const mezzaAltezza = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const mezzaLarghezza = mezzaAltezza * camera.aspect;
    const verticale = camera.aspect < 0.9;
    const scalaSchermo = verticale ? Math.min(1, mezzaLarghezza / 1.25) : 1;
    const ondeggio = pocoMovimento ? 0 : Math.sin(tempo * 0.6) * 0.05;

    perno.position.set(
        verticale ? 0 : attuale.x * mezzaLarghezza,
        verticale ? mezzaAltezza * 0.42 : attuale.y * mezzaAltezza,
        0
    );
    perno.scale.setScalar(attuale.s * scalaSchermo);
    perno.rotation.set(
        attuale.rx + mouse.my * 0.08,
        attuale.ry + angoloGiro + mouse.mx * 0.14 + ondeggio,
        attuale.rz
    );
    scena.environmentRotation.set(mouse.my * 0.25, mouse.mx * 0.9 + tempo * 0.03, 0);

    applicaMeccanica();
    renderer.render(scena, camera);
}

window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    calcolaTappe();
});

// ===== I TESTI CHE ENTRANO =====
// i titoli vengono divisi in parole: ogni parola sale da sotto, una dopo l'altra
function dividiInParole(titolo) {
    const nodi = Array.from(titolo.childNodes);
    titolo.textContent = '';
    let i = 0;
    const parola = function(testo, involucro) {
        const fuori = document.createElement('span');
        fuori.className = 'm-parola';
        const dentro = document.createElement('span');
        dentro.style.setProperty('--i', i++);
        if (involucro) {
            const copia = involucro.cloneNode(false);
            copia.textContent = testo;
            dentro.appendChild(copia);
        } else {
            dentro.textContent = testo;
        }
        fuori.appendChild(dentro);
        return fuori;
    };
    nodi.forEach(function(nodo) {
        const involucro = nodo.nodeType === Node.ELEMENT_NODE ? nodo : null;
        nodo.textContent.split(/(\s+)/).forEach(function(pezzo) {
            if (!pezzo) return;
            if (/^\s+$/.test(pezzo)) titolo.appendChild(document.createTextNode(' '));
            else titolo.appendChild(parola(pezzo, involucro));
        });
    });
}
document.querySelectorAll('[data-dividi]').forEach(dividiInParole);

const osservatore = new IntersectionObserver(function(voci) {
    voci.forEach(function(voce) {
        if (voce.isIntersecting) {
            voce.target.classList.add('visibile');
            osservatore.unobserve(voce.target);
        }
    });
}, { threshold: 0.2 });
document.querySelectorAll('[data-dividi], .m-rivela').forEach(function(el) {
    osservatore.observe(el);
});

// ===== IL CURSORE =====
const cursore = document.querySelector('.m-cursore');
const puntatore = { x: -100, y: -100, cx: -100, cy: -100 };
window.addEventListener('pointermove', function(e) {
    puntatore.x = e.clientX;
    puntatore.y = e.clientY;
    cursore.classList.toggle('sopra-link', Boolean(e.target.closest('a, button')));
});
function muoviCursore() {
    puntatore.cx += (puntatore.x - puntatore.cx) * 0.2;
    puntatore.cy += (puntatore.y - puntatore.cy) * 0.2;
    cursore.style.transform = 'translate(' + puntatore.cx + 'px, ' + puntatore.cy + 'px)';
    requestAnimationFrame(muoviCursore);
}
muoviCursore();

// ===== LO SHOP =====
// le opzioni (colori e prezzi) sono in js/morri-modello.js
const scelta = Object.assign({}, SCELTA_INIZIALE);
let materialiPrincipali = null;   // i materiali degli occhiali 3D della pagina

// i campioni: uno per ogni opzione, in ogni gruppo
document.querySelectorAll('.m-scelta').forEach(function(blocco) {
    const gruppo = blocco.dataset.gruppo;
    creaCampioni(blocco.querySelector('.m-campioni'), gruppo, scelta, function(id) {
        scelta[gruppo] = id;
        aggiornaShop();
    });
});

function aggiornaShop() {
    document.querySelectorAll('.m-scelta').forEach(function(blocco) {
        const gruppo = blocco.dataset.gruppo;
        blocco.querySelector('.m-scelta-valore').textContent = opzione(gruppo, scelta[gruppo]).nome;
    });
    document.getElementById('shop-prezzo').textContent = euro(prezzo(scelta));
    if (materialiPrincipali) applicaScelta(materialiPrincipali, scelta);   // gli occhiali 3D cambiano subito
}

// ===== LA BORSA =====
// resta salvata in questo browser (localStorage), ma non viene mandata da nessuna parte
// (prova.html legge e aggiunge alla stessa borsa)
let borsa = leggiBorsa();

function disegnaBorsa() {
    const elenco = document.getElementById('borsa-elenco');
    elenco.innerHTML = '';
    let totale = 0;
    borsa.forEach(function(articolo, i) {
        const p = prezzo(articolo);
        totale += p;
        const voce = document.createElement('li');
        const colori = document.createElement('div');
        colori.className = 'm-borsa-colori';
        ['montatura', 'lenti', 'cerniere'].forEach(function(g) {
            const o = opzione(g, articolo[g]);
            const pallino = document.createElement('span');
            pallino.style.background = o.campione || o.colore;
            colori.appendChild(pallino);
        });
        const testo = document.createElement('div');
        testo.innerHTML = '<h3>Morri 01</h3><p></p><button type="button">Rimuovi</button>';
        testo.querySelector('p').textContent = opzione('montatura', articolo.montatura).nome + ' · lenti ' +
            opzione('lenti', articolo.lenti).nome.toLowerCase() + ' · cerniere ' + opzione('cerniere', articolo.cerniere).nome.toLowerCase();
        testo.querySelector('button').addEventListener('click', function() {
            borsa.splice(i, 1);
            salvaBorsa(borsa);
            disegnaBorsa();
        });
        const cifra = document.createElement('span');
        cifra.className = 'm-borsa-prezzo';
        cifra.textContent = euro(p);
        voce.appendChild(colori);
        voce.appendChild(testo);
        voce.appendChild(cifra);
        elenco.appendChild(voce);
    });
    document.getElementById('borsa-numero').textContent = borsa.length;
    document.getElementById('borsa-totale').textContent = euro(totale);
    document.getElementById('borsa-vuota').hidden = borsa.length > 0;
    document.getElementById('borsa-procedi').disabled = borsa.length === 0;
    document.getElementById('borsa-messaggio').hidden = true;
}

function apriBorsa(aperta) {
    document.body.classList.toggle('borsa-aperta', aperta);
    document.querySelector('.m-borsa').setAttribute('aria-hidden', !aperta);
}

document.querySelectorAll('.js-apri-borsa').forEach(function(b) {
    b.addEventListener('click', function() { apriBorsa(true); });
});
document.querySelectorAll('.js-chiudi-borsa').forEach(function(b) {
    b.addEventListener('click', function() { apriBorsa(false); });
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') apriBorsa(false);
});

const bottoneAggiungi = document.getElementById('shop-aggiungi');
bottoneAggiungi.addEventListener('click', function() {
    borsa.push(Object.assign({}, scelta));
    salvaBorsa(borsa);
    disegnaBorsa();
    // per un attimo il bottone dice "Aggiunto", poi si apre la borsa
    const testo = bottoneAggiungi.querySelector('span');
    testo.textContent = 'Aggiunto';
    bottoneAggiungi.classList.add('aggiunto');
    setTimeout(function() {
        testo.textContent = 'Aggiungi alla borsa';
        bottoneAggiungi.classList.remove('aggiunto');
        apriBorsa(true);
    }, 700);
});

document.getElementById('borsa-procedi').addEventListener('click', function() {
    document.getElementById('borsa-messaggio').hidden = false;
});

aggiornaShop();
disegnaBorsa();

// ===== PROVALI SU DI TE =====
// apre la pagina della prova con i colori scelti nello shop
document.querySelectorAll('.js-prova').forEach(function(bottone) {
    bottone.addEventListener('click', function() {
        window.location.href = indirizzoProva(scelta);
    });
});

// tornando dalla prova, la borsa potrebbe essere cambiata (il browser a volte riusa la pagina)
window.addEventListener('pageshow', function() {
    borsa = leggiBorsa();
    disegnaBorsa();
});

// ===== AVVIO =====
document.body.classList.add('m-in-caricamento');
const schermoCaricamento = document.querySelector('.m-caricamento');
const percentuale = document.getElementById('percentuale');

caricaModelloMorri(function(quanto) {
    const p = Math.min(99, Math.round(quanto * 100));
    percentuale.textContent = p;
    schermoCaricamento.style.setProperty('--avanzamento', p / 100);
}, scelta).then(function(r) {
    preparaModello(v, r.modello, r.pezzi);   // stanghette ed esploso (da meccanica.js)
    materialiPrincipali = r.materiali;
    applicaScelta(materialiPrincipali, scelta);
    fotografaViste();                        // le immagini della griglia (sotto lo schermo di caricamento)
    percentuale.textContent = '100';
    schermoCaricamento.style.setProperty('--avanzamento', 1);
    calcolaTappe();
    renderer.setAnimationLoop(fotogramma);

    // via lo schermo di caricamento: il marchio sale, gli occhiali compaiono
    setTimeout(function() {
        schermoCaricamento.classList.add('finito');
        document.body.classList.remove('m-in-caricamento');
        document.body.classList.add('m-pronto');
        setTimeout(function() { schermoCaricamento.remove(); }, 1100);
    }, 350);
}).catch(function(errore) {
    console.error('Morri: non è stato possibile caricare gli occhiali', errore);
    percentuale.parentNode.innerHTML = '<span style="font-size:0.2em">Apri il sito da un server (es. Live Server) per caricare il modello 3D.</span>';
});

// quando i caratteri sono pronti le sezioni cambiano altezza: ricalcoliamo le tappe
if (document.fonts && document.fonts.ready) document.fonts.ready.then(calcolaTappe);
