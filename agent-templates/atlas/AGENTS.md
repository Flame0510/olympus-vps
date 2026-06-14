# AGENTS.md — Protocolli Operativi Atlas

## Skill condivise referenziate

Atlas applica le seguenti skill globali senza duplicarne le regole:

| Skill | Quando leggerla |
|---|---|
| `~/.openclaw/shared-skills/trello-protocol/SKILL.md` | Prima di ogni operazione Trello (card, spostamento, commento) |
| `~/.openclaw/shared-skills/code-review/SKILL.md` | Durante self-review del codice PRIMA del commit |
| `~/.openclaw/shared-skills/agent-memory-system/SKILL.md` | A inizio turno e a fine task |
| `~/.openclaw/shared-skills/frontend-architecture/SKILL.md` | Prima di feature architetturali significative |

Le regole Trello NON vanno duplicate qui. La skill trello-protocol è la fonte di verità unica.

## Flusso sviluppo standard

```
1. Ricevi task tecnico
2. Leggi MEMORY.md + daily log
3. Leggi skill pertinente se necessario
4. Analizza codice esistente
5. Implementa
6. Self-review (usa code-review skill)
7. Build + test (`npm run build`, `npm test`)
8. Commit con messaggio descrittivo
9. Sposta card in In Review + commenta SHA
10. Aggiorna MEMORY.md + L1 audit stamp
```

## Regole operative

### Regola 1 — Self-review obbligatoria
Prima di ogni commit, self-review del codice. Leggere la shared skill `code-review` per la checklist.

### Regola 2 — Git hygiene
- `git config user.email "micheletornello5@gmail.com"` su ogni clone
- Commit atomici con messaggio strutturato
- Prefisso commenti Trello: `🌐 Atlas:`

### Regola 3 — Build sempre
`npm run build` DEVE passare prima di qualsiasi commit. Se fallisce, fixare prima.

### Regola 4 — Trello su ogni task
Ogni task ha una card. Ciclo: Backlog → In Progress → In Review → Done.
Vedi trello-protocol per dettagli.

### Regola 5 — Notifica
Al completamento task, notificare Michele via Telegram (`accountId: "atlas"`, target `297086793`).

## Policy modelli

| Contesto | Modello |
|---|---|
| Interattivo / chat | `fast` (Claude Sonnet) |
| Feature complesse, refactoring | `openai-codex/gpt-5.3-codex` |
| Fix semplici, task meccanici | `github-copilot/gemini-3-flash-preview` |
| Architettura / ragionamento | `openrouter/deepseek/deepseek-r1-0528` |
| Cron automatici | `openrouter/deepseek/deepseek-v3.2` |

## Template commit
```
tipo(scope): descrizione breve

- Dettaglio modifica 1
- Dettaglio modifica 2

Closes: #card_id
```

## Integrazione con altri agenti
- **Argus** — riceve task da Argus, notifica completamento
- **Prometheus** — possibile richiesta di feature per clienti
- **Forge** — (futuro) coordinamento su feature inter-team
