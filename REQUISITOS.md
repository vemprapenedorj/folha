# Escala semanal planejada — requisitos iniciais

## Objetivo

Criar um app web simples para montar e compartilhar a escala semanal planejada. Os horários são previstos; o app não registra entrada ou saída real.

## Pessoas e acesso

- Uma pessoa responsável cadastra funcionários, prepara e edita as escalas e publica cada semana.
- Quem recebe o link compartilhável acessa a escala publicada somente para visualização, sem senha.
- Diego e Diogo são funcionários diferentes.
- O responsável pode alterar a senha de acesso informando a senha atual e confirmando a nova. Novas senhas têm de 6 a 12 caracteres, apenas letras e números.

## Organização da escala

- Cada escala cobre uma semana de segunda-feira a domingo.
- Um calendário permite escolher uma data; o app abre a semana correspondente.
- Também é possível escolher o número e o ano da semana conforme o calendário ISO (segunda-feira a domingo).
- O responsável pode avançar ou voltar uma semana e identificar qual semana está em edição.
- Para cada funcionário e dia, é possível selecionar um horário padrão ou marcar folga, férias ou atestado/licença médica.
- Uma célula ainda não preenchida permanece sem definição no rascunho.
- O responsável pode escolher qualquer semana com marcações para copiar para a semana exibida. Pode preencher apenas dias vazios ou substituir toda a escala, inclusive quando a semana de destino já tem marcações ou está publicada.
- Horários que terminam no dia seguinte, como 19h00–07h00, devem ser aceitos.

## Publicação e compartilhamento

- O responsável prepara a semana como rascunho e a publica quando estiver pronta.
- Uma semana publicada pode ser corrigida; o link de visualização mostra a versão atualizada.
- A semana pode ser exportada em PDF ou PNG para envio pelo WhatsApp. Após uma correção, o responsável pode gerar um novo arquivo.
- Semanas anteriores permanecem disponíveis para consulta.

## Dados identificados nas imagens de referência

- Funcionários: Diego, Rafael, Mauri, Gerson, Bruno, Denin, Ysa, Amanda, Val e Diogo.
- Horários observados: 06h30–14h30; 07h00–15h20; 09h00–17h00; 10h00–18h00; 11h00–19h00; 14h00–22h20; 19h00–07h00.
- Situações observadas: folga, férias e licença médica.
- As imagens da semana de 14 a 20 de setembro de 2026 mostram correções na escala da mesma semana.

## Fora do escopo inicial

- Registro de ponto real ou cálculo de horas trabalhadas.
- Os detalhes visuais ficam em `DESIGN.md` e podem ser ajustados antes da implementação da interface.

## Skills para as próximas etapas

- `brainstorming`: fechar regras e decisões de produto.
- `app-builder`: estruturar o app web.
- `database-design`: modelar funcionários, semanas, horários e marcações diárias.
- `frontend-architecture`: organizar a edição, calendário e visualização pública.
- `design-spec` e `frontend-design`: definir o visual quando essa etapa começar.
