import type { Translations } from './en';

const fr: Translations = {
  home: {
    title: 'I Played With',
    tagline: "J'ai joué avec — Édition Rugby",
    launchGame: 'Lancer une partie',
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
  },
  victory: {
    heading: 'Félicitations !',
    moves: 'Coups',
    time: 'Temps',
    playAgain: 'Rejouer',
  },
};

export default fr;
