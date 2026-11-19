// prova.js – "Prova su di te": gli occhiali sul tuo viso, con la fotocamera del computer
// (lo usa morri.js con "import")
//
// come funziona:
// 1. la fotocamera riprende il viso (il video si vede come in uno specchio)
// 2. MediaPipe Face Landmarker trova sul viso 478 punti e la rotazione della testa.
//    gira tutto dentro il browser: le immagini non vengono mandate da nessuna parte
// 3. ogni fotogramma gli occhiali vengono messi sul ponte del naso, girati come la testa
//    e grandi in proporzione alla distanza tra gli occhi
// 4. una "testa invisibile" nasconde la parte delle stanghette che finisce dietro la testa

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELLO_VOLTO = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// i punti del viso che ci servono (numerazione di MediaPipe)
const PONTE_NASO = 168;      // tra gli occhi, dove appoggia il ponte degli occhiali
const OCCHIO_DESTRO = 33;    // angolo esterno dell'occhio
const OCCHIO_SINISTRO = 263; // angolo esterno dell'altro occhio

// la montatura è larga circa 1,55 volte la distanza tra gli angoli esterni degli occhi
const PROPORZIONE = 1.55;
const MORBIDEZZA = 0.5;      // quanto si "insegue" il viso a ogni fotogramma (meno = più fermo ma più lento)
const NON_SONO_OCCHIALI = /testa|head|viso/i;

// ===== ANALISI DEL MODELLO (usata anche da meccanica.js) =====
// i modelli hanno la larghezza lungo x, l'altezza lungo y e le stanghette lungo z;
// resta da capire se le stanghette vanno verso -z o verso +z (dipende da chi l'ha disegnato)
export function analizza(pezzi) {
    const box = new THREE.Box3();
    pezzi.forEach(function(m) {
        if (!m.userData.fisso) box.union(new THREE.Box3().setFromObject(m));
    });
    const centro = box.getCenter(new THREE.Vector3());
    const dimensioni = box.getSize(new THREE.Vector3());

    // il frontale è dove stanno i pezzi centrali (lenti, ponte): guardiamo la loro z media
    let somma = 0, quanti = 0;
    pezzi.forEach(function(m) {
        if (m.userData.fisso) return;
        const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
        if (Math.abs(c.x - centro.x) < dimensioni.x * 0.15) {
            somma += c.z;
            quanti++;
        }
    });
    const zCentrali = quanti > 0 ? somma / quanti : centro.z;
    // verso: -1 se le stanghette vanno verso -z (frontale davanti, verso +z), +1 se vanno verso +z
    const verso = zCentrali > centro.z ? -1 : 1;
    const zFrontale = verso < 0 ? box.max.z : box.min.z;

    // l'altezza del frontale (le lenti): i pezzi che stanno nella parte davanti
    const boxFrontale = new THREE.Box3();
    pezzi.forEach(function(m) {
        if (m.userData.fisso) return;
        const b = new THREE.Box3().setFromObject(m);
        if ((b.getCenter(new THREE.Vector3()).z - zFrontale) * verso < dimensioni.z * 0.25) boxFrontale.union(b);
    });
    const yFrontale = boxFrontale.isEmpty() ? centro.y : (boxFrontale.min.y + boxFrontale.max.y) / 2;

    return { box: box, centro: centro, dimensioni: dimensioni, verso: verso, zFrontale: zFrontale, yFrontale: yFrontale };
}

// ===== IL FIOCCO =====
// un fiocco enorme e morbido sulla testa, fatto tutto con il codice (niente file):
// due anse gonfie con le pieghe, il nodo al centro, due code e tanti peletti per l'effetto "fluffy".
// le misure sono in proporzione alla larghezza della montatura (= 1)
const COLORE_FIOCCO = '#f7a8c8';
const COLORE_PELETTI = '#fcc9de';
const PELETTI = 6000;

// un "rumore" morbido fatto con i seni: rende la superficie un po' bitorzoluta, come un tessuto imbottito
function soffice(x, y, z) {
    return Math.sin(x * 13 + y * 7) * Math.sin(y * 11 - z * 9) * Math.sin(z * 12 + x * 5);
}

function creaFiocco() {
    const parti = [];

    // le due anse: sfere deformate, strette vicino al nodo e gonfie verso l'esterno
    [-1, 1].forEach(function(lato) {
        const g = new THREE.SphereGeometry(1, 72, 48);
        const pos = g.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const u = (v.x + 1) / 2;                                // 0 = vicino al nodo, 1 = punta esterna
            const gonfio = 0.35 + 0.65 * Math.pow(u, 0.6);
            const angolo = Math.atan2(v.z, v.y);
            const pieghe = 1 + 0.09 * Math.sin(angolo * 6 + u * 2) * u;   // le pieghe che partono dal nodo
            const r = gonfio * pieghe * (1 + 0.035 * soffice(v.x, v.y, v.z));
            pos.setXYZ(i, u * 0.62 * lato, v.y * 0.36 * r, v.z * 0.24 * r);
        }
        g.rotateZ(lato * 0.28);   // le punte un po' all'insù
        parti.push(g);
    });

    // il nodo al centro
    const nodo = new THREE.SphereGeometry(1, 48, 32);
    const pn = nodo.attributes.position;
    const vn = new THREE.Vector3();
    for (let i = 0; i < pn.count; i++) {
        vn.fromBufferAttribute(pn, i);
        const r = 1 + 0.06 * soffice(vn.x * 1.5, vn.y * 1.5, vn.z * 1.5);
        pn.setXYZ(i, vn.x * 0.16 * r, vn.y * 0.2 * r, vn.z * 0.18 * r);
    }
    parti.push(nodo);

    // le due code che scendono e si allargano
    [-1, 1].forEach(function(lato) {
        const g = new THREE.SphereGeometry(1, 40, 40);
        const pos = g.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const u = (1 - v.y) / 2;                     // 0 = in alto (al nodo), 1 = in fondo
            const larghezza = 0.09 + 0.06 * u;
            const r = 1 + 0.04 * soffice(v.x, v.y, v.z);
            pos.setXYZ(i,
                v.x * larghezza * r + lato * u * 0.2,      // si aprono verso l'esterno
                -u * 0.5,
                v.z * 0.05 * r - u * 0.06);
        }
        g.translate(0, -0.04, -0.02);
        parti.push(g);
    });

    const materiale = new THREE.MeshPhysicalMaterial({
        color: COLORE_FIOCCO,
        roughness: 0.95,
        sheen: 1,                     // il riflesso morbido dei tessuti vellutati
        sheenRoughness: 0.4,
        sheenColor: new THREE.Color('#fff0f6')
    });

    const molla = new THREE.Group();   // la parte che ondeggia
    parti.forEach(function(g) {
        g.computeVertexNormals();
        molla.add(new THREE.Mesh(g, materiale));
    });

    // i peletti: tanti coni piccolissimi sparsi sulla superficie, girati verso l'esterno
    const pelo = new THREE.ConeGeometry(0.006, 0.035, 4);
    pelo.translate(0, 0.0175, 0);      // la base del cono sulla superficie
    const peletti = new THREE.InstancedMesh(pelo, new THREE.MeshStandardMaterial({ color: COLORE_PELETTI, roughness: 1 }), PELETTI);
    const su = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const q = new THREE.Quaternion(), storto = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const totale = parti.reduce(function(t, g) { return t + g.attributes.position.count; }, 0);
    for (let i = 0; i < PELETTI; i++) {
        // un punto a caso della superficie (le parti più grandi ne ricevono di più)
        let k = Math.floor(Math.random() * totale), g = 0;
        while (k >= parti[g].attributes.position.count) {
            k -= parti[g].attributes.position.count;
            g++;
        }
        p.fromBufferAttribute(parti[g].attributes.position, k);
        n.fromBufferAttribute(parti[g].attributes.normal, k);
        q.setFromUnitVectors(su, n);
        storto.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.9));
        q.multiply(storto);
        const grandezza = 0.6 + Math.random() * 0.8;
        s.set(grandezza, grandezza, grandezza);
        m.compose(p.addScaledVector(n, -0.004), q, s);
        peletti.setMatrixAt(i, m);
    }
    molla.add(peletti);

    // il fiocco sta in cima alla testa, un po' indietro e inclinato
    const fiocco = new THREE.Group();
    fiocco.add(molla);
    fiocco.position.set(0, 0.92, -0.42);
    fiocco.rotation.x = -0.35;
    fiocco.scale.setScalar(1.35);    // enorme
    fiocco.userData.molla = molla;
    return fiocco;
}

// il fiocco è morbido: quando muovi la testa ondeggia e poi torna a posto (come una molla)
const ondeggio = { x: 0, z: 0, vx: 0, vz: 0, tempo: 0 };
function muoviFiocco(dt, velocita) {
    const RIGIDITA = 55, SMORZAMENTO = 7;
    ondeggio.tempo += dt;
    const obiettivoZ = THREE.MathUtils.clamp(velocita.x * 0.6, -0.5, 0.5);
    const obiettivoX = THREE.MathUtils.clamp(-velocita.y * 0.6, -0.4, 0.4);
    ondeggio.vz += ((obiettivoZ - ondeggio.z) * RIGIDITA - ondeggio.vz * SMORZAMENTO) * dt;
    ondeggio.vx += ((obiettivoX - ondeggio.x) * RIGIDITA - ondeggio.vx * SMORZAMENTO) * dt;
    ondeggio.z += ondeggio.vz * dt;
    ondeggio.x += ondeggio.vx * dt;
    const molla = fiocco.userData.molla;
    molla.rotation.z = ondeggio.z + Math.sin(ondeggio.tempo * 1.6) * 0.03;   // anche da fermo "respira" un po'
    molla.rotation.x = ondeggio.x;
    molla.scale.setScalar(1 + Math.sin(ondeggio.tempo * 2.1) * 0.015);
}

// ===== LA FINESTRA =====
let finestra = null;        // gli elementi della finestra (creati la prima volta)
let renderer, scena, camera, gruppo, testaInvisibile, fiocco;
let flusso = null;          // la fotocamera accesa
let riconoscimento = null;  // il Face Landmarker (promessa, caricato una volta sola)
let tentativo = 0;          // per ignorare i caricamenti di una prova già chiusa
let misura = 1;
let ultimoTempoVideo = -1;

const posizione = new THREE.Vector3();
const rotazione = new THREE.Quaternion();
let scala = 0;
let visoTrovato = false;

function creaFinestra() {
    const el = document.createElement('div');
    el.className = 'prova';
    el.hidden = true;
    el.innerHTML =
        '<div class="prova-barra">' +
            '<div class="prova-intestazione">' +
                '<p class="sovratitolo">Prova su di te</p>' +
                '<h3 class="prova-titolo"></h3>' +
            '</div>' +
            '<label class="prova-misura">Misura <input type="range" min="80" max="130" value="100"></label>' +
            '<button class="btn-aria prova-fiocco attivo" type="button" aria-pressed="true">Togli il fiocco</button>' +
            '<button class="btn-aria prova-scatta" type="button" disabled>Scatta una foto</button>' +
            '<button class="btn-aria prova-bottone-colori attivo" type="button" aria-pressed="true" hidden>Colori</button>' +
            '<button class="btn-aria prova-chiudi" type="button">Chiudi</button>' +
        '</div>' +
        '<div class="prova-area">' +
            '<div class="prova-specchio">' +
                '<video playsinline muted></video>' +
            '</div>' +
            '<p class="prova-stato"></p>' +
            // il pannello per cambiare i colori di ogni parte degli occhiali
            '<aside class="prova-colori" hidden>' +
                '<p class="sovratitolo">Colori</p>' +
                '<div class="prova-colori-parti"></div>' +
                '<button class="btn-aria prova-colori-ripristina" type="button">Torna ai colori originali</button>' +
            '</aside>' +
            '<div class="prova-conto" hidden></div>' +
            '<div class="prova-lampo"></div>' +
            // l'anteprima della foto scattata
            '<div class="prova-foto" hidden>' +
                '<img alt="La tua foto con gli occhiali">' +
                '<div class="prova-foto-comandi">' +
                    '<button class="btn-aria prova-condividi" type="button">Condividi su Instagram</button>' +
                    '<button class="btn-aria prova-scarica" type="button">Scarica la foto</button>' +
                    '<button class="btn-aria prova-rifai" type="button">Rifai</button>' +
                '</div>' +
                '<p class="prova-foto-nota"></p>' +
            '</div>' +
        '</div>';
    document.body.appendChild(el);

    finestra = {
        el: el,
        titolo: el.querySelector('.prova-titolo'),
        area: el.querySelector('.prova-area'),
        specchio: el.querySelector('.prova-specchio'),
        video: el.querySelector('video'),
        stato: el.querySelector('.prova-stato'),
        misura: el.querySelector('input'),
        scatta: el.querySelector('.prova-scatta'),
        conto: el.querySelector('.prova-conto'),
        lampo: el.querySelector('.prova-lampo'),
        foto: el.querySelector('.prova-foto'),
        fotoImmagine: el.querySelector('.prova-foto img'),
        fotoNota: el.querySelector('.prova-foto-nota'),
        colori: el.querySelector('.prova-colori'),
        pannelloColori: el.querySelector('.prova-colori'),
        bottoneColori: el.querySelector('.prova-bottone-colori')
    };
    preparaFoto();

    // il bottone "Colori" apre e chiude il pannello (sul telefono copre parte del video)
    finestra.bottoneColori.addEventListener('click', function() {
        const aperto = finestra.colori.classList.toggle('chiuso') === false;
        finestra.bottoneColori.classList.toggle('attivo', aperto);
        finestra.bottoneColori.setAttribute('aria-pressed', aperto);
    });
    // tutte le parti tornano al colore originale (si "clicca" il primo campione di ogni riga)
    el.querySelector('.prova-colori-ripristina').addEventListener('click', function() {
        finestra.colori.querySelectorAll('.campione-originale').forEach(function(c) { c.click(); });
    });

    // la scena 3D: sfondo trasparente, così sotto si vede il video
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    finestra.specchio.appendChild(renderer.domElement);

    scena = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scena.environmentIntensity = 0.7;
    scena.add(new THREE.AmbientLight(0xffffff, 0.6));
    const luce = new THREE.DirectionalLight(0xffffff, 1.6);
    luce.position.set(0.3, 1, 2);
    scena.add(luce);

    // camera "piatta" (ortografica) grande come l'immagine del video:
    // x da 0 alla larghezza (in proporzione), y da 0 (in basso) a 1 (in alto)
    camera = new THREE.OrthographicCamera(0, 1, 1, 0, -100, 100);

    // il gruppo che segue il viso: dentro ci sono gli occhiali e la testa invisibile
    gruppo = new THREE.Group();
    gruppo.visible = false;
    scena.add(gruppo);

    // la testa invisibile: non si vede ma copre quello che ci passa dietro (le stanghette).
    // le misure sono in proporzione alla larghezza della montatura (= 1)
    testaInvisibile = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 24),
        new THREE.MeshBasicMaterial({ colorWrite: false })
    );
    testaInvisibile.scale.set(0.44, 0.62, 0.62);
    testaInvisibile.position.set(0, -0.08, -0.68);
    testaInvisibile.renderOrder = -1;    // va disegnata per prima
    gruppo.add(testaInvisibile);

    fiocco = creaFiocco();
    gruppo.add(fiocco);
    const bottoneFiocco = el.querySelector('.prova-fiocco');
    bottoneFiocco.addEventListener('click', function() {
        fiocco.visible = !fiocco.visible;
        bottoneFiocco.classList.toggle('attivo', fiocco.visible);
        bottoneFiocco.setAttribute('aria-pressed', fiocco.visible);
        bottoneFiocco.textContent = fiocco.visible ? 'Togli il fiocco' : 'Metti il fiocco';
    });

    el.querySelector('.prova-chiudi').addEventListener('click', chiudiProva);
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape' || el.hidden) return;
        // con l'anteprima aperta, Esc chiude solo l'anteprima
        if (!finestra.foto.hidden) chiudiAnteprima();
        else chiudiProva();
    });
    finestra.misura.addEventListener('input', function() {
        misura = finestra.misura.value / 100;
    });
    window.addEventListener('resize', adattaMisure);
    finestra.video.addEventListener('loadedmetadata', adattaMisure);
}

// il video e la scena 3D hanno la stessa misura: la più grande che entra nella finestra
function adattaMisure() {
    if (!finestra || finestra.el.hidden) return;
    const video = finestra.video;
    if (!video.videoWidth) return;
    const w = finestra.area.clientWidth, h = finestra.area.clientHeight;
    const s = Math.min(w / video.videoWidth, h / video.videoHeight);
    const larghezza = Math.round(video.videoWidth * s), altezza = Math.round(video.videoHeight * s);
    finestra.specchio.style.width = larghezza + 'px';
    finestra.specchio.style.height = altezza + 'px';
    renderer.setSize(larghezza, altezza);
    camera.right = video.videoWidth / video.videoHeight;
    camera.updateProjectionMatrix();
}

function mostraStato(testo) {
    finestra.stato.textContent = testo || '';
    finestra.stato.hidden = !testo;
}

// ===== LA FOTO =====
// "Scatta una foto": conto alla rovescia, poi si uniscono in un'unica immagine il video
// (girato come nello specchio, cioè come ti vedi) e gli occhiali 3D.
// "Condividi su Instagram" usa il menu di condivisione del dispositivo: scegli Instagram,
// la foto si apre lì e viene pubblicata solo quando premi tu "Condividi".
// (un sito non può pubblicare da solo sul tuo profilo: Instagram non lo permette)
let richiestaFoto = false;   // la foto si compone subito dopo il disegno del fotogramma
let fotoBlob = null;
let fotoIndirizzo = null;
let timerConto = [];
let titoloProva = '';

function preparaFoto() {
    finestra.scatta.addEventListener('click', function() {
        if (timerConto.length) return;   // conto alla rovescia già partito
        [3, 2, 1].forEach(function(numero, i) {
            timerConto.push(setTimeout(function() {
                finestra.conto.textContent = numero;
                finestra.conto.hidden = false;
            }, i * 1000));
        });
        timerConto.push(setTimeout(function() {
            finestra.conto.hidden = true;
            timerConto = [];
            richiestaFoto = true;
        }, 3000));
    });

    finestra.foto.querySelector('.prova-rifai').addEventListener('click', chiudiAnteprima);
    finestra.foto.querySelector('.prova-scarica').addEventListener('click', scaricaFoto);
    finestra.foto.querySelector('.prova-condividi').addEventListener('click', condividiFoto);
}

function annullaConto() {
    timerConto.forEach(clearTimeout);
    timerConto = [];
    finestra.conto.hidden = true;
    richiestaFoto = false;
}

// unisce video e occhiali in una foto (chiamata subito dopo renderer.render, quando il disegno è pronto)
function componiFoto() {
    const video = finestra.video;
    const w = video.videoWidth, h = video.videoHeight;
    const tela = document.createElement('canvas');
    tela.width = w;
    tela.height = h;
    const ctx = tela.getContext('2d');
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);              // come nello specchio
    ctx.drawImage(video, 0, 0, w, h);
    ctx.drawImage(renderer.domElement, 0, 0, w, h);
    ctx.restore();

    // in basso a sinistra, il nome degli occhiali
    const testo = Math.round(h * 0.035);
    ctx.font = 'bold ' + testo + 'px Roboto, Helvetica, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = testo * 0.4;
    ctx.fillText(titoloProva, testo, h - testo);

    // il lampo del flash
    finestra.lampo.classList.remove('scatto');
    void finestra.lampo.offsetWidth;   // fa ripartire l'animazione
    finestra.lampo.classList.add('scatto');

    tela.toBlob(function(blob) {
        fotoBlob = blob;
        if (fotoIndirizzo) URL.revokeObjectURL(fotoIndirizzo);
        fotoIndirizzo = URL.createObjectURL(blob);
        finestra.fotoImmagine.src = fotoIndirizzo;
        finestra.fotoNota.textContent = possoCondividere()
            ? 'Scegli Instagram nel menu che si apre: la foto ti aspetta lì e viene pubblicata solo quando premi Condividi.'
            : 'Da questo dispositivo Instagram non riceve foto dai siti: la foto viene scaricata e si apre Instagram per caricarla.';
        finestra.foto.hidden = false;
    }, 'image/jpeg', 0.92);
}

function fileFoto() {
    return new File([fotoBlob], 'prova-occhiali.jpg', { type: 'image/jpeg' });
}

function possoCondividere() {
    try {
        return Boolean(navigator.canShare && navigator.canShare({ files: [new File([''], 'prova.jpg', { type: 'image/jpeg' })] }));
    } catch (e) {
        return false;
    }
}

function condividiFoto() {
    if (!fotoBlob) return;
    const file = fileFoto();
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: titoloProva }).catch(function(errore) {
            // "AbortError" = hai chiuso il menu senza scegliere: non è un problema
            if (errore.name !== 'AbortError') console.error('Condivisione:', errore);
        });
    } else {
        // sul computer: scarichiamo la foto e apriamo Instagram, dove la carichi tu con "Crea"
        scaricaFoto();
        window.open('https://www.instagram.com/', '_blank', 'noopener');
        finestra.fotoNota.textContent = 'La foto è stata scaricata: su Instagram premi "Crea" e scegli prova-occhiali.jpg. Verrà pubblicata solo quando premi Condividi.';
    }
}

function scaricaFoto() {
    if (!fotoIndirizzo) return;
    const link = document.createElement('a');
    link.href = fotoIndirizzo;
    link.download = 'prova-occhiali.jpg';
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function chiudiAnteprima() {
    finestra.foto.hidden = true;
}

// ===== IL RICONOSCIMENTO DEL VISO =====
function caricaRiconoscimento() {
    if (!riconoscimento) {
        riconoscimento = import(MEDIAPIPE + '/vision_bundle.mjs').then(async function(vision) {
            const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE + '/wasm');
            const opzioni = function(delegato) {
                return {
                    baseOptions: { modelAssetPath: MODELLO_VOLTO, delegate: delegato },
                    runningMode: 'VIDEO',
                    numFaces: 1,
                    outputFacialTransformationMatrixes: true
                };
            };
            // prima proviamo con la scheda grafica, se non va con il processore
            try {
                return await vision.FaceLandmarker.createFromOptions(fileset, opzioni('GPU'));
            } catch (e) {
                return await vision.FaceLandmarker.createFromOptions(fileset, opzioni('CPU'));
            }
        });
        riconoscimento.catch(function() {
            riconoscimento = null;   // al prossimo tentativo si riprova
        });
    }
    return riconoscimento;
}

// ===== GLI OCCHIALI =====
// mette il modello dentro dei gruppi così che: il centro del frontale sia nell'origine,
// le stanghette vadano verso -z (dietro) e la montatura sia larga 1
function preparaOcchiale(modello) {
    const daTogliere = [];
    const pezzi = [];
    modello.traverse(function(o) {
        if (o.isLine || o.isLineSegments || o.isPoints) daTogliere.push(o);
        else if (o.isMesh) pezzi.push(o);
    });
    daTogliere.forEach(function(o) {
        o.removeFromParent();
    });

    // le parti da colorare: una per ogni materiale del file. ogni materiale viene copiato,
    // così cambiare colore qui non cambia gli occhiali negli altri visori della pagina
    const parti = new Map();   // materiale originale → parte
    pezzi.forEach(function(m) {
        // la testa del modello non serve: la testa ora è la tua
        let o = m;
        while (o) {
            if (NON_SONO_OCCHIALI.test(o.name || '')) m.userData.fisso = true;
            o = o.parent;
        }
        if (m.userData.fisso) {
            m.visible = false;
            return;
        }

        const originale = m.material;
        if (!originale || Array.isArray(originale)) return;
        if (!parti.has(originale)) {
            const copia = originale.clone();
            // una lente è un materiale trasparente; quelle "di vetro" (trasmissione) sopra il video
            // verrebbero scure: le facciamo diventare semplicemente trasparenti
            const lente = originale.transmission > 0 || originale.transparent || originale.opacity < 1;
            if (lente) {
                copia.transmission = 0;
                copia.transparent = true;
                copia.opacity = originale.transmission > 0 ? 0.25 : Math.min(originale.opacity, 0.6);
                copia.depthWrite = false;
            }
            parti.set(originale, {
                materiale: copia,
                lente: lente,
                nomi: new Set(),
                base: {   // per tornare al colore originale
                    colore: copia.color ? copia.color.clone() : new THREE.Color(0xffffff),
                    metalness: copia.metalness,
                    roughness: copia.roughness,
                    opacity: copia.opacity
                },
                nomeMateriale: originale.name || ''
            });
        }
        const parte = parti.get(originale);
        m.material = parte.materiale;
        // le parti sono già riconosciute (frontale, aste, cerniere, lenti)
        parte.nomi.add(m.userData.parte || nomePezzo(m));
    });
    modello.updateMatrixWorld(true);

    const info = analizza(pezzi);
    modello.position.set(-info.centro.x, -info.yFrontale, -info.zFrontale);

    const orientamento = new THREE.Group();
    orientamento.add(modello);
    if (info.verso > 0) orientamento.rotation.y = Math.PI;   // le stanghette vanno dietro (-z)

    const grandezza = new THREE.Group();
    grandezza.add(orientamento);
    grandezza.scale.setScalar(1 / info.dimensioni.x);
    grandezza.position.y = -0.03;   // un filo più in basso del punto tra gli occhi

    // il nome di ogni parte: il nome del pezzo, se la parte è un pezzo solo con un nome,
    // altrimenti il nome del materiale, altrimenti "Parte 1", "Parte 2"...
    let numero = 0;
    const elenco = Array.from(parti.values()).map(function(parte) {
        numero++;
        const nomiPezzi = Array.from(parte.nomi).filter(Boolean);
        let nome = nomiPezzi.length === 1 ? nomiPezzi[0] : parte.nomeMateriale;
        nome = (nome || '').replace(/_/g, ' ').replace(/\s*\(\d+\)$/, '').trim();
        if (!nome) nome = parte.lente ? 'Lenti' : 'Parte ' + numero;
        parte.nome = nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
        return parte;
    });
    // nomi uguali (es. due materiali "Plastica"): aggiungiamo un numero
    elenco.forEach(function(parte) {
        const uguali = elenco.filter(function(p) { return p.nome === parte.nome; });
        if (uguali.length > 1) uguali.forEach(function(p, i) { p.nome = p.nome.replace(/ \d+$/, '') + ' ' + (i + 1); });
    });
    // prima le parti della montatura, poi le lenti
    elenco.sort(function(a, b) { return a.lente - b.lente; });

    return { gruppo: grandezza, parti: elenco };
}

// il nome del pezzo di una mesh (se è una faccia di un solido, il nome è quello del solido)
function nomePezzo(m) {
    let nome = m.name || '';
    if (m.parent && m.parent.name && nome.indexOf(m.parent.name) === 0) nome = m.parent.name;
    return nome.replace(/_\d+$/, '');
}

// ===== I COLORI DELLE PARTI =====
// gli stessi colori del pannello degli occhiali, più due metalli
const COLORI = [
    { nome: 'Nero',        colore: '#1e1e1e' },
    { nome: 'Tartaruga',   colore: '#6b4226' },
    { nome: 'Blu navy',    colore: '#1f3a5f' },
    { nome: 'Bordeaux',    colore: '#6d1a2b' },
    { nome: 'Rosso',       colore: '#c0392b' },
    { nome: 'Rosa',        colore: '#f4a6c6' },
    { nome: 'Verde salvia', colore: '#9caf88' },
    { nome: 'Panna',       colore: '#f3ecdc' },
    { nome: 'Oro',         colore: '#c9a646', metallo: true },
    { nome: 'Argento',     colore: '#c8c8c8', metallo: true }
];
// per le lenti: tinte trasparenti
const TINTE = [
    { nome: 'Trasparente', colore: '#ffffff', opacita: 0.15 },
    { nome: 'Fumé',        colore: '#2b2b2b', opacita: 0.6 },
    { nome: 'Marrone',     colore: '#6b4a2b', opacita: 0.55 },
    { nome: 'Verde',       colore: '#2f4f3a', opacita: 0.55 },
    { nome: 'Blu',         colore: '#2a4d8f', opacita: 0.5 },
    { nome: 'Rosa',        colore: '#e79bb8', opacita: 0.45 },
    { nome: 'Giallo',      colore: '#e8c547', opacita: 0.45 }
];

function applicaColore(parte, scelta) {
    const m = parte.materiale;
    if (!scelta) {
        // "Originale": come nel file
        m.color.copy(parte.base.colore);
        m.metalness = parte.base.metalness;
        m.roughness = parte.base.roughness;
        m.opacity = parte.base.opacity;
    } else {
        m.color.set(scelta.colore);
        if (parte.lente) {
            m.opacity = scelta.opacita;
        } else if (scelta.metallo) {
            m.metalness = 1;
            m.roughness = 0.25;
        } else {
            m.metalness = 0;
            m.roughness = 0.35;
        }
    }
    m.needsUpdate = true;
}

// il pannello dei colori: una riga di campioni per ogni parte
function mostraColori(parti) {
    const lista = finestra.colori.querySelector('.prova-colori-parti');
    lista.innerHTML = '';
    finestra.pannelloColori.hidden = parti.length === 0;
    finestra.bottoneColori.hidden = parti.length === 0;

    parti.forEach(function(parte) {
        const opzione = document.createElement('div');
        opzione.className = 'prova-colori-parte';
        opzione.innerHTML = '<h4 class="opzione-titolo"><span class="parte-nome"></span><span class="opzione-valore">Originale</span></h4><div class="campioni"></div>';
        opzione.querySelector('.parte-nome').textContent = parte.nome;
        const valore = opzione.querySelector('.opzione-valore');
        const fila = opzione.querySelector('.campioni');

        const scelte = [null].concat(parte.lente ? TINTE : COLORI);   // null = originale
        scelte.forEach(function(scelta) {
            const campione = document.createElement('button');
            campione.type = 'button';
            campione.className = 'campione' + (scelta ? '' : ' campione-originale selected');
            const nome = scelta ? scelta.nome : 'Originale';
            campione.setAttribute('aria-label', nome);
            campione.title = nome;
            if (scelta) {
                campione.style.backgroundColor = scelta.colore;
                if (parte.lente) campione.style.opacity = 0.35 + scelta.opacita;
            } else {
                campione.style.backgroundColor = '#' + parte.base.colore.getHexString();
            }
            campione.addEventListener('click', function() {
                fila.querySelectorAll('.campione').forEach(function(c) { c.classList.remove('selected'); });
                campione.classList.add('selected');
                valore.textContent = nome;
                applicaColore(parte, scelta);
            });
            fila.appendChild(campione);
        });
        lista.appendChild(opzione);
    });
}

// ===== APRIRE E CHIUDERE =====
// dati: {
//   titolo: il nome degli occhiali,
//   caricaModello: funzione che restituisce (promessa) il modello three.js,
//   colori: false per non mostrare il pannello dei colori generico (la pagina ne ha uno suo),
//   pronto: funzione chiamata con le parti degli occhiali (una per materiale) quando sono sul viso,
//   allaChiusura: funzione chiamata dopo l'uscita (es. per tornare al sito),
//   testoChiudi: il testo del bottone per uscire (di solito "Chiudi")
// }
let datiProva = {};
export function apriProva(dati) {
    if (!finestra) creaFinestra();
    const mio = ++tentativo;
    datiProva = dati;
    finestra.el.querySelector('.prova-chiudi').textContent = dati.testoChiudi || 'Chiudi';

    finestra.titolo.textContent = dati.titolo;
    titoloProva = dati.titolo;
    finestra.scatta.disabled = true;
    annullaConto();
    chiudiAnteprima();
    finestra.el.hidden = false;
    document.body.classList.add('prova-aperta');
    mostraStato('Accensione della fotocamera…');

    // via gli occhiali (e i colori) della prova precedente
    mostraColori([]);
    gruppo.children.slice().forEach(function(figlio) {
        if (figlio !== testaInvisibile && figlio !== fiocco) gruppo.remove(figlio);
    });
    gruppo.visible = false;
    visoTrovato = false;
    scala = 0;

    if (!window.isSecureContext || !navigator.mediaDevices) {
        mostraStato('La fotocamera funziona solo se la pagina è aperta da un server (http://localhost…) o in https.');
        return;
    }

    const fotocamera = flusso ? Promise.resolve(flusso) : navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
    });

    fotocamera.then(function(f) {
        if (mio !== tentativo) { if (!flusso) fermaFlusso(f); return; }
        flusso = f;
        finestra.video.srcObject = f;
        finestra.video.play();
        mostraStato('Caricamento del riconoscimento del viso e degli occhiali…');
        return Promise.all([caricaRiconoscimento(), dati.caricaModello()]);
    }).then(function(risultato) {
        if (!risultato || mio !== tentativo) return;
        const landmarker = risultato[0];
        const occhiale = preparaOcchiale(risultato[1]);
        gruppo.add(occhiale.gruppo);
        mostraColori(dati.colori === false ? [] : occhiale.parti);
        if (dati.pronto) dati.pronto(occhiale.parti);
        adattaMisure();
        mostraStato('Inquadra il tuo viso');
        avviaCiclo(landmarker);
        finestra.scatta.disabled = false;
    }).catch(function(errore) {
        if (mio !== tentativo) return;
        console.error('Prova su di te:', errore);
        if (errore && errore.name === 'NotAllowedError') {
            mostraStato('Non hai dato il permesso di usare la fotocamera. Puoi attivarlo dalle impostazioni del sito nel browser.');
        } else if (errore && errore.name === 'NotFoundError') {
            mostraStato('Non è stata trovata nessuna fotocamera.');
        } else {
            mostraStato('Non è stato possibile avviare la prova. Controlla la connessione e riprova.');
        }
    });
}

function fermaFlusso(f) {
    f.getTracks().forEach(function(traccia) {
        traccia.stop();
    });
}

export function chiudiProva() {
    if (!finestra) return;
    tentativo++;
    renderer.setAnimationLoop(null);
    annullaConto();
    chiudiAnteprima();
    finestra.scatta.disabled = true;
    finestra.el.hidden = true;
    document.body.classList.remove('prova-aperta');
    finestra.video.srcObject = null;
    if (flusso) {
        fermaFlusso(flusso);   // la fotocamera si spegne davvero (si spegne anche la lucina)
        flusso = null;
    }
    if (datiProva.allaChiusura) datiProva.allaChiusura();
}

// ===== OGNI FOTOGRAMMA =====
function avviaCiclo(landmarker) {
    const video = finestra.video;
    const matrice = new THREE.Matrix4();
    const scartoP = new THREE.Vector3(), scartoS = new THREE.Vector3();
    const rotazioneViso = new THREE.Quaternion();
    ultimoTempoVideo = -1;
    const orologio = new THREE.Clock();
    const posizionePrima = new THREE.Vector3();
    const velocita = new THREE.Vector3();
    let primoFotogramma = true;

    renderer.setAnimationLoop(function() {
        const dt = Math.min(orologio.getDelta(), 0.05);
        // analizziamo il video solo quando arriva un fotogramma nuovo
        if (video.readyState >= 2 && video.currentTime !== ultimoTempoVideo) {
            ultimoTempoVideo = video.currentTime;
            const r = landmarker.detectForVideo(video, performance.now());
            const punti = r.faceLandmarks && r.faceLandmarks[0];

            if (punti && r.facialTransformationMatrixes && r.facialTransformationMatrixes[0]) {
                const proporzione = video.videoWidth / video.videoHeight;
                // un punto del viso nelle misure della scena (MediaPipe misura y dall'alto)
                const punto = function(i) {
                    return new THREE.Vector3(punti[i].x * proporzione, 1 - punti[i].y, -punti[i].z * proporzione);
                };
                const ponte = punto(PONTE_NASO);
                ponte.z = 0;
                const distanzaOcchi = punto(OCCHIO_DESTRO).distanceTo(punto(OCCHIO_SINISTRO));
                const scalaViso = distanzaOcchi * PROPORZIONE * misura;

                // la rotazione della testa: dalla matrice che calcola MediaPipe
                matrice.fromArray(r.facialTransformationMatrixes[0].data);
                matrice.decompose(scartoP, rotazioneViso, scartoS);

                if (!visoTrovato || scala === 0) {
                    // appena trovato il viso: gli occhiali vanno subito al loro posto
                    posizione.copy(ponte);
                    rotazione.copy(rotazioneViso);
                    scala = scalaViso;
                } else {
                    posizione.lerp(ponte, MORBIDEZZA);
                    rotazione.slerp(rotazioneViso, MORBIDEZZA);
                    scala += (scalaViso - scala) * MORBIDEZZA;
                }
                if (!visoTrovato) mostraStato('');
                visoTrovato = true;
            } else {
                if (visoTrovato) mostraStato('Inquadra il tuo viso');
                visoTrovato = false;
            }
        }

        gruppo.visible = visoTrovato;
        gruppo.position.copy(posizione);
        gruppo.quaternion.copy(rotazione);
        gruppo.scale.setScalar(scala || 1);

        // la velocità della testa (in "altezze dello schermo" al secondo) fa ondeggiare il fiocco
        if (primoFotogramma || dt === 0) {
            velocita.set(0, 0, 0);
            primoFotogramma = false;
        } else {
            velocita.subVectors(posizione, posizionePrima).divideScalar(dt);
        }
        posizionePrima.copy(posizione);
        muoviFiocco(dt, velocita);

        renderer.render(scena, camera);
        // la foto va presa subito dopo il disegno, finché l'immagine 3D è ancora nel canvas
        if (richiestaFoto) {
            richiestaFoto = false;
            componiFoto();
        }
    });
}
