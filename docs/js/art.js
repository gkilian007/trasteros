import { getLang } from './i18n.js';
// Arte del juego: personajes (retratos con 8 caras) e iconos 3D (Fluent Emoji, MIT).
// Módulo puro: lo usan el motor (Node) y la interfaz.

export const FACES = ['poker', 'feliz', 'codicia', 'nervios', 'sorpresa', 'picaro', 'triste', 'enfado'];
export const FACE_LABEL = {
  poker: 'Póker',
  feliz: 'Feliz',
  codicia: '¡Lo quiero!',
  nervios: 'Nervios',
  sorpresa: 'Sorpresa',
  picaro: 'Pícaro',
  triste: 'Triste',
  enfado: 'Enfado',
};

// Personajes que pueden elegir los jugadores
export const PLAYER_LOOKS = ['ana', 'barbas', 'marta', 'rizos', 'gamer', 'lola', 'pelirroja', 'chandal', 'punk', 'abuelo', 'vaquero'];
export const LOOK_LABEL = {
  ana: 'La del moño',
  barbas: 'El barbas',
  marta: 'La de las mechas',
  rizos: 'El del afro',
  gamer: 'El de la cinta',
  lola: 'La señora',
  pelirroja: 'La mecánica',
  chandal: 'El del chándal',
  punk: 'La punk',
  abuelo: 'El abuelo',
  vaquero: 'El vaquero',
  martillo: 'Don Martillo',
  tiburon: 'El Tiburón',
  urraca: 'La Urraca',
  tortuga: 'La Tortuga',
  pulpo: 'El Pulpo',
};

// Emoji → archivo del icono 3D (código de puntos en hexadecimal)
export const ICONS = {
  '📱': '1f4f1',
  '⚓': '2693',
  '🧭': '1f9ed',
  '🔭': '1f52d',
  '⛵': '26f5',
  '🏺': '1f3fa',
  '🦪': '1f9aa',
  '🗺️': '1f5fa-fe0f',
  '🤿': '1f93f',
  '🛵': '1f6f5',
  '💻': '1f4bb',
  '🎹': '1f3b9',
  '🎧': '1f3a7',
  '🐟': '1f41f',
  '🛃': '1f6c3',
  '🚢': '1f6a2',
  '🛡️': '1f6e1-fe0f',
  '📞': '1f4de',
  '🤩': '1f929',
  '⏱️': '23f1-fe0f',
  '💍': '1f48d',
  '🏍️': '1f3cd-fe0f',
  '🎸': '1f3b8',
  '🪙': '1fa99',
  '🕹️': '1f579-fe0f',
  '🎻': '1f3bb',
  '🏆': '1f3c6',
  '⌚': '231a',
  '📀': '1f4c0',
  '🗿': '1f5ff',
  '🚲': '1f6b2',
  '📺': '1f4fa',
  '🎮': '1f3ae',
  '📷': '1f4f7',
  '🪑': '1fa91',
  '🧳': '1f9f3',
  '🛹': '1f6f9',
  '📚': '1f4da',
  '🎾': '1f3be',
  '🧸': '1f9f8',
  '🍳': '1f373',
  '🧰': '1f9f0',
  '🧦': '1f9e6',
  '🪣': '1faa3',
  '📦': '1f4e6',
  '🥫': '1f96b',
  '🧯': '1f9ef',
  '🪴': '1fab4',
  '🗞️': '1f5de-fe0f',
  '🔌': '1f50c',
  '☣️': '2623-fe0f',
  '🐀': '1f400',
  '📜': '1f4dc',
  '🐛': '1f41b',
  '🔐': '1f510',
  '🖼️': '1f5bc-fe0f',
  '🎟️': '1f39f-fe0f',
  '💎': '1f48e',
  '👍': '1f44d',
  '🎲': '1f3b2',
  '😐': '1f610',
  '☠️': '2620-fe0f',
  '🔨': '1f528',
  '🤝': '1f91d',
  '⭐': '2b50',
  '🚪': '1f6aa',
  '🔑': '1f511',
  '👁️': '1f441-fe0f',
  '🔊': '1f50a',
  '🔇': '1f507',
  '🔥': '1f525',
  '💰': '1f4b0',
  '😇': '1f607',
  '🤷': '1f937',
  '🤐': '1f910',
  '🙈': '1f648',
  '💶': '1f4b6',
  '💵': '1f4b5',
  '🏁': '1f3c1',
  '🏠': '1f3e0',
  '🎉': '1f389',
};

export const iconUrl = (emoji) => (ICONS[emoji] ? `assets/icons/${ICONS[emoji]}.webp` : null);
export const faceUrl = (look, face = 'poker') => `assets/faces/${look || 'ana'}-${FACES.includes(face) ? face : 'poker'}.webp`;

// animación de cada objeto (vídeo de Higgsfield recortado) y medio cuerpo del ganador
export const animUrl = (itemId) => `assets/anim/${itemId}.webp`;
export const winnerUrl = (look) => `assets/winners/${look || 'ana'}.webp`;
export const loserUrl = (look) => `assets/losers/${look || 'ana'}.webp`;
// subastador de medio cuerpo con el mazo (una imagen por cara) y de pie con los brazos cruzados (presentación)
export const auctUrl = (look, face = 'poker') => `assets/auct/${look || 'martillo'}-${FACES.includes(face) ? face : 'poker'}.webp`;
export const lineupUrl = (look) => `assets/lineup/${look || 'ana'}.webp`;

// lo que dice cada personaje al llevarse un trastero, a su estilo
export const WIN_LINES = {
  ana: ['¡Toma ya! ¡Esto es mío!', '¡Lo sabía, lo sabía, lo sabía!', '¡A casa que me lo llevo!'],
  barbas: ['¡Ja, ja! ¡Para el barbas!', 'Esto va directo a mi taller.', 'Nadie puede con el barbas.'],
  marta: ['¡Ay, qué maravilla! ¡Es mío!', 'Esto queda divino en mi salón.', 'Gracias, gracias, sois un amor.'],
  rizos: ['¡Bingo! Mis cálculos no fallan.', 'Estadísticamente, era mío.', '¡Ciencia, amigos, ciencia!'],
  gamer: ['¡GG! ¡Victoria!', '¡Combo perfecto!', '¡Nivel desbloqueado!'],
  lola: ['¡Ay, hijos, que me lo quedo yo!', 'A mi edad ya no se me escapa nada.', 'Esto me lo llevo para el pueblo.'],
  pelirroja: ['Esto lo arreglo yo en un pispás.', '¡Motor en marcha!', 'Con una llave inglesa, como nuevo.'],
  chandal: ['¡Vamos, vamos, vamos!', '¡Qué pasa, chavales! ¡Pa mí!', 'Esto es de barrio y es mío.'],
  punk: ['¡Ja! ¡Os he reventado!', '¡Rock and roll, nenes!', 'Mío y punto.'],
  abuelo: ['En mis tiempos esto valía el doble.', '¡Ea! Para el nieto.', 'La experiencia, chaval, la experiencia.'],
  vaquero: ['¡Yiiija! ¡Es mío, forastero!', 'Este trastero tiene nuevo sheriff.', 'Desenfundé más rápido que vosotros.'],
  tiburon: ['Los negocios son los negocios.', 'El tiburón siempre come.', 'Gracias por calentarme el precio.'],
  urraca: ['¡Ooh, brillante! Para mi nido.', 'Todo lo que brilla, para mí.', '¡Qué cosas tan bonitas!'],
  tortuga: ['Despacito y con buena letra.', 'Sin prisa, pero sin pausa.', 'Lento, pero me lo llevo.'],
  pulpo: ['¡Ocho brazos y todos llenos!', 'En mi puerto mando yo.', 'Esto se viene conmigo al muelle.'],
};
// lo mismo en inglés (mismo orden: la voz de cada frase va por su número)
export const WIN_LINES_EN = {
  ana: ["Oh yeah! That's mine!", 'I knew it, I knew it, I knew it!', "Bagging it and taking it home!"],
  barbas: ['Ha! Big Beard takes it!', 'Straight to my workshop.', 'Nobody beats the Beard.'],
  marta: ['Oh, how marvelous! Mine.', 'This will look divine in my living room.', "Thank you, thank you, you're all darlings."],
  rizos: ['Bingo! My math never fails.', 'Statistically, it was mine.', 'Science, friends, science!'],
  gamer: ['Good game! Victory!', 'Perfect combo!', 'Level unlocked!'],
  lola: ["Oh, sweeties, I'm keeping this one!", 'At my age, nothing gets past me.', "This one's going back to the farm."],
  pelirroja: ["I'll fix this up in a jiffy.", "Engine's running!", "One wrench and it's good as new."],
  chandal: ["Let's go, let's go, let's go!", "What's up, guys! Mine!", "Straight from the block, and it's mine."],
  punk: ['Ha! I crushed you!', 'Rock and roll, babies!', 'Mine. End of story.'],
  abuelo: ['Back in my day, this was worth double.', 'There we go! For the grandkid.', 'Experience, kiddo. Experience.'],
  vaquero: ["Yeehaw! It's mine, stranger!", "There's a new sheriff in this storage unit.", "I drew faster than all y'all."],
  tiburon: ['Business is business.', 'The shark always eats.', 'Thanks for warming up the price.'],
  urraca: ['Ooh, shiny! For my nest.', 'Everything that glitters is mine.', 'Such pretty things!'],
  tortuga: ['Slow and steady.', 'No rush, but no rest.', "Slow, but it's mine."],
  pulpo: ['Eight arms, and every one of them full!', 'My port, my rules.', "This one's coming to the dock with me."],
};
// lo que dice el subastador con la persiana bajada, como un vendedor que quiere colocar el trastero
export const SALES_LINES = {
  ana: ['¡Mirad qué trastero! ¡Aquí dentro huele a chollazo!', '¡Os lo juro, este trastero tiene pinta de tesoro escondido!', '¡Venga, gente, que este trastero viene cargadito de sorpresas!'],
  barbas: ['Atención, chavales: este trastero tiene más chicha que mi moto.', 'Lo que hay ahí dentro no lo veis ni en una concentración motera.', 'Este trastero es como yo: grande, duro y lleno de sorpresas.'],
  marta: ['¡Hola, amores! Hoy os traigo un trastero que es una auténtica joya.', 'Este trastero tiene un encanto vintage que os va a enamorar.', 'Confiad en mí: es lo más bonito que vais a ver hoy.'],
  rizos: ['Según mis cálculos, este trastero vale una barbaridad.', 'Hipótesis: aquí dentro hay un tesoro. Vamos a comprobarlo.', 'He analizado la puerta y los resultados son prometedores.'],
  gamer: ['¡Chat, mirad esto! ¡Trastero legendario a la vista!', 'Este trastero tiene pinta de botín épico, os lo digo yo.', '¡Nueva partida! Y este trastero viene con premio, fijo.'],
  lola: ['Ay, criaturas, en este trastero hay más arte que en la feria de abril.', 'Hacedme caso, que yo de trastos sé un rato.', 'Este trastero viene con solera, como yo.'],
  pelirroja: ['Este trastero está a punto, con el motor bien caliente.', 'Garantía de mecánica: aquí dentro hay piezas de primera.', 'Yo no vendo chatarra. Este trastero va como un tiro.'],
  chandal: ['Mira, chaval, este trastero es lo más top del barrio.', 'Aquí dentro hay cosas que no ves ni en el Rastro, te lo digo yo.', 'Este trastero viene fino, fino. Palabra.'],
  punk: ['Este trastero es pura caña. Lo de dentro os va a flipar.', 'Ni preguntéis: este trastero tiene más actitud que vosotros.', 'Aquí dentro hay tesoros salvajes. Avisados estáis.'],
  abuelo: ['Hijos míos, trasteros como este ya no se hacen.', 'He visto muchos trasteros, y este tiene muy buena pinta.', 'Aquí dentro hay cosas de las de antes, de calidad.'],
  vaquero: ['Forasteros, este trastero es el mejor botín de todo el Oeste.', 'En este pueblo no hay trastero con más oro que este.', 'Agarraos los sombreros: lo que hay aquí dentro es de leyenda.'],
  martillo: ['¡Señoras y señores, atención! Este trastero puede cambiarles la vida.', 'Bienvenidos a la subasta del día. Lo que hay tras esta puerta vale oro.', '¡Trastero sellado, sin abrir, directo de una herencia misteriosa!', 'No se dejen engañar por la puerta: dentro hay auténticas joyas.'],
};
export const SALES_LINES_EN = {
  ana: ['Look at this unit! It smells like a total steal in here!', 'I swear, this unit looks like hidden treasure!', 'Come on, people, this unit is loaded with surprises!'],
  barbas: ["Listen up, folks: this unit's got more muscle than my bike.", "What's in there, you won't even see at a biker rally.", 'This unit is like me: big, tough, and full of surprises.'],
  marta: ['Hi, darlings! Today I bring you a unit that is an absolute gem.', "This unit has a vintage charm you'll fall in love with.", "Trust me: it's the prettiest thing you'll see today."],
  rizos: ['According to my calculations, this unit is worth a fortune.', "Hypothesis: there's treasure in here. Let's test it.", "I've analyzed the door, and the results are promising."],
  gamer: ['Chat, look at this! Legendary unit incoming!', 'This unit has epic loot written all over it, trust me.', 'New round! And this unit drops a prize for sure.'],
  lola: ["Oh, sugar, there's more treasure in this unit than at a county fair.", 'Listen to me, darlings, I know my junk.', 'This unit has real vintage class, just like me.'],
  pelirroja: ["This unit's tuned up and ready to roll.", "Mechanic's guarantee: there are top-notch parts in here.", "I don't sell scrap. This unit runs like a dream."],
  chandal: ['Listen up, this unit is the best thing on the block.', "There's stuff in here you won't find at any flea market, I'm telling you.", 'This unit is fresh, real fresh. My word.'],
  punk: ["This unit totally rocks. What's inside is gonna blow your minds.", "Don't even ask: this unit's got more attitude than all of you.", "There's wild treasure in here. You've been warned."],
  abuelo: ["Kids, they don't make storage units like this anymore.", "I've seen a lot of units, and this one looks mighty fine.", 'In here are things from the old days. Real quality.'],
  vaquero: ["Strangers, this unit's the finest loot in the whole West.", "There ain't a unit in this town with more gold than this one.", "Hold on to your hats: what's in here is the stuff of legend."],
  martillo: ['Ladies and gentlemen, attention! This unit could change your life.', "Welcome to the auction of the day. What's behind this door is worth gold.", 'A sealed unit, never opened, straight from a mysterious estate!', "Don't let the door fool you: there are real gems inside."],
};
// lo que grita el subastador cuando se acaba el tiempo, para que pujen un poco más
export const PUSH_LINES = {
  ana: ['¡Venga, que se escapa! ¡Un poquito más!', '¿Nadie más? ¡No me lo puedo creer!', '¡Que se acaba! ¡Pujad, pujad!'],
  barbas: ['¿Eso es todo? ¡Vamos, echadle valor!', '¡Que se lo llevan por cuatro duros!', '¡Un empujón más, que el barbas mira!'],
  marta: ['¡Ay, no lo dejéis escapar, que es precioso!', '¿Solo eso? ¡Si vale muchísimo más!', '¡Un poquito más, amores, un poquito más!'],
  rizos: ['Estadísticamente, aún podéis pujar más.', '¡Error de cálculo! ¡Esto vale el doble!', 'Se acaba el tiempo. Haced números.'],
  gamer: ['¡Que se acaba el tiempo! ¡Pulsad ya!', '¿En serio? ¡Eso es precio de novato!', '¡Última oportunidad! ¡Subid la puja!'],
  lola: ['¡Ay, que se os escapa!', '¿Eso pujáis? ¡Si eso no da ni para churros!', '¡Venga, que se me enfría el café!'],
  pelirroja: ['¡Venga, meted quinta y pujad!', '¿Solo eso? ¡Si no cubre ni la mano de obra!', '¡Se acaba el tiempo! ¡Acelerad!'],
  chandal: ['¡Venga, que no se diga, subid!', '¿Eso es todo, colegas? ¡Venga ya!', '¡Venga, que se va, que se va!'],
  punk: ['¿Eso es todo? ¡Qué muermos sois!', '¡Venga, más caña, más caña!', '¡Que se acaba, gallinas! ¡Pujad!'],
  abuelo: ['¡Venga, que se me hace tarde!', '¿Eso nada más? ¡Qué poca alegría!', 'Un poquito más, que es para una buena causa.'],
  vaquero: ['¿Eso es todo, vaqueros? ¡Desenfundad la cartera!', 'Se acaba el tiempo, forasteros. Última ronda.', '¡Más rápido, que se pone el sol!'],
  martillo: ['¿Quién da más? ¡Que se nos escapa!', '¡Es una ganga, señores! ¿Nadie sube?', 'Última oportunidad antes de bajar el martillo.', '¡Vamos, vamos, que esto vale mucho más!'],
};
export const PUSH_LINES_EN = {
  ana: ["Come on, it's getting away! Just a little more!", "Nobody else? I can't believe it!", "Time's almost up! Bid, bid!"],
  barbas: ["That's it? Come on, show some guts!", "It's going for pocket change!", 'One more push, the Beard is watching!'],
  marta: ["Oh, don't let it get away, it's gorgeous!", "Only that? It's worth so much more!", 'A little more, darlings, just a little more!'],
  rizos: ['Statistically, you can still bid more.', 'Calculation error! This is worth double!', "Time's running out. Do the math."],
  gamer: ["Timer's running out! Smash that button!", "Seriously? That's a rookie price!", 'Last chance! Raise that bid!'],
  lola: ["Oh, it's slipping away, sweetheart!", "That's your bid? That won't even buy a donut!", "Hurry up, my coffee's getting cold!"],
  pelirroja: ['Come on, shift into gear and raise it!', "That's it? That doesn't even cover labor!", "Time's almost up! Hit the gas!"],
  chandal: ["Come on, don't be cheap, go higher!", "That's it, guys? Come on!", "Come on, it's going, it's going!"],
  punk: ["That's it? You're so lame!", 'Come on, crank it up!', "Time's almost up, chickens! Bid!"],
  abuelo: ["Come on, at my age I don't have all day.", "Is that all? Where's the gusto?", "A little more, it's for a good cause."],
  vaquero: ['Is that all, partners? Draw those wallets!', "Time's running out, strangers. Last call.", "Faster, y'all, the sun is setting!"],
  martillo: ["Who'll give me more? It's slipping away!", "It's a bargain, folks! Anyone going higher?", 'Last chance before the hammer comes down.', 'Come on, come on, this is worth much more!'],
};
// frase de venta o de empujón que toca (la misma en todos los móviles para la misma jugada)
const hashIdx = (seed, n) => {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
};
export const salesIdx = (look, seed) => hashIdx(seed, (SALES_LINES[look] || SALES_LINES.martillo).length);
// Lo que dice el subastador cuando pasa la famosa (truco «Famoso»)
export const STAR_LINES = {
  ana: '¡Hala! ¡Si es famosa de verdad!',
  barbas: '¡Madre mía! ¡Una estrella de cine!',
  marta: '¡Ay, qué fuerte! ¡Es ella, es ella!',
  rizos: 'Dato curioso: acaba de pasar una estrella.',
  gamer: '¡Buah, chaval! ¡Una famosa en directo!',
  lola: '¡Uy, uy, uy! ¡Mira quién pasa por aquí!',
  pelirroja: '¡Frena, frena! ¡Que pasa una estrella!',
  chandal: '¡Ojo, colegas! ¡Una famosa de la tele!',
  punk: '¡Toma ya! ¡Una estrella de cine!',
  abuelo: '¡Caramba! ¡Como las de las películas!',
  vaquero: '¡Por mis botas! ¡Una estrella de cine!',
  martillo: '¡Pero bueno! ¡Una estrella en mi subasta!',
};
export const STAR_LINES_EN = {
  ana: "No way! She's actually famous!",
  barbas: 'Holy smokes! A real movie star!',
  marta: "Oh my gosh! It's her, it's her!",
  rizos: 'Fun fact: a movie star just walked by.',
  gamer: 'Whoa, dude! A celebrity, live!',
  lola: 'Well, well, well! Look who is walking by!',
  pelirroja: 'Hit the brakes! A star is passing by!',
  chandal: 'Heads up, guys! A celebrity from TV!',
  punk: 'Oh yeah! A real movie star!',
  abuelo: 'Goodness me! Just like in the movies!',
  vaquero: 'By my boots! A movie star!',
  martillo: 'Well, I never! A star at my auction!',
};
export function starLine(look) {
  const set = getLang() === 'en' ? STAR_LINES_EN : STAR_LINES;
  return set[look] || set.martillo;
}
export const pushIdx = (look, seed) => hashIdx(seed, (PUSH_LINES[look] || PUSH_LINES.martillo).length);
export function salesLine(look, i) {
  const set = getLang() === 'en' ? SALES_LINES_EN : SALES_LINES;
  const lines = set[look] || set.martillo;
  return lines[i % lines.length];
}
export function pushLine(look, i) {
  const set = getLang() === 'en' ? PUSH_LINES_EN : PUSH_LINES;
  const lines = set[look] || set.martillo;
  return lines[i % lines.length];
}
// qué frase toca (siempre la misma para la misma jugada, en todos los móviles)
export function winLineIdx(look, seed) {
  const lines = WIN_LINES[look] || WIN_LINES.ana;
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % lines.length;
}
export function winLine(look, seed) {
  const set = getLang() === 'en' ? WIN_LINES_EN : WIN_LINES;
  const lines = set[look] || set.ana;
  return lines[winLineIdx(look, seed)];
}
