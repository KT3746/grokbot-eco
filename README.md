# ECO

Explore uma caverna quase no escuro. Seu único sentido é o **eco**: um PING revela paredes, cristais, buracos e a saída por um instante - depois a escuridão volta. Ande pela memória.

**Jogar:** https://kt3746.github.io/grokbot-eco/

## Como jogar

1. Pressione **Jogar**.
2. Use **PING** (toque na tela, botão PING ou **Espaço**) para eco-localizar.
3. Memorize o traçado ciano das paredes.
4. Colete **cristais ✦** (pontuação) e evite **buracos** vermelhos.
5. Alcance o **brilho quente** da saída. A saída fica sempre disponível; a pontuação são os cristais.

## Controles

| Ação | Teclado | Toque |
|------|---------|-------|
| Mover | WASD / setas | D-pad |
| Ping (eco) | Espaço / clique | Toque / botão PING |
| Pausar | Esc | Botão ❚❚ |
| Mudo | - | 🔊 |

Interface **somente em português (PT-BR)**.

## Onda 7

- **SAÍDA REVELADA!** quando o eco alcança a saída pela 1ª vez
- **Eco do cristal**: pegar ✦ reforça a memória ao redor
- **PING pronto**: o botão pulsa quando o cooldown acaba
- **Sem batida!**: vitória sem bater na parede ganha selo no placar

## Onda 8

- **Fase 4 (Núcleo) agora dá para terminar**: a saída e um cristal estavam fechados por paredes desde o lançamento; o mapa foi aberto e `node tools/checa-fases.mjs` confere todas as fases
- **Queda não zera a fase**: com cristal pego, **Voltar ao último cristal** mantém cristais e tempo (o placar mostra as quedas)
- **Celular em pé enxerga a caverna**: a câmera mostra ~8 casas de largura (antes ~4) e um **eco de entrada** grátis mostra os arredores ao começar e ao voltar
- **Você nunca some atrás da parede**: silhueta clara aparece quando uma parede tampa o personagem
- **HUD numa linha só** até em telas de 320 px; na última fase o botão vira **Jogar de novo (fase 1)**

Cache `?v=202611122300`.

## Técnico

Site estático na raiz do repositório (GitHub Pages). Vanilla JS + **Three.js** (ES modules, vendor local) + Web Audio API. Sem build, sem npm.

```
index.html          (importmap → three)
css/style.css
js/vendor/three.module.js
js/render3d.js      (cena low-poly / FogExp2 / ping light)
js/audio.js  levels.js  input.js  ui.js  game.js  main.js
.nojekyll
```

Visuais 3D: paredes/chão extrudados do mapa de tiles, atmosfera escura com névoa, PING como PointLight expansivo, cristais e saída emissivos. Câmera top-down inclinada (~38°). Gameplay (colisão, D-pad cardinal, SPEED) permanece em espaço de tiles.

Mobile: `pixelRatio` limitado, antialias off, sem sombras, poucos draw calls (InstancedMesh). Respeita `prefers-reduced-motion`.

## Licença

Jogo original. Feito para o hub Grok Bot.
