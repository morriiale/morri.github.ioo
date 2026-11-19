// pagina-prova.js – la pagina "Provali su di te" di Morri (collegato a prova.html)
//
// - i colori arrivano dall'indirizzo (prova.html?montatura=…&lenti=…&cerniere=…),
//   cioè da quello che hai scelto nello shop della pagina principale
// - la prova con la fotocamera è quella di prova.js; il pannello dei colori è quello di Morri:
//   ogni scelta cambia subito gli occhiali sul tuo viso
// - "Aggiungi alla borsa" usa la stessa borsa della pagina principale (salvata nel browser)

import {
    caricaModelloMorri, applicaScelta, creaCampioni, opzione, prezzo, euro,
    sceltaDallIndirizzo, indirizzoProva, leggiBorsa, salvaBorsa
} from './morri-modello.js';
import { apriProva } from './prova.js';

const scelta = sceltaDallIndirizzo();
let materialiProva = null;   // le copie dei materiali usate sul tuo viso (le crea prova.js)

// ===== IL PANNELLO =====
const pannello = document.querySelector('.p-pannello');

document.querySelectorAll('.m-scelta').forEach(function(blocco) {
    const gruppo = blocco.dataset.gruppo;
    creaCampioni(blocco.querySelector('.m-campioni'), gruppo, scelta, function(id) {
        scelta[gruppo] = id;
        aggiorna();
    });
});

function aggiorna() {
    document.querySelectorAll('.m-scelta').forEach(function(blocco) {
        const gruppo = blocco.dataset.gruppo;
        blocco.querySelector('.m-scelta-valore').textContent = opzione(gruppo, scelta[gruppo]).nome;
    });
    const p = euro(prezzo(scelta));
    document.getElementById('prova-prezzo').textContent = p;
    document.getElementById('prezzo-maniglia').textContent = p;
    if (materialiProva) colora();
    // l'indirizzo segue la configurazione: ricaricando o condividendo il link, i colori restano
    history.replaceState(null, '', indirizzoProva(scelta));
}

// i colori sugli occhiali che hai addosso
function colora() {
    applicaScelta(materialiProva, scelta);
    // sopra il video le lenti un po' più chiare, così si vedono gli occhi
    if (materialiProva.lenti) materialiProva.lenti.opacity *= 0.8;
}

// sul telefono il pannello si apre e si chiude toccando la "maniglia"
const maniglia = pannello.querySelector('.p-pannello-maniglia');
maniglia.addEventListener('click', function() {
    const chiuso = pannello.classList.toggle('chiuso');
    maniglia.setAttribute('aria-expanded', !chiuso);
});

// ===== LA BORSA =====
function contaBorsa() {
    document.getElementById('prova-borsa-numero').textContent = leggiBorsa().length;
}

const bottoneAggiungi = document.getElementById('prova-aggiungi');
bottoneAggiungi.addEventListener('click', function() {
    const borsa = leggiBorsa();
    borsa.push(Object.assign({}, scelta));
    salvaBorsa(borsa);
    contaBorsa();
    const testo = bottoneAggiungi.querySelector('span');
    testo.textContent = 'Aggiunto';
    bottoneAggiungi.classList.add('aggiunto');
    setTimeout(function() {
        testo.textContent = 'Aggiungi alla borsa';
        bottoneAggiungi.classList.remove('aggiunto');
    }, 1200);
});

// ===== LA PROVA =====
function esci() {
    // torna alla pagina da cui sei arrivato (se è Morri), altrimenti alla pagina principale
    var da = document.referrer ? new URL(document.referrer) : null;
    if (da && da.origin === location.origin && /(\/|\/index\.html)$/.test(da.pathname) && history.length > 1) {
        history.back();
    } else {
        window.location.href = 'index.html';
    }
}

function avviaProva() {
    document.body.classList.add('in-prova');
    apriProva({
        titolo: 'Morri',
        colori: false,            // il pannello dei colori è quello di Morri
        testoChiudi: 'Esci',
        caricaModello: function() {
            return caricaModelloMorri(null, scelta).then(function(r) { return r.modello; });
        },
        pronto: function(parti) {
            // le parti si chiamano come i pezzi: Frontale, Aste, Cerniere, Lenti
            materialiProva = {};
            parti.forEach(function(parte) {
                materialiProva[parte.nome.toLowerCase()] = parte.materiale;
            });
            colora();
        },
        allaChiusura: esci
    });
    // il pannello va dentro la finestra della prova, accanto allo specchio
    // (prima del conto alla rovescia e dell'anteprima della foto, che così gli passano sopra)
    const area = document.querySelector('.prova-area');
    if (area && pannello.parentNode !== area) area.insertBefore(pannello, area.querySelector('.prova-conto'));
    pannello.hidden = false;
}

document.getElementById('accendi').addEventListener('click', avviaProva);

aggiorna();
contaBorsa();
