# Conectando o backend ao Supabase

Estas instruções usam o banco já criado no projeto `gestao-pessoal` do Supabase e a senha fornecida `Felipegestao-pesoal`.

## 1. Configurar variáveis de ambiente
1. Copie o arquivo de exemplo: `cp .env.example .env`.
2. Abra o novo `.env` e confirme os valores:
   - `PORT=3333` (ou outra porta que preferir).
   - `DATABASE_URL=postgresql://postgres:Felipegestao-pesoal@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=10`
     - Caso o Supabase mostre um host diferente na aba **Connect → Direct connection**, substitua apenas a parte `aws-0-sa-east-1.pooler.supabase.com` pelo host exibido ali.
   - Ajuste as flags `PRISMA_LOG_WARNINGS` e `PRISMA_LOG_QUERIES` se quiser controlar os logs.
3. Salve o arquivo `.env` (o Git agora ignora esse arquivo para evitar expor senhas públicas).

## 2. Instalar dependências e gerar o cliente Prisma
```bash
npm install
npx prisma generate
```

## 3. Aplicar o schema no Supabase
Use o migrador do Prisma apontando para o Supabase:
```bash
npx prisma migrate deploy
```
Isso cria/atualiza as tabelas `User`, `Transaction`, `Event` e `NotificationLog` no banco hospedado.

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
- Para ambientes como Render/Railway/Vercel, defina a variável `DATABASE_URL` no painel do serviço usando o mesmo valor do Supabase.
- Se quiser usar a porta direta (5432) em vez do pooler (6543), atualize a string para o host `db.<seu-projeto>.supabase.co:5432` e adicione `?sslmode=require` ao final.
- Guarde a senha `Felipegestao-pesoal` somente no `.env` local ou nos secrets das plataformas; o arquivo não vai mais para o repositório.
