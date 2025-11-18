# Conectando o backend ao Supabase

Estas instruções usam o banco já criado no projeto `gestao-pessoal` do Supabase e a senha fornecida `Felipegestao-pesoal`.

## 1. Configurar variáveis de ambiente
1. Copie o arquivo de exemplo: `cp .env.example .env`.
2. Abra o novo `.env` e confirme os valores:
   - `PORT=3333`
   - `DATABASE_URL=postgresql://postgres:Felipegestao-pesoal@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=10`
     - Esta URL usa o **Connection pooler** (porta 6543). É ideal para produção e suporta mais conexões.
     - Caso seu Supabase mostre outro host, substitua apenas o domínio.
   - `DIRECT_URL=postgresql://postgres:Felipegestao-pesoal@db.<seu-projeto>.supabase.co:5432/postgres?sslmode=require`
     - Esta URL é usada para migrações do Prisma (porta 5432).
   - Ajuste se desejar:
     - `PRISMA_LOG_WARNINGS=true`
     - `PRISMA_LOG_QUERIES=false`

3. Salve o arquivo `.env`. O Git ignora esse arquivo para não expor sua senha.

---

## 2. Instalar dependências e gerar o cliente Prisma
```bash
npm install
npx prisma generate
