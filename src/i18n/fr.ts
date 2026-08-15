import type { Translations } from './en';

const fr: Translations = {
  home: {
    title: 'I Played With',
    tagline: "Trouvez les liens entre coéquipiers",
    chooseSportPrompt: 'Choisissez un sport',
    sports: {
      rugby: 'Rugby',
      football: 'Football',
    },
  },
  common: {
    loading: 'Chargement…',
    loadError: 'Une erreur est survenue lors du chargement des données. Veuillez réessayer.',
  },
  setup: {
    title: 'Choisissez vos joueurs',
    playerA: 'Joueur A',
    playerB: 'Joueur B',
    inputPlaceholder: 'Rechercher un joueur…',
    randomize: 'Aléatoire',
    change: 'Changer',
    orSeparator: '— ou —',
    difficulty: 'Difficulté',
    easy: 'Facile',
    easyDesc: 'Joueur uniquement',
    hard: 'Difficile',
    hardDesc: 'Joueur + Club + Saison',
    launch: 'Lancer la partie',
    directlyConnectedWarning: 'Ces deux joueurs ont déjà joué ensemble. En mode Facile, ce lien est auto-résolu — choisissez une autre paire.',
    emptyState: 'Aucun joueur disponible pour ce sport pour le moment — revenez bientôt.',
  },
  game: {
    chrono: 'Temps',
    easyPlaceholder: 'Choisir un joueur…',
    submit: 'Valider',
    playerPlaceholder: 'Joueur…',
    clubPlaceholder: 'Club…',
    seasonPlaceholder: '2022-2023',
    seasonFormatError: 'Format attendu : AAAA-AAAA (ex : 2022-2023)',
    closeError: 'Fermer',
    clubSearchPlaceholder: 'Rechercher un club…',
    noSuggestions: 'Aucun résultat',
    addPlayer: 'Joueur',
    addClub: 'Club',
  },
  victory: {
    heading: 'Félicitations !',
    moves: 'Coups',
    time: 'Temps',
    playAgain: 'Rejouer',
  },
};

export default fr;
