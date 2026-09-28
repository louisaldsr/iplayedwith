import type { Translations } from './en'

const fr: Translations = {
  home: {
    title: 'I Played With',
    tagline: 'Trouvez les liens entre coéquipiers',
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
  daily: {
    title: 'Défi du jour',
    intro: 'Reliez ces deux joueurs par leurs coéquipiers. La même paire pour tout le monde, une nouvelle chaque jour.',
    versus: 'contre',
    bestPossible: 'Meilleur possible',
    links: 'liens',
    start: 'Commencer',
    freePlayLink: 'Ou choisissez vos joueurs en partie libre',
    freePlay: 'Partie libre',
    yourChain: 'Votre chaîne',
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
    directlyConnectedWarning:
      'Ces deux joueurs ont déjà joué ensemble. En mode Facile, ce lien est auto-résolu — choisissez une autre paire.',
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
    searchUnavailable: 'Recherche indisponible — réessayez',
    addPlayer: 'Joueur',
    addClub: 'Club',
  },
  fame: {
    floors: {
      famous: 'Célèbre',
      known: 'Connu',
      unsung: 'Méconnu',
    },
  },
  victory: {
    heading: 'Félicitations !',
    moves: 'Coups',
    time: 'Temps',
    playAgain: 'Rejouer',
  },
}

export default fr
