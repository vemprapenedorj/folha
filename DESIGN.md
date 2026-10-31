---
version: alpha
name: Escala Hotel Titanic
description: Proposta visual para o app interno de escala semanal, baseada nas cores do site do Hotel Titanic.
colors:
  primary: "#023441"
  primary-hover: "#034B5C"
  accent: "#BC934B"
  background: "#F5F6F4"
  surface: "#FFFFFF"
  text: "#18313A"
  muted: "#596C71"
  border: "#D7DFDF"
  off-bg: "#CFE7D2"
  off-text: "#255A39"
  vacation-bg: "#F6DCAB"
  vacation-text: "#80551D"
  medical-bg: "#F3CBC2"
  medical-text: "#8C392C"
  draft-bg: "#EDF0F0"
typography:
  headline-md: { fontFamily: Georgia, fontSize: 28px, fontWeight: 600, lineHeight: 1.2 }
  headline-sm: { fontFamily: Georgia, fontSize: 21px, fontWeight: 600, lineHeight: 1.25 }
  body-md: { fontFamily: Arial, fontSize: 15px, fontWeight: 400, lineHeight: 1.5 }
  body-sm: { fontFamily: Arial, fontSize: 13px, fontWeight: 400, lineHeight: 1.4 }
  label-md: { fontFamily: Arial, fontSize: 13px, fontWeight: 600, lineHeight: 1.35 }
rounded: { sm: 4px, md: 8px, lg: 12px }
spacing: { xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px }
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 12px
  schedule-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    padding: 8px
  schedule-header:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    padding: 12px
---

# Escala Hotel Titanic

## Overview

Proposta para uma ferramenta de trabalho clara e compacta. A escala deve ser o elemento principal da tela. As cores do hotel dão identidade ao cabeçalho e às ações; a grade permanece leve para facilitar a leitura e a exportação.

Referência: https://hoteltitanic.com.br/ (consultado em 31/10/2026). No site, o cabeçalho usa `#023441`, áreas de destaque usam `#BC934B` e o texto claro aparece em `#F2F2F2`. As fontes identificadas no site são Quincy CF e Sukhumvit. Esta proposta usa fontes comuns como substitutas até haver arquivos de fonte autorizados para o app.

## Colors

- `primary` é o azul petróleo do hotel; usar no topo, no botão de publicar e em títulos de destaque.
- `accent` é o dourado do site; usar com moderação em detalhes e na semana selecionada.
- `background` e `surface` mantêm a tabela legível.
- Folga, férias e atestado têm fundos suaves e texto próprio. O rótulo escrito sempre acompanha a cor.
- Os nomes e dias da semana aparecem em caixa alta; horários e situações usam corpo maior, com situações em negrito.
- O PDF e a imagem devem preservar boa leitura também em impressão e em telas pequenas.

## Typography

- Títulos podem usar serifada para lembrar o site do hotel.
- Nomes, datas, horários, botões e células usam fonte sem serifa por legibilidade.
- A tabela deve aceitar ampliação do navegador sem cortar o conteúdo.

## Layout

- Faixa superior: título da escala, semana atual, calendário e navegação entre semanas.
- O período selecionado aparece em uma caixa dourada com número e ano da semana ISO; o botão da semana atual mostra seu número.
- Os controles "Escolhe uma data" e "Escolhe uma semana" têm rótulos acima dos respectivos campos.
- Ações do responsável: salvar, publicar, copiar link, exportar PDF e exportar PNG.
- Centro: grade com funcionários nas linhas e os sete dias nas colunas.
- Em telas estreitas, permitir rolagem horizontal da grade e manter a coluna de nomes visível quando possível.
- A visualização pública mostra a mesma informação semanal com menos controles.

## Elevation & Depth

- Preferir bordas finas e superfícies planas. Reservar sombra discreta apenas para menus e diálogo de edição.

## Shapes

- Cantos levemente arredondados em botões e menus. A grade usa linhas retas para preservar a leitura de tabela.

## Components

- Célula de escala: horário ou situação por extenso; vazia quando ainda não definida no rascunho.
- Seletor de célula: lista curta de horários padrão, folga, férias e atestado/licença médica.
- Calendário: escolher uma data abre a semana de segunda a domingo que contém essa data.
- Indicador de publicação: mostrar claramente rascunho ou publicada e a data da última atualização.

## Do's and Don'ts

- Manter texto e contraste suficientes; não depender só das cores para comunicar uma situação.
- Não colocar fotografia ou elementos decorativos dentro da escala e dos arquivos exportados.
- Não reproduzir o layout do site institucional; adaptar sua identidade para uma ferramenta de uso diário.
