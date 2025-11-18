# Conectando o backend ao Supabase

Estas instruções usam o banco já criado no projeto `gestao-pessoal` do Supabase e a senha fornecida `Felipegestao-pesoal`.

## 1. Configurar variáveis de ambiente
1. Copie o arquivo de exemplo: `cp .env.example .env`.
2. Abra o novo `.env` e confirme os valores:
   - `PORT=3333` (ou outra porta que preferir).
   - `DATABASE_URL=postgresql://postgres:Felipegestao-pesoal@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=10`
     - Esta URL usa o **Connection pooler** (porta 6543). É a melhor opção para o servidor Node.js em produção porque usa o PgBouncer.
     - Se o seu projeto estiver em outra região, troque apenas o host (`aws-0-sa-east-1.pooler.supabase.com`) pelo indicado pelo Supabase.
   - `DIRECT_URL=postgresql://postgres:Felipegestao-pesoal@db.<seu-projeto>.supabase.co:5432/postgres?sslmode=require`
     - Esta URL vem da aba **Direct connection**. Ela é usada somente nas migrações do Prisma, pois o PgBouncer não permite algumas operações DDL.
   - Ajuste as flags `PRISMA_LOG_WARNINGS` e `PRISMA_LOG_QUERIES` se quiser controlar os logs.
3. Salve o arquivo `.env` (o Git ignora esse arquivo para evitar expor senhas públicas). O loader interno já remove aspas ao aplicar as variáveis, então você pode manter o valor entre `"..."` para facilitar a cópia.

## 2. Instalar dependências e gerar o cliente Prisma
```bash
npm install
npx prisma generate
```

## 3. Aplicar o schema no Supabase
Use o migrador do Prisma apontando para o Supabase. Com o `DIRECT_URL` configurado, o Prisma já entende que as migrações devem usar a conexão direta:
```bash
npx prisma migrate deploy
```
Isso cria/atualiza as tabelas `User`, `Transaction`, `Event` e `NotificationLog` no banco hospedado via `DIRECT_URL`, enquanto o cliente gerado continua apontando para `DATABASE_URL` (o pooler).

Se precisar recriar o schema do zero em desenvolvimento local, use `npx prisma migrate dev` (esse comando exige que o banco aceite criação de schema; no Supabase de produção prefira `deploy`).

## 4. Validar a conexão
Execute um script rápido para testar a conexão antes de subir o servidor:
```bash
node -e "require('./db/client').connectPrisma().then(() => console.log('Conectado ao Supabase')).catch(err => console.error(err)).finally(() => require('./db/client').disconnectPrisma())"
```
Você deve ver `Conectado ao Supabase` no terminal. Qualquer erro de SSL, host ou senha aparecerá nessa etapa.

## 5. Subir o servidor
Com a conexão confirmada, rode:
```bash
npm run start
```
O servidor inicializa, cria o usuário administrador padrão (se não existir) e continua operando sobre o banco Supabase.

## 6. Dicas adicionais
- Para ambientes como Render/Railway/Vercel, defina **duas** variáveis: `DATABASE_URL` (pooler) e `DIRECT_URL` (conexão direta). No Supabase, ambas usam o mesmo usuário/senha.
- Se quiser rodar tudo apenas com a conexão direta (porta 5432), basta usar o mesmo valor em `DATABASE_URL` e `DIRECT_URL`.
- Guarde a senha `Felipegestao-pesoal` somente no `.env` local ou nos secrets das plataformas; o arquivo não vai mais para o repositório.
