# Prumo · app instalável

Casca PWA do [Prumo](https://goisdev-ia.github.io/prumo/): abre o Web App do Apps Script em tela cheia, permite instalar no celular e recebe notificações push.

- `config.js` — URL do Web App (`/exec`)
- `sw.js` — service worker (cache da casca, push e clique na notificação)
- `manifest.webmanifest` — nome, ícones e atalhos

Nenhum dado pessoal fica aqui: os dados ficam na planilha do dono, acessados pelo Apps Script.
