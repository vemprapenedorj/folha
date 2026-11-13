# Escala semanal · Hotel Titanic

App web para preparar, publicar e compartilhar as escalas planejadas de Camareiras e Recepção/Geral.

## Abrir no Windows

Dê dois cliques em **`Iniciar Escala.cmd`** na pasta do projeto. O navegador abrirá o endereço correto. Na primeira execução, consulte as senhas em `.data/admin-password.txt`; mantenha a janela do servidor aberta enquanto usar o app.

O iniciador reutiliza a versão atual do servidor quando ela já está aberta. Se encontrar uma versão antiga desta escala na porta 3000, encerra somente essa instância e inicia a nova. O servidor acompanha alterações futuras automaticamente.

Não abra `public/index.html` diretamente: ele é apenas a interface e precisa do servidor para carregar e salvar a escala.

## Executar pelo terminal

Requer Node.js 24 ou mais recente. Na pasta do projeto:

```powershell
npm start
```

Abra `http://localhost:3000`. Na primeira execução, o servidor gera senhas para os dois setores em `.data/admin-password.txt` e `.data/passwords.json`. É possível definir `ADMIN_PASSWORD` no ambiente antes de iniciar o app; nesse caso, a mesma senha vale para os dois setores. Os dados ficam em `.data/schedule.json`.

## Uso

1. Escolha o setor e entre com a senha correspondente.
2. Escolha uma data no calendário; a escala abre a semana de segunda a domingo correspondente.
   Você também pode escolher diretamente o número e o ano da semana nos campos **Escolhe uma semana**.
3. Selecione horários, folga, férias, falta, atestado ou troca de folga para cada pessoa e dia. Em **Cores dos destaques**, ajuste a cor de fundo de folga, falta, atestado e troca de folga para o setor inteiro. A cor também aparece no link público, no PDF e no PNG.
   Use **Copiar de outra semana** para escolher uma semana de origem. Você pode preencher somente os dias vazios da semana exibida ou substituir toda a escala dela. A cópia também funciona quando a semana de destino já tem marcações; se ela já estiver publicada, o link mostrará a atualização.
4. Salve e publique a semana. Correções posteriores atualizam a mesma semana publicada.
5. Copie o link de visualização ou baixe a imagem PNG. A opção PDF abre a impressão do navegador, onde é possível salvar como PDF.

O link público segue o formato `/?dept=camareiras&week=AAAA-MM-DD` ou `/?dept=geral&week=AAAA-MM-DD`, usando a segunda-feira da semana. Ele mostra somente semanas publicadas, sem senha e sem controles de edição.

Para trocar a senha de um setor, use **Alterar senha** na tela de login ou na área de edição. Informe a senha atual, uma nova senha de **6 a 12 caracteres contendo apenas letras e números**, e confirme. Após a troca, entre novamente com a senha nova. A senha do outro setor permanece válida.
Se o servidor usar a variável `ADMIN_PASSWORD`, a senha deve ser alterada nessa configuração.

## Versão online

O projeto `folhaht` está publicado em [folhaht.vercel.app](https://folhaht.vercel.app/), conectado à branch `main` de [vemprapenedorj/folha](https://github.com/vemprapenedorj/folha). Cada envio para essa branch gera uma nova publicação na Vercel. O endereço anterior continua funcionando para links já compartilhados.

As quatro semanas que existiam localmente em 31/10/2026 foram copiadas para o projeto Supabase `folha-hotel-titanic`. A semana de 09/11/2026 estava publicada; as demais continuam como rascunho. A partir da migração, a versão local e a online guardam seus dados separadamente. Edite a versão online para que o link público reflita as alterações.

Na Vercel, as variáveis `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `ESCALA_STORE_SECRET` estão configuradas para produção e prévias. O banco protege os dados com RLS e uma chave privada acessada somente pelo servidor. A pasta `.data/`, a senha e o segredo não estão no Git. A senha online pode ser alterada pelo próprio app.

O link público mostra somente semanas publicadas. Por exemplo, [semana da Recepção de 09/11/2026](https://folhaht.vercel.app/?dept=geral&week=2026-11-09).

## Verificação

```powershell
npm run check
npm test
```
