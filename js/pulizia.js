// pulizia.js – prepara il file 3D degli occhiali Morri
// toglie le linee del disegno (non sono superfici) e prepara le parti solide.
// un "pezzo" è un oggetto del file: il programma CAD salva ogni faccia di un solido
// come parte separata, che three.js mette in un gruppo; in quel caso il pezzo è il gruppo intero,
// così nell'esploso si stacca il solido e non le sue singole facce

import * as THREE from 'three';

// parti che non fanno parte degli occhiali (es. una testa di riferimento): restano ferme
const NON_SONO_OCCHIALI = /testa|head|viso/i;

export function pulisci(modello, associazioni) {
    const daTogliere = [];
    const pezzi = [];
    modello.traverse(function(figlio) {
        if (figlio.isLine || figlio.isLineSegments || figlio.isPoints) {
            daTogliere.push(figlio);
        } else if (figlio.isMesh) {
            figlio.castShadow = true;
            // i file CAD a volte hanno le facce girate: le mostriamo da tutti e due i lati
            const materiali = Array.isArray(figlio.material) ? figlio.material : [figlio.material];
            materiali.forEach(function(m) {
                if (!m.transmission) m.side = THREE.DoubleSide;
            });
            // il genitore è il gruppo delle facce di un solido? allora il pezzo è il gruppo
            const assGenitore = figlio.parent && associazioni.get(figlio.parent);
            const pezzo = (assGenitore && assGenitore.meshes !== undefined && assGenitore.primitives === undefined)
                ? figlio.parent : figlio;
            if (!pezzi.includes(pezzo)) pezzi.push(pezzo);
        }
    });
    daTogliere.forEach(function(o) {
        o.removeFromParent();
    });
    // la testa (o altro che non fa parte degli occhiali) resta ferma
    pezzi.forEach(function(pezzo) {
        let o = pezzo;
        while (o) {
            if (NON_SONO_OCCHIALI.test(o.name || '')) pezzo.userData.fisso = true;
            o = o.parent;
        }
    });
    modello.updateMatrixWorld(true);
    // via i pezzi rimasti vuoti (avevano solo linee, o parti tolte)
    return pezzi.filter(function(pezzo) {
        return pezzo.parent && !new THREE.Box3().setFromObject(pezzo).isEmpty();
    });
}
