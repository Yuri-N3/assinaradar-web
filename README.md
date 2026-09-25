# AssinaRadar — Interface web

Painel de assinaturas em HTML, CSS e JavaScript, servido por Nginx. Este é um componente independente com repositório e Dockerfile próprios.

## Executar o sistema

Requer Docker Desktop em execução e Git. Clone os três repositórios em pastas irmãs:

```powershell
git clone https://github.com/Yuri-N3/assinaradar-api.git
git clone https://github.com/Yuri-N3/assinaradar-analytics.git
git clone https://github.com/Yuri-N3/assinaradar-web.git
cd assinaradar-api
docker compose up --build -d --wait
```

Abra http://localhost:8000/. Swagger principal: http://localhost:8000/docs. Swagger da análise: http://localhost:8001/docs. A API principal também está disponível diretamente em http://localhost:8002/docs.

Para encerrar, execute `docker compose down` na pasta da API principal. O volume SQLite permanece salvo. Não é necessário instalar Node.js ou bibliotecas de front-end.

## Funcionalidades

Cadastro, edição, exclusão com confirmação, busca por nome/categoria, filtro por situação, custo mensal e anual, distribuição por categoria, projeções de 3 a 24 meses e simulação de economia. A lista destaca cobranças previstas nos próximos sete dias e datas passadas que precisam de revisão; não indica inadimplência nem registra pagamentos.

## Comunicação

O navegador utiliza URLs da própria origem. O Nginx encaminha as requisições à API principal pelo nome `api` na rede Docker. A API principal persiste no SQLite e consulta os demais serviços.

| Interação | Requisição |
| --- | --- |
| Carregar a lista | GET /assinaturas |
| Salvar novo cadastro | POST /assinaturas |
| Editar ou marcar cancelamento | PUT /assinaturas/{id} |
| Confirmar exclusão | DELETE /assinaturas/{id} |
| Painel, categorias, projeção e economia | GET /analises/{tipo} |

São usadas as quatro operações HTTP exigidas pelo PDF. Os filtros visuais agem sobre os registros carregados; a API também fornece filtros e paginação próprios. Categorias e nomes inseridos pelo usuário são renderizados como texto, sem interpretar HTML.

## Arquivos

- `index.html`: estrutura e formulários acessíveis.
- `style.css`: layout adaptável.
- `app.js`: estado da tela, comunicação e interações.
- `nginx.conf`: proxy HTTP e arquivos estáticos.
- `Dockerfile`: imagem do componente.

Para desenvolver, edite os arquivos e execute `docker compose up --build -d web` na pasta da API principal. A imagem pode ser construída isoladamente com `docker build -t assinaradar-web .`; para integração use o Compose, que cria a rede e os serviços necessários.
