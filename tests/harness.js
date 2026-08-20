/*
  Micro-harnais de test, sans dependance ni etape de build.

  On ouvre tests/index.html et tout s'execute. Le but n'est pas la couverture :
  c'est d'epingler ce qui a deja casse une fois, pour que ca ne recasse pas en
  silence.
*/
(function initializeHarness(global) {
  const suites = [];
  let suiteCourante = null;

  function suite(nom, corps) {
    suiteCourante = { nom, tests: [] };
    suites.push(suiteCourante);
    corps();
    suiteCourante = null;
  }

  function test(nom, corps) {
    if (!suiteCourante) {
      throw new Error(`test("${nom}") appele hors d'une suite`);
    }
    suiteCourante.tests.push({ nom, corps });
  }

  function formater(valeur) {
    if (typeof valeur === "string") return JSON.stringify(valeur);
    if (valeur instanceof Map) return `Map(${valeur.size})`;
    try {
      return JSON.stringify(valeur);
    } catch (error) {
      return String(valeur);
    }
  }

  const attendre = (valeur) => ({
    vaut(reference) {
      if (valeur !== reference) {
        throw new Error(`attendu ${formater(reference)}, obtenu ${formater(valeur)}`);
      }
    },
    equivaut(reference) {
      const a = JSON.stringify(valeur);
      const b = JSON.stringify(reference);
      if (a !== b) {
        throw new Error(`attendu ${b}, obtenu ${a}`);
      }
    },
    vrai() {
      if (valeur !== true) {
        throw new Error(`attendu true, obtenu ${formater(valeur)}`);
      }
    },
    faux() {
      if (valeur !== false) {
        throw new Error(`attendu false, obtenu ${formater(valeur)}`);
      }
    },
    contient(morceau) {
      if (!String(valeur).includes(morceau)) {
        throw new Error(`${formater(valeur)} ne contient pas ${formater(morceau)}`);
      }
    },
    neContientPas(morceau) {
      if (String(valeur).includes(morceau)) {
        throw new Error(`${formater(valeur)} contient ${formater(morceau)} alors qu'il ne devrait pas`);
      }
    },
    estUneFonction() {
      if (typeof valeur !== "function") {
        throw new Error(`attendu une fonction, obtenu ${typeof valeur}`);
      }
    },
  });

  async function executer(rendre) {
    let reussis = 0;
    const echecs = [];

    for (const s of suites) {
      for (const t of s.tests) {
        try {
          await t.corps();
          reussis += 1;
          rendre({ type: "ok", suite: s.nom, nom: t.nom });
        } catch (error) {
          echecs.push({ suite: s.nom, nom: t.nom, message: error.message });
          rendre({ type: "ko", suite: s.nom, nom: t.nom, message: error.message });
        }
      }
    }

    return { reussis, echecs, total: reussis + echecs.length };
  }

  global.Harnais = { suite, test, attendre, executer };
})(window);
