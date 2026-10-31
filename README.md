# Escala semanal · Hotel Titanic

App web para preparar, publicar e compartilhar a escala planejada do hotel. A grade usa os funcionários e horários identificados nas imagens de referência. Nenhuma escala histórica foi preenchida automaticamente.

## Abrir no Windows

Dê dois cliques em **`Iniciar Escala.cmd`** na pasta do projeto. O navegador abrirá o endereço correto. A janela do servidor mostrará a senha do responsável na primeira execução; mantenha essa janela aberta enquanto usar o app.

O iniciador reutiliza a versão atual do servidor quando ela já está aberta. Se encontrar uma versão antiga desta escala na porta 3000, encerra somente essa instância e inicia a nova. O servidor acompanha alterações futuras automaticamente.

Não abra `public/index.html` diretamente: ele é apenas a interface e precisa do servidor para carregar e salvar a escala.

## Executar pelo terminal

Requer Node.js 24 ou mais recente. Na pasta do projeto:

```powershell
npm start
```

Abra `http://localhost:3000`. Na primeira execução, a senha do responsável aparece no terminal e fica guardada em `.data/admin-password.txt`. É possível definir `ADMIN_PASSWORD` no ambiente antes de iniciar o app. Os dados ficam em `.data/schedule.json`.

## Uso

1. Entre com a senha do responsável.
2. Escolha uma data no calendário; a escala abre a semana de segunda a domingo correspondente.
   Você também pode escolher diretamente o número e o ano da semana nos campos **Escolhe uma semana**.
3. Selecione horários, folga, férias ou atestado para cada pessoa e dia.
   Use **Copiar de outra semana** para escolher uma semana de origem. Você pode preencher somente os dias vazios da semana exibida ou substituir toda a escala dela. A cópia também funciona quando a semana de destino já tem marcações; se ela já estiver publicada, o link mostrará a atualização.
4. Salve e publique a semana. Correções posteriores atualizam a mesma semana publicada.
5. Copie o link de visualização ou baixe a imagem PNG. A opção PDF abre a impressão do navegador, onde é possível salvar como PDF.

O link público segue o formato `/?week=AAAA-MM-DD`, usando a segunda-feira da semana. Ele mostra somente semanas publicadas, sem senha e sem controles de edição.

Para trocar a senha do responsável, use **Alterar senha** na tela de login ou na área de edição. Informe a senha atual, uma nova senha de **6 a 12 caracteres contendo apenas letras e números**, e confirme. Após a troca, entre novamente com a senha nova. Senhas já cadastradas continuam válidas até serem alteradas.
Se o servidor usar a variável `ADMIN_PASSWORD`, a senha deve ser alterada nessa configuração.

## Disponibilização online

O projeto está preparado para ser publicado na Vercel a partir do GitHub. No ambiente online, as escalas e o hash da senha ficam em um banco Supabase; a pasta `.data/` continua sendo usada apenas na execução local e está fora do Git.

Para ativar a versão online, crie as funções `escala_load` e `escala_save` e o armazenamento protegido no Supabase, depois configure estas variáveis na Vercel: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `ESCALA_STORE_SECRET`. O segredo deve ter 32 bytes aleatórios e ser igual ao cadastrado no banco. Nunca coloque o segredo, a senha ou a pasta `.data/` no repositório. A senha online pode ser alterada pelo próprio app após a ativação.

O link público `/?week=AAAA-MM-DD` mostra somente semanas publicadas. A ligação do repositório à Vercel ativa as publicações automáticas a cada envio para a branch `main`.

## Verificação

```powershell
npm run check
npm test
```
