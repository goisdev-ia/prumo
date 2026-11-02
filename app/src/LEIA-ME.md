# Prumo · instalação e atualização

App pessoal de controle da vida (Finanças, Fitness, Alimentação, Tarefas, Metas e Rotinas) em
Google Apps Script + Google Sheets (banco) + Google Drive (arquivos).

- Planilha: `1j2P-erYooziZF-7b8pMUAlvFO6bBlukgmJqIuSANW3I`
- Pasta de uploads: `1XGLH_e6TDg8RANZdVaOOPDJgfS4f32QV`
- Projeto Apps Script: `1eH3JGTb2MCTnUe6kx34WynQQ-I3PJ7Fq6nE0pshG_W5KN-dUNDE7K8_t`

Todos os IDs ficam só em `Config.gs`.

## Opção A — instalador (recomendado, não precisa colar 40 arquivos)

1. Ative a **Apps Script API** em https://script.google.com/home/usersettings (uma vez).
2. Abra o projeto no editor. Em Configurações do projeto, marque **"Mostrar o arquivo de manifesto appsscript.json"**.
3. Substitua o conteúdo de `appsscript.json` pelo do pacote e salve.
4. Crie um arquivo de script chamado `Installer` e cole o conteúdo de `Installer.gs`. Salve.
5. Envie o arquivo `prumo-app-1.0.0.zip` para qualquer pasta do seu Drive (sem descompactar).
6. No editor, escolha a função `instalarDoZip` e clique em **Executar**. Autorize quando pedir.
7. Recarregue o editor (F5): todos os arquivos aparecem.

Para atualizar no futuro: envie o zip novo para o Drive e rode `instalarDoZip` de novo.

## Opção B — manual

Crie no editor um arquivo para cada item do pacote com **o mesmo nome** (sem extensão):
`.gs` → "Script", `.html` → "HTML". Cole o conteúdo. Comece por `Config`.
Substitua o `appsscript.json` (passo 2 e 3 acima).

## Depois de instalar (as duas opções)

1. Selecione a função `setup` e clique em **Executar**. Ela é idempotente: cria/ajusta as abas,
   formata as colunas, cria as subpastas no Drive, carrega categorias, 86 exercícios,
   115 alimentos (TACO aprox.), modelos de rotina e instala os gatilhos.
   Se passar de 6 minutos (planilhas muito lentas), rode de novo: ela continua de onde parou.
2. Serviços avançados **Drive API (v3)** e **Sheets API (v4)** já vêm ligados pelo manifesto.
   Se o editor reclamar, adicione-os em "Serviços" (+).
3. **Implantar › Nova implantação › App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Somente eu**
   Copie a URL `/exec`. Para testar mudanças sem reimplantar use **Implantar › Testar implantações** (URL `/dev`).
4. Abra a URL no celular e use "Adicionar à tela inicial".
5. Quer explorar antes de lançar seus dados? Configurações › Dados › **Carregar dados de exemplo**
   (remove tudo depois com um toque — só apaga o que é de exemplo).

### Atualizar a versão publicada
Depois de mudar o código: **Implantar › Gerenciar implantações › editar (lápis) › Versão: Nova versão › Implantar**.
A URL `/exec` continua a mesma.

### Abrir para outra conta Google
Mude "Quem pode acessar" para "Qualquer pessoa com Conta do Google" e "Executar como" para
"Usuário que acessa o app". Todos os dados já são separados por `user_id` (e-mail).
Nesse modo cada pessoa autoriza o app e precisa ter acesso de edição à planilha e à pasta.

## Funções úteis no editor
| Função | O que faz |
|---|---|
| `setup()` | Instala/atualiza schema, pastas, dados de referência e gatilhos |
| `seedDemo()` / `clearDemoData()` | Carrega / remove dados de demonstração |
| `setupTriggers()` | Reinstala os gatilhos |
| `backupNow()` | Cópia da planilha em `backups` (mantém as 8 últimas) |
| `Calc.selfTest()` | Testes das fórmulas (TMB, 1RM, IMC, fatura, metas) |

## Gatilhos instalados
- **07h diário**: gera lançamentos recorrentes, fecha faturas, cria notificações e envia o resumo do dia por e-mail.
- **A cada 15 min**: lembretes de tarefas com horário.
- **Domingo 03h**: backup da planilha, limpeza de `ocr_tmp` e retenção de logs.

## Arquitetura em uma tela
- Uma única entrada no servidor: `api(rota, payload)` e `apiBatch([...])`, com whitelist de rotas,
  envelope `{ok, data, error:{code,message,field}, meta:{ms}}`, log e auditoria.
- `Db` genérico sobre Sheets: valida pelo `SCHEMA` (tipos, enums, obrigatórios), preenche colunas de sistema,
  grava em lote, exclusão lógica, auditoria antes/depois e cache versionado (CacheService fragmentado).
- Carga inicial numa chamada (lê todas as abas de uma vez pelo serviço Sheets) e o app funciona
  "local-first": telas calculam na hora e as gravações são otimistas, com rollback e "Desfazer".
- Rotas de domínio para o que envolve vários registros: parcelas em faturas, pagamento de fatura,
  reconciliação, aportes em reservas, recorrências, importação, sessão de treino com PR, meta calórica.
