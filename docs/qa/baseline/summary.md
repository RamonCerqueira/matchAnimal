# MatchAnimal browser smoke — baseline

Browser: 136.0.7103.93. Authentication: authenticated. Moderator: true.

Screenshots and JSON report contain no stored credentials or cookies. Socket traffic was blocked and automatic writes were prevented; messaging and mutations were not validated.

| Route | HTTP | Viewports | Overflows | Errors | HTTP failures | Entity data |
| --- | --- | --- | --- | --- | --- | --- |
| / | 500 | 8 | none | 3 | 1 | available / not required |
| /entrar | 500 | 8 | none | 3 | 1 | available / not required |
| /cadastro | 500 | 8 | none | 3 | 1 | available / not required |
| /recuperar-senha | 500 | 8 | none | 3 | 1 | available / not required |
| /dashboard | 500 | 8 | none | 3 | 1 | available / not required |
| /explorar | 500 | 8 | none | 3 | 1 | available / not required |
| /animais | 500 | 8 | none | 3 | 1 | available / not required |
| /animais/novo | 500 | 8 | none | 3 | 1 | available / not required |
| /matches | 500 | 8 | none | 3 | 1 | available / not required |
| /mensagens | 500 | 8 | none | 3 | 1 | available / not required |
| /comunidade | 500 | 8 | none | 3 | 1 | available / not required |
| /comunidade/explorar | 500 | 8 | none | 3 | 1 | available / not required |
| /comunidade/publicacao | 500 | 8 | none | 3 | 1 | no existing entity |
| /grupos | 500 | 8 | none | 3 | 1 | available / not required |
| /grupos/detalhe | 500 | 8 | none | 3 | 1 | no existing entity |
| /eventos | 500 | 8 | none | 3 | 1 | available / not required |
| /adocoes | 500 | 8 | none | 3 | 1 | available / not required |
| /notificacoes | 500 | 8 | none | 3 | 1 | available / not required |
| /configuracoes | 500 | 8 | none | 3 | 1 | available / not required |
| /administracao | 500 | 8 | none | 3 | 1 | available / not required |
| /pet/perfil | 500 | 8 | none | 3 | 1 | no existing entity |
| /termos | 500 | 8 | none | 3 | 1 | available / not required |
| /privacidade | 500 | 8 | none | 3 | 1 | available / not required |
| /seguranca | 500 | 8 | none | 3 | 1 | available / not required |

Prevented automatic writes: 0. Screenshots: 18.

This is navigation/layout coverage, not an approval of unexecuted flows.
